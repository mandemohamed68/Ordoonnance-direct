import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Cloud Run provides the PORT environment variable.
const PORT = parseInt(process.env.PORT || process.env.DEFAULT_APP_PORT || "3000", 10);

console.log('--- SERVER STARTUP ---');
console.log('Time:', new Date().toISOString());
console.log('Directory:', __dirname);
console.log('Port:', PORT);

// Error handling
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL: Unhandled Rejection:', reason);
});

app.use(express.json({ limit: '10mb' }));

// Health check for Cloud Run
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// SMS API Endpoint
app.post("/api/send-sms", async (req, res) => {
  const { to, message } = req.body;
  try {
    const apiUrl = "https://tfso.sappay.net/index.php";
    const params = new URLSearchParams({
      app: "ws",
      u: process.env.SMS_API_USER || "",
      h: process.env.SMS_API_HASH || "",
      op: "pv",
      to: to,
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
  // Use Vite in development (preview) and static serving in production (deployed).
  // The platform sets NODE_ENV=production only for the final deployment.
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    console.log('Mode: DEVELOPMENT (Vite)');
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: true
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log('Mode: PRODUCTION (Static)');
    
    // In production, the server is at dist/server.js and assets are in dist/
    // We serve the directory where the server file resides.
    const distPath = __dirname;
    const absoluteDistPath = path.resolve(distPath);
    
    console.log('Serving assets from:', absoluteDistPath);
    
    if (!existsSync(path.join(absoluteDistPath, 'index.html'))) {
      console.error('ERROR: index.html not found in:', absoluteDistPath);
    }

    app.use(express.static(absoluteDistPath));
    
    app.get('*', (req, res) => {
      const indexPath = path.join(absoluteDistPath, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        console.error('ERROR: index.html not found at:', indexPath);
        res.status(404).send('Application not found. Please check build logs.');
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server ready on 0.0.0.0:${PORT}`);
    console.log('--- STARTUP COMPLETE ---');
  });
}

startServer().catch(err => {
  console.error('FATAL: Failed to start server:', err);
  process.exit(1);
});
