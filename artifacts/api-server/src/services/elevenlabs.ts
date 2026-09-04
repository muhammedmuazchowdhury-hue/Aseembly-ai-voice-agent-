import { config } from '../lib/config';

export class ElevenLabsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502
  ) {
    super(message);
    this.name = 'ElevenLabsError';
  }
}

function getApiKey(): string {
  const key = config.elevenLabsApiKey || process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new ElevenLabsError(
      'CONFIGURATION_ERROR',
      'ElevenLabs API key is not configured.',
      503
    );
  }
  return key;
}

// Stream audio response for real-time streaming mode
export async function* streamTextToSpeech(
  text: string,
  signal: AbortSignal,
  voiceId = config.elevenLabsVoiceId
): AsyncIterable<Buffer> {
  const apiKey = getApiKey();

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
      signal,
    }
  );

  if (!response.ok || !response.body) {
    throw new ElevenLabsError(
      'TTS_GENERATION_FAILED',
      `ElevenLabs request failed with status ${response.status}`
    );
  }

  const reader = response.body.getReader();

  while (true) {
    if (signal.aborted) {
      reader.cancel();
      break;
    }

    const { done, value } = await reader.read();
    if (done) break;

    if (value) {
      yield Buffer.from(value);
    }
  }
}

// Fallback method for batch synthesis
export async function generateSpeech(
  text: string,
  signal: AbortSignal,
  voiceId = config.elevenLabsVoiceId
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of streamTextToSpeech(text, signal, voiceId)) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}