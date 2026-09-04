import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';
import { createRealtimeTranscriber } from '../services/assemblyai';
import { generateChatResponseStream } from '../services/gemini';
import { streamTextToSpeech } from '../services/elevenlabs';
import { sessionManager } from '../services/voice-session';

export async function voiceAgentRoute(fastify: FastifyInstance) {
  fastify.get('/api/voice-agent/stream', { websocket: true }, (connection: { socket: WebSocket }, req: FastifyRequest) => {
    const socket = connection.socket;
    const urlParams = new URL(req.url, `http://${req.headers.host}`);
    const sessionIdParam = urlParams.searchParams.get('sessionId');
    
    // Session initialization
    const session = sessionIdParam ? sessionManager.getSession(sessionIdParam) || sessionManager.createSession() : sessionManager.createSession();

    // Send session started event
    socket.send(JSON.stringify({ type: 'session.started', sessionId: session.id }));
    console.log(`Voice session connected: ${session.id}`);

    let activeController: AbortController | null = null;

    // Initialize AssemblyAI Realtime Transcriber
    createRealtimeTranscriber(
      (partialText) => {
        // Send partial transcript
        socket.send(JSON.stringify({ type: 'transcript.partial', text: partialText }));
      },
      async (finalText) => {
        const transcriptionStartedAt = Date.now();
        console.log(`User (Final): ${finalText}`);
        socket.send(JSON.stringify({ type: 'transcript.final', text: finalText }));
        const transcriptionMs = Date.now() - transcriptionStartedAt;

        // Handle barge-in: abort ongoing LLM/TTS generation
        if (activeController) {
          activeController.abort();
        }
        activeController = new AbortController();
        const signal = activeController.signal;

        try {
          let fullAIResponse = '';
          let llmFirstTokenMs = 0;
          let ttsFirstAudioMs = 0;
          const llmStartedAt = Date.now();
          let isFirstToken = true;

          const textStream = generateChatResponseStream(finalText, session, signal);

          for await (const chunk of textStream) {
            if (signal.aborted) break;
            if (isFirstToken) {
              llmFirstTokenMs = Date.now() - llmStartedAt;
              isFirstToken = false;
            }
            fullAIResponse += chunk;
            
            // Send assistant text delta
            socket.send(JSON.stringify({ type: 'assistant.text.delta', text: chunk }));
          }

          if (signal.aborted) return;

          // Stream audio using ElevenLabs TTS
          const ttsStartedAt = Date.now();
          let isFirstAudio = true;
          const audioStream = streamTextToSpeech(fullAIResponse, signal);

          for await (const audioChunk of audioStream) {
            if (signal.aborted) break;
            if (isFirstAudio) {
              ttsFirstAudioMs = Date.now() - ttsStartedAt;
              isFirstAudio = false;
            }
            
            // Send binary or base64 audio chunk via JSON contract
            socket.send(
              JSON.stringify({
                type: 'assistant.audio.chunk',
                audio: audioChunk.toString('base64'),
                mimeType: 'audio/mpeg',
              })
            );
          }

          if (signal.aborted) return;

          // Turn completed with granular latency metrics
          socket.send(
            JSON.stringify({
              type: 'turn.completed',
              metrics: {
                transcriptionMs,
                llmFirstTokenMs,
                ttsFirstAudioMs,
                totalMs: Date.now() - transcriptionStartedAt,
              },
            })
          );
        } catch (error: any) {
          if (error.name === 'AbortError' || signal.aborted) {
            console.log('Voice turn was interrupted/cancelled by user barge-in.');
          } else {
            console.error('Error processing voice turn:', error);
            socket.send(
              JSON.stringify({
                type: 'turn.failed',
                stage: 'pipeline',
                code: 'PIPELINE_ERROR',
                message: error.message,
              })
            );
          }
        }
      }
    ).then((transcriber) => {
      // Receive raw microphone audio chunks from browser client
      socket.on('message', async (data: Buffer | string) => {
        try {
          if (Buffer.isBuffer(data)) {
            transcriber.sendAudio(data);
          } else {
            // Handle control messages if any (e.g., explicit barge-in signal)
            const parsed = JSON.parse(data.toString());
            if (parsed.type === 'interrupt') {
              if (activeController) {
                activeController.abort();
              }
              sessionManager.interruptSession(session.id);
            }
          }
        } catch (err) {
          console.error('Error handling incoming socket message:', err);
        }
      });

      socket.on('close', () => {
        console.log(`Voice session closed: ${session.id}`);
        transcriber.close();
        if (activeController) {
          activeController.abort();
        }
      });
    }).catch((err) => {
      console.error('Failed to start Realtime Transcriber:', err);
      socket.send(
        JSON.stringify({
          type: 'turn.failed',
          stage: 'transcription',
          code: 'ASSEMBLY_CONNECTION_FAILED',
          message: 'Transcription connection failed',
        })
      );
      socket.close();
    });
  });
}