import http from "http";
import path from "path";
import fs from "fs";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenerativeAI } from "@google/genai";

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

// Gemini Client Setup
const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
const ai = new GoogleGenerativeAI({ apiKey });

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

wss.on("connection", (ws: WebSocket) => {
  console.log("Client WebSocket connected");

  const sessionId = Math.random().toString(36).substring(2, 10);
  ws.send(JSON.stringify({ type: "session.started", sessionId }));

  // AssemblyAI Realtime WebSocket Connection Setup
  const assemblyApiKey = process.env.ASSEMBLYAI_API_KEY;
  let assemblyWs: WebSocket | null = null;

  if (assemblyApiKey) {
    assemblyWs = new WebSocket(
      `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000`,
      { headers: { authorization: assemblyApiKey } }
    );

    assemblyWs.on("open", () => {
      console.log("Connected to AssemblyAI Realtime API");
    });

    assemblyWs.on("message", async (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.message_type === "PartialTranscript" && response.text) {
          ws.send(JSON.stringify({ type: "transcript.partial", text: response.text }));
        } else if (response.message_type === "FinalTranscript" && response.text) {
          const userText = response.text;
          ws.send(JSON.stringify({ type: "transcript.final", text: userText }));

          // Process with Gemini LLM
          if (apiKey) {
            try {
              const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });
              const result = await model.generateContentStream(userText);

              let fullText = "";
              for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                fullText += chunkText;
                ws.send(JSON.stringify({ type: "assistant.text.delta", text: chunkText }));
              }

              // ElevenLabs TTS Request
              const elevenApiKey = process.env.ELEVENLABS_API_KEY;
              const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

              if (elevenApiKey && fullText) {
                const ttsRes = await fetch(
                  `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
                  {
                    method: "POST",
                    headers: {
                      "Accept": "audio/mpeg",
                      "Content-Type": "application/json",
                      "xi-api-key": elevenApiKey,
                    },
                    body: JSON.stringify({
                      text: fullText,
                      model_id: "eleven_monolingual_v1",
                    }),
                  }
                );

                if (ttsRes.ok) {
                  const audioBuffer = await ttsRes.arrayBuffer();
                  const base64Audio = Buffer.from(audioBuffer).toString("base64");
                  ws.send(JSON.stringify({ type: "assistant.audio.chunk", audio: base64Audio }));
                }
              }

              ws.send(JSON.stringify({ type: "turn.completed" }));
            } catch (err: any) {
              console.error("Gemini/ElevenLabs Error:", err);
              ws.send(JSON.stringify({ type: "turn.failed", message: err.message }));
            }
          }
        }
      } catch (e) {
        console.error("Error handling AssemblyAI message:", e);
      }
    });

    assemblyWs.on("error", (err) => console.error("AssemblyAI WS Error:", err));
  }

  // Handle Incoming Client Audio Stream
  ws.on("message", (data) => {
    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
      if (assemblyWs && assemblyWs.readyState === WebSocket.OPEN) {
        const base64Audio = Buffer.from(data as any).toString("base64");
        assemblyWs.send(JSON.stringify({ audio_data: base64Audio }));
      }
    } else {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === "interrupt") {
          console.log("Session interrupted");
        }
      } catch (e) {}
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