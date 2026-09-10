import path from "path";
import fs from "fs";
import express from "express";
import app from "./app";
import { logger } from "./lib/logger";

const voiceAgentDir = path.resolve(process.cwd(), "../voice-agent");

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

app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening successfully");
});