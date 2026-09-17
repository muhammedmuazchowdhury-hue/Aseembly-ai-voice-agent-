import http from "http";
import path from "path";
import fs from "fs";
import express from "express";
import { WebSocketServer } from "ws";

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

wss.on("connection", (ws, request) => {
  console.log("WebSocket connection established");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening successfully on port ${port}`);
});