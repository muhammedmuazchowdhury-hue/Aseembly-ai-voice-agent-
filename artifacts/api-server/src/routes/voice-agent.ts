import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { ProcessVoiceTurnBody } from "@workspace/api-zod";
import { generateResponse } from "../services/gemini";
import {
  ProviderError,
  transcribeAudio,
} from "../services/assemblyai";
import { synthesizeSpeech } from "../services/elevenlabs";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 4;
const REQUEST_TIMEOUT_MS = 90_000;

const router: IRouter = Router();

function getRequestId(req: { id?: unknown }): string {
  return typeof req.id === "string" || typeof req.id === "number"
    ? String(req.id)
    : randomUUID();
}

function decodeAudio(audioBase64: string): Buffer {
  if (audioBase64.length > MAX_BASE64_LENGTH) {
    throw new ProviderError(
      "AUDIO_TOO_LARGE",
      "The recording is too large. Please keep it under 8 MB.",
      413,
    );
  }

  const audio = Buffer.from(audioBase64, "base64");
  if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
    throw new ProviderError(
      "INVALID_AUDIO",
      "Please provide a valid audio recording under 8 MB.",
      400,
    );
  }

  return audio;
}

function sendError(
  res: Parameters<Parameters<IRouter["post"]>[1]>[1],
  requestId: string,
  error: unknown,
): void {
  if (error instanceof ProviderError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
      requestId,
    });
    return;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    res.status(504).json({
      error: "The voice request timed out.",
      code: "REQUEST_TIMEOUT",
      requestId,
    });
    return;
  }

  res.status(502).json({
    error: "The voice assistant could not complete the request.",
    code: "PIPELINE_FAILED",
    requestId,
  });
}

router.post("/voice-agent/turn", async (req, res) => {
  const requestId = getRequestId(req);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("request-timeout"),
    REQUEST_TIMEOUT_MS,
  );

  req.on("aborted", () => {
    controller.abort("client-aborted");
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      controller.abort("client-disconnected");
    }
  });

  try {
    const parsed = ProcessVoiceTurnBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "The audio request is invalid.",
        code: "INVALID_REQUEST",
        requestId,
      });
      return;
    }

    const audio = decodeAudio(parsed.data.audioBase64);

    const transcriptionStartedAt = Date.now();
    const transcript = await transcribeAudio(audio, controller.signal);
    const transcriptionMs = Date.now() - transcriptionStartedAt;

    const responseStartedAt = Date.now();
    const responseText = await generateResponse(
      transcript,
      controller.signal,
    );
    const responseMs = Date.now() - responseStartedAt;

    const speechStartedAt = Date.now();
    const audioBuffer = await synthesizeSpeech(
      responseText,
      controller.signal,
    );
    const speechMs = Date.now() - speechStartedAt;

    res.json({
      requestId,
      transcript,
      responseText,
      audioBase64: audioBuffer.toString("base64"),
      audioMimeType: "audio/mpeg",
      timings: {
        totalMs: Date.now() - startedAt,
        transcriptionMs,
        responseMs,
        speechMs,
      },
    });
  } catch (error) {
    if (!res.headersSent) {
      sendError(res, requestId, error);
    }
  } finally {
    clearTimeout(timeout);
  }
});

export default router;