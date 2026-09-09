import path from "path";
import fs from "fs";
import express from "express";
import app from "./app";
import { logger } from "./lib/logger";

// Resolve frontend dist path safely
const possiblePaths = [
  path.resolve(__dirname, "../../voice-agent/dist"),
  path.resolve(process.cwd(), "artifacts/voice-agent/dist"),
  path.resolve(process.cwd(), "../voice-agent/dist"),
];

const frontendDistPath =
  possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];

// Serve static frontend assets
app.use(express.static(frontendDistPath));

// SPA Routing: Forward non-API requests to index.html
app.get("(.*)", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  const indexPath = path.join(frontendDistPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Frontend build output not found.");
  }
});

// Safe port fallbacks and network binding for Render container
const port = Number(process.env.PORT || 10000);

app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening successfully");
});