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

// Serve static assets dynamically
app.use((req, res, next) => {
  const distPath = getFrontendDistPath();
  if (distPath) {
    return express.static(distPath)(req, res, next);
  }
  next();
});

// SPA Fallback
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  const distPath = getFrontendDistPath();
  if (distPath) {
    const indexPath = path.join(distPath, "index.html");
    return res.sendFile(indexPath);
  }

  const rawDistPath = path.join(voiceAgentDir, "dist");
  let distContents: string[] = [];

  if (fs.existsSync(rawDistPath)) {
    try {
      distContents = fs.readdirSync(rawDistPath);
    } catch (e) {
      distContents = [];
    }
  }

  res.status(404).send(
    `Frontend build output missing. dist folder exists: ${fs.existsSync(rawDistPath)}, contents: ${JSON.stringify(distContents)}`
  );
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

wss.on("connection", (ws: WebSocket, request) => {
  console.log("WebSocket connection established");

  // ১. সেশন শুরু করে ফ্রন্টএন্ডে Session ID পাঠানো
  const sessionId = Math.random().toString(36).substring(2, 10);
  ws.send(JSON.stringify({ type: "session.started", sessionId }));

  // ২. মাইকের অডিও ডাটা গ্রহণ করার লিসেনার
  ws.on("message", (data) => {
    try {
      if (typeof data === "string") {
        const parsed = JSON.parse(data);
        if (parsed.type === "interrupt") {
          console.log("Session interrupted by client");
        }
      } else if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
        // মোবাইল মাইক থেকে অডিও চ্যাঙ্ক সার্ভারে রিসিভ হচ্ছে
        console.log(`Received audio chunk: ${data.byteLength || (data as Buffer).length} bytes`);
      }
    } catch (err) {
      console.error("Error processing WebSocket message:", err);
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening successfully on port ${port}`);
});