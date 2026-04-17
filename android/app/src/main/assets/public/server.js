// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import { createServer as createViteServer } from "vite";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
async function startServer() {
  const app = express();
  app.use(cors());
  const PORT = parseInt(process.env.PORT || "3000", 10);
  console.log("--- SERVER STARTUP (V2) ---");
  console.log("Time:", (/* @__PURE__ */ new Date()).toISOString());
  console.log("Directory:", __dirname);
  console.log("Port:", PORT);
  console.log("Environment:", process.env.NODE_ENV);
  app.use(express.json({ limit: "10mb" }));
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.post("/api/send-sms", async (req, res) => {
    const { to, message } = req.body;
    try {
      if (!process.env.SMS_API_USER || !process.env.SMS_API_HASH) {
        console.warn("Identifiants SMS manquants. Simulation de l'envoi de SMS.");
        return res.json({ success: true, response: "SIMULATED_SMS_SUCCESS", simulated: true });
      }
      const apiUrl = `https://www.aqilasms.com/api/v1/send?user=${process.env.SMS_API_USER}&hash=${process.env.SMS_API_HASH}&to=${to}&message=${encodeURIComponent(message)}&sender=${process.env.SMS_SENDER_ID || "Sant\xE9Direct"}`;
      const response = await fetch(apiUrl);
      const resultText = await response.text();
      try {
        const jsonResponse = JSON.parse(resultText);
        if (jsonResponse.status === "error") {
          throw new Error(`SMS API error: ${jsonResponse.error_string}`);
        }
      } catch (e) {
      }
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
  const SAPPAY_PROCESSORS = {
    orange: "11688813752134336",
    moov: "11688813838374580",
    telecel: "11744695746597207",
    coris: "11702302492453862"
  };
  app.post("/api/payment/init", async (req, res) => {
    const { amount, phone, email, method } = req.body;
    try {
      const invoiceId = `INV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      res.json({ success: true, invoiceId });
    } catch (error) {
      res.status(500).json({ success: false, error: "Initialization failed" });
    }
  });
  app.post("/api/payment/perform", async (req, res) => {
    const { invoiceId, phone, otp, method } = req.body;
    try {
      if (!otp) throw new Error("OTP is required");
      res.json({ success: true, transactionId: `TX-${Date.now()}` });
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Payment failed" });
    }
  });
  app.post("/api/payments/sappay/initiate", async (req, res) => {
    const { amount, phone, provider, orderId } = req.body;
    try {
      const username = process.env.SAPPAY_USERNAME;
      const password = process.env.SAPPAY_PASSWORD;
      const clientId = process.env.SAPPAY_CLIENT_ID;
      const clientSecret = process.env.SAPPAY_CLIENT_SECRET;
      if (!username || !password || !clientId || !clientSecret) {
        console.warn("Sappay credentials missing in environment variables. Simulating payment initiation.");
        return res.json({
          success: true,
          data: {
            message: "SIMULATED_SAPPAY_INITIATION_SUCCESS",
            transaction_id: `SIM-TX-${Date.now()}`
          },
          simulated: true
        });
      }
      const authResponse = await fetch("https://api.sappay.net/api/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "password",
          client_id: clientId,
          client_secret: clientSecret,
          username,
          password,
          scope: "*"
        })
      });
      const authData = await authResponse.json();
      if (!authData.access_token) {
        throw new Error("Failed to get Sappay access token: " + JSON.stringify(authData));
      }
      const processorId = SAPPAY_PROCESSORS[provider] || SAPPAY_PROCESSORS.orange;
      const paymentResponse = await fetch("https://api.sappay.net/api/v1/payments/collect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authData.access_token}`
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          currency: "XOF",
          phone_number: phone,
          merchant_reference: `ORD-${orderId}-${Date.now()}`,
          processor_id: processorId,
          callback_url: "https://webhook.site/dummy-callback"
          // For production, use a real callback URL
        })
      });
      const paymentData = await paymentResponse.json();
      res.json({ success: true, data: paymentData });
    } catch (error) {
      console.error("Sappay error:", error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
  server.keepAliveTimeout = 65e3;
  server.headersTimeout = 66e3;
}
startServer().catch((err) => {
  console.error("FAILED TO START SERVER:", err);
});
