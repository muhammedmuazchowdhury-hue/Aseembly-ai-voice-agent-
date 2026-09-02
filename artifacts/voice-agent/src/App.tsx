import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getHealthCheckQueryKey,
  useHealthCheck,
  useProcessVoiceTurn,
} from '@workspace/api-client-react';
import {
  Activity,
  ArrowUpRight,
  Check,
  CircleAlert,
  Clock3,
  Headphones,
  LoaderCircle,
  Mic,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Volume2,
  Waves,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type RecordingState = 'idle' | 'recording' | 'processing' | 'complete' | 'error';
type VoiceTurnResult = {
  requestId: string;
  transcript: string;
  responseText: string;
  audioBase64: string;
  audioMimeType: string;
  timings: {
    totalMs: number;
    transcriptionMs: number;
    responseMs: number;
    speechMs: number;
  };
};

function encodeAudio(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unable to read the recording.'));
        return;
      }
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error('Unable to read the recording.'));
    reader.readAsDataURL(blob);
  });
}

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `0:${String(seconds).padStart(2, '0')}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const apiError = error as { error?: string };
    if (apiError.error) return apiError.error;
  }
  return 'We could not process that recording. Please try again.';
}

function Home() {
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<VoiceTurnResult | null>(null);
  const [recordingError, setRecordingError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const health = useHealthCheck({
    query: {
      queryKey: getHealthCheckQueryKey(),
      refetchInterval: 30_000,
      retry: false,
    },
  });
  const processVoiceTurn = useProcessVoiceTurn();

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const reset = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setResult(null);
    setRecordingError('');
    setElapsed(0);
    setState('idle');
  };

  const submitRecording = async (blob: Blob) => {
    try {
      const audioBase64 = await encodeAudio(blob);
      if (!audioBase64) throw new Error('The recording was empty.');
      setState('processing');
      processVoiceTurn.mutate(
        { data: { audioBase64, audioMimeType: 'audio/webm' } },
        {
          onSuccess: (voiceResult) => {
            setResult(voiceResult);
            setState('complete');
          },
          onError: (error) => {
            setRecordingError(getErrorMessage(error));
            setState('error');
          },
        },
      );
    } catch (error) {
      setRecordingError(getErrorMessage(error));
      setState('error');
    }
  };

  const stopRecording = () => {
    if (!recorderRef.current || state !== 'recording') return;
    recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setState('processing');
  };

  const startRecording = async () => {
    if (state === 'processing') return;
    if (state === 'complete' || state === 'error') reset();
    setRecordingError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Voice recording is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        void submitRecording(blob);
        recorderRef.current = null;
      };
      recorder.start();
      setElapsed(0);
      setState('recording');
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startedAtRef.current);
      }, 100);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setRecordingError(
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'Microphone access is off. Allow it in your browser settings, then try again.'
          : getErrorMessage(error),
      );
      setState('error');
    }
  };

  const togglePlayback = async () => {
    if (!audioRef.current || !result) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch {
      setRecordingError('Audio playback was blocked. Tap play again to listen.');
      setState('error');
    }
  };

  const statusLabel = state === 'recording'
    ? 'Listening'
    : state === 'processing'
      ? 'Thinking'
      : state === 'complete'
        ? 'Ready'
        : 'Stand by';
  const serviceLabel = health.isLoading
    ? 'Checking service'
    : health.data?.status === 'ok'
      ? 'Service online'
      : 'Service unavailable';
  const serviceIsOnline = health.data?.status === 'ok';

  return (
    <div className="voice-page bg-background text-foreground">
      <header className="relative z-10 mx-auto flex w-full max-w-[1320px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3" data-testid="brand-voice-agent">
          <div className="grid size-9 place-items-center rounded-full bg-secondary text-primary-foreground">
            <Waves size={18} strokeWidth={1.8} />
          </div>
          <span className="text-[15px] font-extrabold tracking-[-0.03em]">Voice Agent</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-2 text-[11px] font-semibold text-muted-foreground shadow-sm" data-testid="status-service">
          <span className="relative flex size-2">
            <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-40 ${serviceIsOnline ? 'bg-primary' : 'bg-accent'}`} />
            <span className={`relative inline-flex size-2 rounded-full ${serviceIsOnline ? 'bg-primary' : 'bg-accent'}`} />
          </span>
          <span>{serviceLabel}</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-[1320px] grid-cols-1 gap-10 px-5 pb-12 pt-10 sm:px-8 md:pt-16 lg:grid-cols-[minmax(250px,0.7fr)_minmax(580px,1.3fr)] lg:gap-20 lg:px-20 lg:pb-20 lg:pt-20">
        <section className="reveal flex flex-col justify-between lg:min-h-[650px]" aria-labelledby="page-title">
          <div>
            <div className="mb-7 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-primary">
              <Activity size={13} />
              <span>One turn, made clear</span>
            </div>
            <h1 id="page-title" className="max-w-[390px] text-[clamp(3.2rem,8vw,6.7rem)] font-medium leading-[.91] tracking-[-0.065em] text-secondary">
              Say it.<br />
              <span className="font-serif italic text-primary">Hear back.</span>
            </h1>
            <p className="mt-8 max-w-[330px] text-[15px] leading-7 text-muted-foreground">
              A focused voice companion for the moments when typing gets in the way. Ask one thing, and get a thoughtful answer out loud.
            </p>
          </div>

          <div className="mt-10 hidden border-t border-border pt-5 lg:block">
            <div className="flex items-start gap-3 text-muted-foreground">
              <ShieldCheck className="mt-0.5 text-primary" size={17} strokeWidth={1.6} />
              <div>
                <p className="text-[12px] font-bold text-secondary">A private, single-turn exchange</p>
                <p className="mt-1 max-w-[230px] text-[11px] leading-5">Your recording is sent securely to the assistant and is not kept in this browser.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="reveal reveal-delay-1" aria-label="Voice interaction">
          <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_24px_70px_rgba(25,56,67,.1)]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-7">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-accent" />
                <span>{statusLabel}</span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">EN / 01</span>
            </div>

            <div className="flex min-h-[485px] flex-col items-center justify-center px-6 py-12 sm:min-h-[550px]">
              {state === 'idle' && (
                <div className="reveal text-center">
                  <div className="mx-auto mb-8 grid size-[172px] place-items-center rounded-full border border-primary/20 bg-primary/5">
                    <div className="grid size-[128px] place-items-center rounded-full border border-primary/20 bg-primary/10">
                      <div className="grid size-[92px] place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(69,145,130,.24)]">
                        <Mic size={34} strokeWidth={1.6} />
                      </div>
                    </div>
                  </div>
                  <p className="font-serif text-[24px] font-medium tracking-[-0.03em] text-secondary">What’s on your mind?</p>
                  <p className="mx-auto mt-2 max-w-[250px] text-[13px] leading-5 text-muted-foreground">Tap the microphone and speak naturally. Keep it short and specific.</p>
                  <button
                    type="button"
                    onClick={() => void startRecording()}
                    className="mt-8 inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3.5 text-[13px] font-bold text-secondary-foreground transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    data-testid="button-start-recording"
                  >
                    <Mic size={16} />
                    Start recording
                  </button>
                </div>
              )}

              {state === 'recording' && (
                <div className="reveal text-center">
                  <div className="relative mx-auto mb-8 grid size-[184px] place-items-center">
                    <div className="record-ripple absolute inset-0 rounded-full border border-accent/70" />
                    <div className="record-ripple absolute inset-5 rounded-full border border-accent/50 [animation-delay:.45s]" />
                    <div className="record-orbit relative grid size-[124px] place-items-center rounded-full bg-accent text-accent-foreground shadow-[0_12px_30px_rgba(244,125,91,.28)]">
                      <Square size={28} fill="currentColor" strokeWidth={0} />
                    </div>
                  </div>
                  <p className="font-serif text-[25px] font-medium tracking-[-0.03em] text-secondary">I’m listening<span className="text-accent">.</span></p>
                  <div className="mt-3 font-mono text-[13px] text-muted-foreground" data-testid="text-recording-duration">{formatDuration(elapsed)}</div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="mt-8 inline-flex items-center gap-2 rounded-full border border-accent bg-accent/10 px-6 py-3.5 text-[13px] font-bold text-secondary transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    data-testid="button-stop-recording"
                  >
                    <Square size={14} fill="currentColor" />
                    Finish turn
                  </button>
                </div>
              )}

              {state === 'processing' && (
                <div className="reveal w-full max-w-[360px] text-center" data-testid="status-processing">
                  <div className="mx-auto mb-8 grid size-24 place-items-center rounded-full bg-secondary text-primary-foreground">
                    <LoaderCircle className="animate-spin text-primary" size={32} strokeWidth={1.5} />
                  </div>
                  <p className="font-serif text-[25px] font-medium tracking-[-0.03em] text-secondary">Finding the right words<span className="text-primary">.</span></p>
                  <p className="mt-2 text-[13px] text-muted-foreground">Transcribing, thinking, and speaking back.</p>
                  <div className="mx-auto mt-8 space-y-2.5 text-left">
                    <div className="skeleton-line h-2.5 w-full rounded-full" />
                    <div className="skeleton-line h-2.5 w-[74%] rounded-full" />
                    <div className="skeleton-line h-2.5 w-[88%] rounded-full" />
                  </div>
                </div>
              )}

              {state === 'complete' && result && (
                <div className="reveal w-full max-w-[460px]">
                  <div className="mb-7 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                      <Check size={15} strokeWidth={2.5} />
                      Turn complete
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{result.requestId.slice(0, 8)}</span>
                  </div>
                  <div className="border-l-2 border-primary/35 pl-5">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">You said</p>
                    <p className="mt-2 text-[17px] leading-7 text-secondary" data-testid="text-transcript">{result.transcript}</p>
                  </div>
                  <div className="mt-8 rounded-2xl bg-secondary p-5 text-secondary-foreground sm:p-6">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-primary">Voice Agent</p>
                    <p className="mt-3 font-serif text-[25px] leading-[1.2] tracking-[-0.025em]" data-testid="text-response">{result.responseText}</p>
                    <div className="mt-6 flex items-center justify-between border-t border-primary-foreground/15 pt-4">
                      <button
                        type="button"
                        onClick={() => void togglePlayback()}
                        className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-secondary"
                        data-testid="button-play-response"
                      >
                        {isPlaying ? <Square size={13} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        {isPlaying ? 'Pause answer' : 'Play answer'}
                      </button>
                      <div className="flex items-center gap-1.5 text-[11px] text-primary-foreground/60">
                        <Volume2 size={14} />
                        <span>{Math.max(1, Math.round(result.timings.speechMs / 1000))} sec</span>
                      </div>
                    </div>
                  </div>
                  <audio
                    ref={audioRef}
                    src={`data:${result.audioMimeType};base64,${result.audioBase64}`}
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                    data-testid="audio-response"
                  />
                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock3 size={13} />
                      <span>Answered in {(result.timings.totalMs / 1000).toFixed(1)}s</span>
                    </div>
                    <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-secondary underline decoration-border underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" data-testid="button-new-turn">
                      <RotateCcw size={13} />
                      New turn
                    </button>
                  </div>
                </div>
              )}

              {state === 'error' && (
                <div className="reveal max-w-[370px] text-center" data-testid="status-error">
                  <div className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-accent/15 text-accent-foreground">
                    <CircleAlert size={28} strokeWidth={1.5} />
                  </div>
                  <p className="font-serif text-[25px] font-medium tracking-[-0.03em] text-secondary">That didn’t come through.</p>
                  <p className="mt-2 text-[13px] leading-5 text-muted-foreground">{recordingError}</p>
                  <button type="button" onClick={() => void startRecording()} className="mt-7 inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-3.5 text-[13px] font-bold text-secondary-foreground transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" data-testid="button-retry-recording">
                    <RotateCcw size={15} />
                    Try again
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-border px-5 py-4 text-[11px] text-muted-foreground sm:px-7">
              <Headphones size={14} className="text-primary" />
              <span>For best results, find a quiet spot.</span>
              <ArrowUpRight size={13} className="ml-auto opacity-60" />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-center text-[11px] text-muted-foreground lg:justify-end">
            <ShieldCheck size={14} className="text-primary" />
            <span>Audio is encrypted in transit</span>
          </div>
        </section>
      </main>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
