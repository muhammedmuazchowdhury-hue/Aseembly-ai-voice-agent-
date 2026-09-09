import path from "path";
import express from "express";
import app from "./app";
import { logger } from "./lib/logger";

// ১. Vite ফ্রন্টএন্ডের বিল্ড ফোল্ডারের (dist) পাথ তৈরি
const frontendDistPath = path.resolve(process.cwd(), "../voice-agent/dist");

// ২. Static ফাইল সার্ভ করা (JS, CSS, Images ইত্যাদির জন্য)
app.use(express.static(frontendDistPath));

// ৩. SPA Routing: API রুট ছাড়া অন্য যেকোনো পেজ রিকোয়েস্টে index.html পাঠানো
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next(); // API রিকোয়েস্ট হলে তা পরবর্তী ব্যাকএন্ড রাউটে পাঠিয়ে দেবে
  }
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});