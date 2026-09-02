import { ProviderError } from "./assemblyai";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = [
  "You are a concise global English voice assistant.",
  "Reply in natural spoken English using one or two short sentences.",
  "Do not use markdown, bullet points, emojis, or stage directions.",
  "Ask one clarifying question when the request is ambiguous.",
  "Do not claim to have performed an action unless it was actually performed.",
  "Keep the response easy to understand when spoken aloud.",
].join(" ");

function getGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new ProviderError(
      "CONFIGURATION_ERROR",
      "Gemini is not configured.",
      503,
    );
  }
  return key;
}

async function readGeminiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    return (
      payload.error?.message ?? `Gemini request failed with ${response.status}.`
    );
  } catch {
    return `Gemini request failed with ${response.status}.`;
  }
}

export async function generateResponse(
  promptText: string,
  signal: AbortSignal,
): Promise<string> {
  const key = getGeminiKey();

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        temperature: 0.4,
      },
    }),
    signal,
  });

  if (!response.ok) {
    throw new ProviderError("LLM_FAILED", await readGeminiError(response));
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new ProviderError(
      "LLM_EMPTY",
      "Gemini returned an empty response.",
    );
  }

  return text;
}