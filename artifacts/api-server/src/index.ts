import path from "path";
import fs from "fs";
import express from "express";
import app from "./app";
import { logger } from "./lib/logger";

// ১. সেফ ফ্রন্টএন্ড পাথ রেজোলিউশন (যে ডিরেক্টরি থেকেই রান হোক না কেন খুঁজে নেবে)
const possiblePaths = [
  path.resolve(__dirname, "../../voice-agent/dist"),
  path.resolve(process.cwd(), "artifacts/voice-agent/dist"),
  path.resolve(process.cwd(), "../voice-agent/dist"),
];

const frontendDistPath =
  possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0];

// ২. Static ফাইল সার্ভ করা
app.use(express.static(frontendDistPath));

// ৩. SPA Routing (API রুট বাদে বাকি সব রিকোয়েস্টে index.html পাঠাবে)
app.get("*", (req, res, next) => {
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

// ৪. সেফ PORT হ্যান্ডলিং (PORT না থাকলে ১০০০০ বা ৩০০০ পোর্টে অটো রান হবে, ক্র্যাশ করবে না)
const port = Number(process.env.PORT || 10000);

app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening successfully");
});