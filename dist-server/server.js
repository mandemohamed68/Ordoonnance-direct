// server.ts
import express from "express";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = parseInt(process.env.PORT || process.env.DEFAULT_APP_PORT || "3000", 10);
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
app.use(express.json({ limit: "10mb" }));
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV });
});
app.post("/api/send-sms", async (req, res) => {
  const { to, message } = req.body;
  try {
    const apiUrl = "https://tfso.sappay.net/index.php";
    const params = new URLSearchParams({
      app: "ws",
      u: process.env.SMS_API_USER || "",
      h: process.env.SMS_API_HASH || "",
      op: "pv",
      to,
      msg: message,
      sender_id: process.env.SMS_SENDER_ID || ""
    });
    const response = await fetch(`${apiUrl}?${params.toString()}`);
    const resultText = await response.text();
    console.log("SMS API response:", resultText);
    if (response.ok) {
      res.json({ success: true, response: resultText });
    } else {
      throw new Error(`SMS API error: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Failed to send SMS:", error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});
async function startServer() {
  const isProd = process.env.NODE_ENV === "production" || !!process.env.K_SERVICE;
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = __filename.endsWith("server.js") ? path.join(__dirname, "..", "dist") : path.join(__dirname, "dist");
    console.log("Production mode: serving static files from:", distPath);
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      const indexPath = path.join(distPath, "index.html");
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        console.error("index.html not found at:", indexPath);
        res.status(404).send("Not Found");
      }
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} in ${isProd ? "production" : "development"} mode`);
  });
}
startServer();
