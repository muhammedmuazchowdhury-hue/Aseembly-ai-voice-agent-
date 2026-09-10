import path from "path";
import fs from "fs";
import express from "express";
import app from "./app";
import { logger } from "./lib/logger";

const voiceAgentDir = path.resolve(process.cwd(), "../voice-agent");

const possiblePaths = [
  path.join(voiceAgentDir, "dist"),
  path.join(voiceAgentDir, "build"),
  path.resolve(process.cwd(), "dist"),
];

const frontendDistPath = possiblePaths.find((p) => fs.existsSync(p));

if (frontendDistPath) {
  logger.info({ frontendDistPath }, "Found frontend build output");
  app.use(express.static(frontendDistPath));
}

// SPA Fallback
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  if (frontendDistPath) {
    const indexPath = path.join(frontendDistPath, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }

  let voiceAgentContent: string[] = [];
  try {
    voiceAgentContent = fs.readdirSync(voiceAgentDir);
  } catch (err) {
    voiceAgentContent = [];
  }

  res.status(404).send(
    `Frontend output missing. voice-agent folder contains: ${JSON.stringify(voiceAgentContent)}`
  );
});

const port = Number(process.env.PORT || 10000);

app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening successfully");
});