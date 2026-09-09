import path from "path";
import fs from "fs";
import express from "express";
import app from "./app";
import { logger } from "./lib/logger";

// Comprehensive path resolution for monorepo setups on Render
const possiblePaths = [
  path.resolve(process.cwd(), "artifacts/voice-agent/dist"),
  path.resolve(process.cwd(), "../voice-agent/dist"),
  path.resolve(__dirname, "../../voice-agent/dist"),
  path.resolve(__dirname, "../../../artifacts/voice-agent/dist"),
  path.resolve(__dirname, "../../../voice-agent/dist"),
  path.resolve(__dirname, "../voice-agent/dist"),
];

const frontendDistPath = possiblePaths.find((p) => fs.existsSync(p));

if (frontendDistPath) {
  logger.info({ frontendDistPath }, "Found frontend build output");
  app.use(express.static(frontendDistPath));
} else {
  logger.warn({ searchedPaths: possiblePaths }, "Frontend build output not found");
}

// SPA Fallback: Middleware avoiding path-to-regexp parser
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
  res.status(404).send(`Frontend build output not found. CWD: ${process.cwd()}`);
});

// Safe port fallbacks and network binding for Render container
const port = Number(process.env.PORT || 10000);

app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening successfully");
});