import path from "path";
import fs from "fs";
import express from "express";
import app from "./app";
import { logger } from "./lib/logger";

// Relative path resolution based on CWD (/opt/render/project/src/artifacts/api-server)
const possiblePaths = [
  path.resolve(process.cwd(), "../voice-agent/dist"),
  path.resolve(process.cwd(), "../../voice-agent/dist"),
  path.resolve(process.cwd(), "../../dist"),
  path.resolve(__dirname, "../../voice-agent/dist"),
  path.resolve(__dirname, "../../../voice-agent/dist"),
];

const frontendDistPath = possiblePaths.find((p) => fs.existsSync(p));

if (frontendDistPath) {
  logger.info({ frontendDistPath }, "Found frontend build output");
  app.use(express.static(frontendDistPath));
}

// SPA Fallback: Handles client routing & direct diagnostics if dist is missing
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

  let artifactsFolderContent: string[] = [];
  try {
    artifactsFolderContent = fs.readdirSync(path.resolve(process.cwd(), ".."));
  } catch (err) {
    artifactsFolderContent = [];
  }

  res.status(404).send(
    `Frontend build output not found. CWD: ${process.cwd()}. Artifacts folder contains: ${JSON.stringify(artifactsFolderContent)}`
  );
});

// Port binding for Render container
const port = Number(process.env.PORT || 10000);

app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening successfully");
});