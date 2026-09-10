import { useState, useEffect, useRef, useCallback } from 'react';

export type AgentState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

export interface LatencyMetrics {
  transcriptionMs: number;
  llmFirstTokenMs: number;
  ttsFirstAudioMs: number;
  totalMs: number;
}

export function useVoiceSession(customServerUrl?: string) {
  const getWsUrl = useCallback(() => {
    if (typeof window === 'undefined') return 'ws://localhost:10000/api/voice-agent/stream';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/voice-agent/stream`;
  }, []);

  const serverUrl = customServerUrl || getWsUrl();

  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  const [metrics, setMetrics] = useState<LatencyMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopCurrentAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      currentAudioRef.current = null;
    }
  }, []);

  const playNextAudioChunk = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setAgentState('idle');
      return;
    }

    isPlayingRef.current = true;
    setAgentState('speaking');
    const base64Audio = audioQueueRef.current.shift()!;

    fetch(`data:audio/mpeg;base64,${base64Audio}`)
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;

        const cleanup = () => {
          URL.revokeObjectURL(url);
          if (currentAudioRef.current === audio) {
            currentAudioRef.current = null;
          }
        };

        audio.onended = () => {
          cleanup();
          playNextAudioChunk();
        };

        audio.onerror = () => {
          console.error('Audio playback error');
          cleanup();
          playNextAudioChunk();
        };

        audio.play().catch((err) => {
          console.error('Playback failed:', err);
          cleanup();
          playNextAudioChunk();
        });
      })
      .catch((err) => {
        console.error('Failed to parse audio blob:', err);
        playNextAudioChunk();
      });
  }, []);

  const enqueueAudio = useCallback((base64Audio: string) => {
    audioQueueRef.current.push(base64Audio);
    if (!isPlayingRef.current) {
      playNextAudioChunk();
    }
  }, [playNextAudioChunk]);

  useEffect(() => {
    const ws = new WebSocket(serverUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to Voice Agent WebSocket at:', serverUrl);
      setError(null);
      setAgentState('listening');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'session.started':
            setSessionId(data.sessionId);
            break;
          case 'transcript.partial':
            setAgentState('listening');
            setPartialTranscript(data.text);
            break;
          case 'transcript.final':
            setFinalTranscript(data.text);
            setPartialTranscript('');
            setAiResponseText('');
            setAgentState('thinking');
            break;
          case 'assistant.text.delta':
            setAiResponseText((prev) => prev + data.text);
            break;
          case 'assistant.audio.chunk':
            enqueueAudio(data.audio);
            break;
          case 'turn.completed':
            setMetrics(data.metrics);
            break;
          case 'turn.failed':
            setError(data.message || 'An error occurred during the voice turn.');
            setAgentState('idle');
            break;
          default:
            console.warn('Unknown message type:', data.type);
        }
      } catch (err) {
        console.error('Failed to parse incoming WebSocket message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('WebSocket connection error');
      setAgentState('idle');
    };

    ws.onclose = () => {
      console.log('Voice session disconnected');
      setAgentState('idle');
    };

    return () => {
      stopCurrentAudio();
      ws.close();
    };
  }, [serverUrl, enqueueAudio, stopCurrentAudio]);

  const sendAudioChunk = useCallback((pcmChunk: ArrayBuffer) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(pcmChunk);
    }
  }, []);

  const interrupt = useCallback(() => {
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    stopCurrentAudio();

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'interrupt' }));
    }
    setAgentState('listening');
  }, [stopCurrentAudio]);

  return {
    agentState,
    sessionId,
    partialTranscript,
    finalTranscript,
    aiResponseText,
    metrics,
    error,
    sendAudioChunk,
    interrupt,
  };
}