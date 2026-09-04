import React from 'react';
import { useVoiceSession } from './hooks/useVoiceSession';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { useAudioPlayback } from './hooks/useAudioPlayback';
import { VoiceOrb } from './components/VoiceOrb';
import { TranscriptView } from './components/TranscriptView';
import { LatencyPanel } from './components/LatencyPanel';

export default function App() {
  const {
    agentState,
    sessionId,
    partialTranscript,
    finalTranscript,
    aiResponseText,
    metrics,
    error,
    sendAudioChunk,
    interrupt,
  } = useVoiceSession();

  const { isPlaying, enqueueAudioChunk, stopPlayback } = useAudioPlayback();
  const { isRecording, startRecording, stopRecording } = useAudioRecorder((chunk) => {
    sendAudioChunk(chunk);
  });

  const handleOrbClick = () => {
    if (isRecording) {
      stopRecording();
      interrupt();
      stopPlayback();
    } else {
      startRecording();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-6">
      <header className="w-full max-w-2xl flex items-center justify-between border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold tracking-wider bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
          Real-Time Voice Agent
        </h1>
        <div className="flex items-center space-x-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-slate-400 font-mono">Session: {sessionId ? sessionId.slice(0, 8) : 'Connecting...'}</span>
        </div>
      </header>

      <main className="w-full max-w-2xl flex flex-col items-center space-y-6 my-auto">
        {error && (
          <div className="w-full p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}

        <VoiceOrb state={agentState} onClick={handleOrbClick} />

        <div className="text-center">
          <p className="text-sm font-medium text-slate-300 capitalize">
            Status: <span className="text-blue-400">{agentState}</span> {isRecording && '(Recording...)'}
          </p>
        </div>

        <TranscriptView
          partialTranscript={partialTranscript}
          finalTranscript={finalTranscript}
          aiResponseText={aiResponseText}
        />

        <LatencyPanel metrics={metrics} />
      </main>

      <footer className="w-full max-w-2xl text-center border-t border-slate-800 pt-4 text-xs text-slate-500">
        Hackathon Production-Grade Voice Pipeline (AssemblyAI + Gemini + ElevenLabs)
      </footer>
    </div>
  );
}