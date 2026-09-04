import { AssemblyAI, RealtimeTranscriber } from 'assemblyai';
import { config } from '../lib/config';

const ASSEMBLY_BASE_URL = 'https://api.assemblyai.com/v2';
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 45;

export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

function getAssemblyKey(): string {
  const key = config.assemblyAiApiKey || process.env.ASSEMBLYAI_API_KEY || process.env.assembly_api_key;
  if (!key) {
    throw new ProviderError(
      'CONFIGURATION_ERROR',
      'AssemblyAI is not configured.',
      503
    );
  }
  return key;
}

function readProviderError(response: Response): Promise<string> {
  return response.json().then((payload: any) => payload?.error ?? `AssemblyAI request failed with ${response.status}.`)
    .catch(() => `AssemblyAI request failed with ${response.status}.`);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('The voice turn was cancelled.', 'AbortError');
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException('The voice turn was cancelled.', 'AbortError'));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// Mode 2: Reliable Fallback Batch Transcribe (From existing codebase)
export async function transcribeAudio(
  audio: Buffer,
  signal: AbortSignal
): Promise<string> {
  const key = getAssemblyKey();
  throwIfAborted(signal);

  const uploadResponse = await fetch(`${ASSEMBLY_BASE_URL}/upload`, {
    method: 'POST',
    headers: {
      authorization: key,
      'content-type': 'application/octet-stream',
    },
    body: audio,
    signal,
  });

  if (!uploadResponse.ok) {
    throw new ProviderError(
      'TRANSCRIPTION_UPLOAD_FAILED',
      await readProviderError(uploadResponse)
    );
  }

  const uploadPayload = (await uploadResponse.json()) as { upload_url?: string };

  if (!uploadPayload.upload_url) {
    throw new ProviderError(
      'TRANSCRIPTION_UPLOAD_FAILED',
      'AssemblyAI did not return an upload URL.'
    );
  }

  const transcriptResponse = await fetch(`${ASSEMBLY_BASE_URL}/transcript`, {
    method: 'POST',
    headers: {
      authorization: key,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: uploadPayload.upload_url,
      speech_model: 'nano',
      language_detection: true,
    }),
    signal,
  });

  if (!transcriptResponse.ok) {
    throw new ProviderError(
      'TRANSCRIPTION_REQUEST_FAILED',
      await readProviderError(transcriptResponse)
    );
  }

  const transcriptJob = (await transcriptResponse.json()) as { id?: string };

  if (!transcriptJob.id) {
    throw new ProviderError(
      'TRANSCRIPTION_REQUEST_FAILED',
      'AssemblyAI did not return a transcript job ID.'
    );
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await wait(POLL_INTERVAL_MS, signal);

    const pollResponse = await fetch(
      `${ASSEMBLY_BASE_URL}/transcript/${transcriptJob.id}`,
      {
        headers: { authorization: key },
        signal,
      }
    );

    if (!pollResponse.ok) {
      throw new ProviderError(
        'TRANSCRIPTION_POLL_FAILED',
        await readProviderError(pollResponse)
      );
    }

    const result = (await pollResponse.json()) as {
      status?: 'queued' | 'processing' | 'completed' | 'error';
      text?: string;
      error?: string;
    };

    if (result.status === 'completed') {
      const text = result.text?.trim();
      if (!text) {
        throw new ProviderError(
          'TRANSCRIPTION_EMPTY',
          'No spoken words were detected in the recording.',
          422
        );
      }
      return text;
    }

    if (result.status === 'error') {
      throw new ProviderError(
        'TRANSCRIPTION_FAILED',
        result.error ?? 'AssemblyAI could not transcribe the recording.'
      );
    }
  }

  throw new ProviderError(
    'TRANSCRIPTION_TIMEOUT',
    'AssemblyAI transcription took too long.',
    504
  );
}

// Mode 1: Low-Latency Realtime Streaming Transcribe (For WebSocket Mode)
export async function createRealtimeTranscriber(
  onPartial: (text: string) => void,
  onFinal: (text: string) => void
): Promise<RealtimeTranscriber> {
  const apiKey = getAssemblyKey();
  const aai = new AssemblyAI({ apiKey });

  const rt = aai.realtime.transcriber({
    sampleRate: 16000,
    endUtteranceSilenceThreshold: 1000,
  });

  rt.on('transcript', (message) => {
    if (!message.text) return;

    if (message.message_type === 'PartialTranscript') {
      onPartial(message.text);
    } else if (message.message_type === 'FinalTranscript') {
      onFinal(message.text);
    }
  });

  rt.on('error', (error) => {
    console.error('AssemblyAI Realtime Error:', error);
  });

  rt.on('close', (code, reason) => {
    console.log(`AssemblyAI Connection Closed: ${code} - ${reason}`);
  });

  await rt.connect();
  return rt;
}