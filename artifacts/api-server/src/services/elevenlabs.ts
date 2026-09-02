import { ProviderError } from "./assemblyai";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech";

function getElevenLabsConfig(): { apiKey: string; voiceId: string } {
  const apiKey = process.env.Eleven_ai_key;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    throw new ProviderError(
      "CONFIGURATION_ERROR",
      "ElevenLabs is not configured.",
      503,
    );
  }

  return { apiKey, voiceId };
}

async function readElevenLabsError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: { message?: string } | string;
    };
    const detail =
      typeof payload.detail === "string"
        ? payload.detail
        : payload.detail?.message;
    return (
      detail ??
      `ElevenLabs request failed with ${response.status}.`
    );
  } catch {
    return `ElevenLabs request failed with ${response.status}.`;
  }
}

export async function synthesizeSpeech(
  text: string,
  signal: AbortSignal,
): Promise<Buffer> {
  const { apiKey, voiceId } = getElevenLabsConfig();

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
      signal,
    },
  );

  if (!response.ok) {
    throw new ProviderError("TTS_FAILED", await readElevenLabsError(response));
  }

  return Buffer.from(await response.arrayBuffer());
}