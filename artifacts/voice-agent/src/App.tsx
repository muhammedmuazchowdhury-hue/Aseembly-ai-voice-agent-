import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

import { useVoiceAgent } from './hooks/useVoiceAgent';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import { VoiceOrb } from './components/VoiceOrb';
import { TranscriptView } from './components/TranscriptView';
import { LatencyPanel } from './components/LatencyPanel';

const queryClient = new QueryClient();

function Home() {
  const {
    isConnected,
    sessionId,
    isProcessing,
    isPlaying,
    userText,
    assistantText,
    triggerMockSpeech,
    handleInterrupt,
    sendAudioChunk,
  } = useVoiceAgent();

  // মাইক্রোফোনের রেকর্ডকৃত অডিও সরাসরি সকেটে পাঠানোর কানেকশন
  const { isRecording, startRecording, stopRecording } = useAudioRecorder((chunk) => {
    if (sendAudioChunk) {
      sendAudioChunk(chunk);
    }
  });

  // রেকর্ডিং চলাকালে 'listening', প্রসেসিংয়ে 'thinking', অডিও প্লেব্যাকের সময় 'speaking'
  const agentState = isPlaying
    ? 'speaking'
    : isProcessing
    ? 'thinking'
    : isRecording
    ? 'listening'
    : isConnected
    ? 'idle'
    : 'connecting';

  const handleOrbClick = () => {
    if (isPlaying) {
      handleInterrupt();
    } else if (isRecording) {
      stopRecording();
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
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span className="text-slate-400 font-mono">
            Session: {sessionId ? sessionId.slice(0, 8) : isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>
      </header>

      <main className="w-full max-w-2xl flex flex-col items-center space-y-6 my-auto">
        <VoiceOrb state={agentState as any} onClick={handleOrbClick} />

        <div className="text-center">
          <p className="text-sm font-medium text-slate-300 capitalize">
            Status: <span className="text-blue-400">{agentState}</span> {isRecording && '(Recording...)'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => triggerMockSpeech()}
            disabled={!isConnected || isProcessing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-semibold rounded-lg transition-colors shadow-lg cursor-pointer"
          >
            ⚡ Test Mock Speech
          </button>
          <button
            onClick={handleInterrupt}
            disabled={!isPlaying && !isProcessing}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold rounded-lg transition-colors shadow-lg cursor-pointer"
          >
            🛑 Interrupt
          </button>
        </div>

        <TranscriptView
          partialTranscript=""
          finalTranscript={userText}
          aiResponseText={assistantText}
        />

        <LatencyPanel metrics={null} />
      </main>

      <footer className="w-full max-w-2xl text-center border-t border-slate-800 pt-4 text-xs text-slate-500">
        Hackathon Production-Grade Voice Pipeline (AssemblyAI + Gemini + ElevenLabs)
      </footer>
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, '') : ''}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}