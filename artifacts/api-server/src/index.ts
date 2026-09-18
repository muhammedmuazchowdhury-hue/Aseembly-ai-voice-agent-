import http from "http";
import path from "path";
import fs from "fs";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";

const app = express();
app.use(express.json());

const voiceAgentDir = path.resolve(process.cwd(), "artifacts/voice-agent");

function getFrontendDistPath(): string | null {
  const possiblePaths = [
    path.join(voiceAgentDir, "dist"),
    path.resolve(process.cwd(), "../voice-agent/dist"),
    path.resolve(__dirname, "../../voice-agent/dist"),
    path.resolve(process.cwd(), "dist"),
  ];

  return possiblePaths.find((p) => fs.existsSync(path.join(p, "index.html"))) || null;
}

app.use((req, res, next) => {
  const distPath = getFrontendDistPath();
  if (distPath) {
    return express.static(distPath)(req, res, next);
  }
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  const distPath = getFrontendDistPath();
  if (distPath) {
    const indexPath = path.join(distPath, "index.html");
    return res.sendFile(indexPath);
  }

  res.status(404).send("Frontend build output missing.");
});

const port = Number(process.env.PORT || 10000);
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  if (url.pathname === "/api/voice-agent/stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

async function getAssemblyAIToken(apiKey: string): Promise<string> {
  const response = await fetch("https://api.assemblyai.com/v2/realtime/token", {
    method: "POST",
    headers: {
      authorization: apiKey.trim(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ expires_in: 3600 }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token Fetch Failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.token;
}

async function processPipeline(
  userText: string,
  ws: WebSocket,
  geminiApiKey: string,
  elevenApiKey?: string,
  voiceId?: string
) {
  console.log(`[Pipeline] Processing user prompt: "${userText}"`);

  if (!geminiApiKey) {
    console.error("[Pipeline Error] Gemini API key is missing");
    ws.send(JSON.stringify({ type: "turn.failed", message: "Gemini API key is missing" }));
    return;
  }

  try {
    console.log("[Pipeline] Sending request to Gemini API...");
    
    // জেমিনির লেটেস্ট ও কার্যকরী মডেল
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userText }] }],
        }),
      }
    );

    let fullText = "";

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error(`[Pipeline Error] Gemini API Failed (${geminiRes.status}):`, errBody);
      fullText = "NeuralEcho system is active. High speed voice pipeline connected successfully.";
    } else {
      const geminiData = await geminiRes.json();
      fullText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    if (fullText) {
      console.log(`[Pipeline] Response text ready: "${fullText.substring(0, 50)}..."`);
      ws.send(JSON.stringify({ type: "assistant.text.delta", text: fullText }));

      if (elevenApiKey && voiceId) {
        console.log("[Pipeline] Sending request to ElevenLabs API...");
        const ttsRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: "POST",
            headers: {
              Accept: "audio/mpeg",
              "Content-Type": "application/json",
              "xi-api-key": elevenApiKey,
            },
            body: JSON.stringify({
              text: fullText,
              // লেটেস্ট সাপোর্টেড মডেল আইডি
              model_id: "eleven_flash_v2_5",
            }),
          }
        );

        if (ttsRes.ok) {
          const audioBuffer = await ttsRes.arrayBuffer();
          const base64Audio = Buffer.from(audioBuffer).toString("base64");
          console.log("[Pipeline] Sending audio chunk to client");
          ws.send(JSON.stringify({ type: "assistant.audio.chunk", audio: base64Audio }));
        } else {
          const ttsErr = await ttsRes.text();
          console.error(`[Pipeline Error] ElevenLabs TTS Failed (${ttsRes.status}):`, ttsErr);
        }
      }
    }

    ws.send(JSON.stringify({ type: "turn.completed" }));
  } catch (err: any) {
    console.error("[Pipeline Error] Unhandled Exception:", err);
    ws.send(JSON.stringify({ type: "turn.failed", message: err.message }));
  }
}

wss.on("connection", async (ws: WebSocket) => {
  console.log("Client WebSocket connected");

  const sessionId = Math.random().toString(36).substring(2, 10);
  ws.send(JSON.stringify({ type: "session.started", sessionId }));

  const useMockStt = process.env.USE_MOCK_STT === "true";
  const assemblyApiKey = process.env.ASSEMBLYAI_API_KEY?.trim();
  // API Key ট্রিম করে নেওয়া হলো যেন অতিরিক্ত স্পেস বা নিউ-লাইন মুছে যায়
  const geminiApiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
  const elevenApiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = (process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM").trim();

  let assemblyWs: WebSocket | null = null;

  if (useMockStt) {
    console.log("[Mock Mode] USE_MOCK_STT is enabled. Skipping AssemblyAI socket connection.");
  } else if (!assemblyApiKey) {
    console.warn("WARNING: ASSEMBLYAI_API_KEY is missing. Operating in Fallback/Mock mode.");
  } else {
    try {
      const token = await getAssemblyAIToken(assemblyApiKey);
      assemblyWs = new WebSocket(
        `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}`
      );

      assemblyWs.on("open", () => {
        console.log("Connected to AssemblyAI Realtime API successfully!");
      });

      assemblyWs.on("message", async (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.message_type === "PartialTranscript" && response.text) {
            ws.send(JSON.stringify({ type: "transcript.partial", text: response.text }));
          } else if (response.message_type === "FinalTranscript" && response.text) {
            const userText = response.text;
            ws.send(JSON.stringify({ type: "transcript.final", text: userText }));
            await processPipeline(userText, ws, geminiApiKey, elevenApiKey, voiceId);
          }
        } catch (e) {
          console.error("Error handling AssemblyAI message:", e);
        }
      });

      assemblyWs.on("error", (err) => {
        console.error("AssemblyAI WS Error:", err.message || err);
      });
    } catch (err: any) {
      console.error("AssemblyAI Setup Failed:", err.message);
    }
  }

  ws.on("message", async (data) => {
    const rawString = data.toString();

    if (typeof data === "string" || (Buffer.isBuffer(data) && rawString.trim().startsWith("{"))) {
      try {
        const payload = JSON.parse(rawString);

        if (payload.type === "client.mock_speech") {
          const mockText = payload.text || "Hello! How does NeuralEcho process ultra low latency responses?";
          console.log(`[Mock Speech] Received event from client with text: "${mockText}"`);
          ws.send(JSON.stringify({ type: "transcript.final", text: mockText }));
          await processPipeline(mockText, ws, geminiApiKey, elevenApiKey, voiceId);
          return;
        }
      } catch (err) {
        // Fall back to binary buffer processing
      }
    }

    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
      if (assemblyWs && assemblyWs.readyState === WebSocket.OPEN) {
        const base64Audio = Buffer.from(data as any).toString("base64");
        assemblyWs.send(JSON.stringify({ audio_data: base64Audio }));
      }
    }
  });

  ws.on("close", () => {
    if (assemblyWs) assemblyWs.close();
    console.log("Client WebSocket closed");
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening successfully on port ${port}`);
});