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
  const PORT = 3e3;
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
  const getSappayToken = async () => {
    const response = await fetch("https://api.prod.sappay.net/api/public/authentication/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        grant_type: "password",
        client_id: process.env.SAPPAY_CLIENT_ID,
        client_secret: process.env.SAPPAY_CLIENT_SECRET,
        username: process.env.SAPPAY_USERNAME,
        password: process.env.SAPPAY_PASSWORD
      })
    });
    const data = await response.json();
    if (!data.access_token) throw new Error("Failed to authenticate with Sappay");
    return data.access_token;
  };
  app.get("/api/admin/system-status", (req, res) => {
    res.json({
      success: true,
      services: {
        sappay: {
          configured: !!(process.env.SAPPAY_CLIENT_ID && process.env.SAPPAY_CLIENT_SECRET && process.env.SAPPAY_USERNAME && process.env.SAPPAY_PASSWORD),
          clientIdSet: !!process.env.SAPPAY_CLIENT_ID,
          clientSecretSet: !!process.env.SAPPAY_CLIENT_SECRET,
          usernameSet: !!process.env.SAPPAY_USERNAME,
          passwordSet: !!process.env.SAPPAY_PASSWORD
        },
        sms: {
          configured: !!(process.env.SMS_API_USER && process.env.SMS_API_HASH),
          userSet: !!process.env.SMS_API_USER,
          hashSet: !!process.env.SMS_API_HASH
        }
      }
    });
  });
  app.post("/api/payment/init", async (req, res) => {
    const { amount, phone, email, method } = req.body;
    try {
      if (!process.env.SAPPAY_CLIENT_ID || !process.env.SAPPAY_USERNAME) {
        console.warn("Sappay credentials missing. Simulating payment initialization.");
        const invoiceId2 = `SIM-INV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        return res.json({ success: true, invoiceId: invoiceId2, simulated: true });
      }
      const token = await getSappayToken();
      const invoiceResponse = await fetch("https://api.prod.sappay.net/api/public/invoice/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          type: "SIMPLE",
          customer: {
            email: email || "client@ordonnancedirect.app",
            country: 1
            // Burkina Faso default
          },
          amount: String(amount),
          note: "Ordonnance Direct - Paiement"
        })
      });
      const invoiceData = await invoiceResponse.json();
      if (!invoiceData.invoice_id) throw new Error("Failed to create Sappay invoice.");
      const invoiceId = invoiceData.invoice_id;
      const processorId = SAPPAY_PROCESSORS[method] || SAPPAY_PROCESSORS.orange;
      if (method === "moov") {
        await fetch("https://api.prod.sappay.net/api/checkout/get-otp/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            customer_msisdn: phone,
            invoice_id: invoiceId,
            payment_processor_id: processorId
          })
        });
      }
      res.json({ success: true, invoiceId });
    } catch (error) {
      console.error("Payment init error:", error);
      res.status(500).json({ success: false, error: "Initialization failed" });
    }
  });
  app.post("/api/payment/perform", async (req, res) => {
    const { invoiceId, phone, otp, method } = req.body;
    try {
      if (!process.env.SAPPAY_CLIENT_ID || !process.env.SAPPAY_USERNAME) {
        console.warn("Sappay credentials missing. Simulating payment performance.");
        if (!otp) throw new Error("OTP is required");
        return res.json({ success: true, transactionId: `SIM-TX-${Date.now()}` });
      }
      const token = await getSappayToken();
      const processorId = SAPPAY_PROCESSORS[method] || SAPPAY_PROCESSORS.orange;
      const performResponse = await fetch("https://api.prod.sappay.net/api/checkout/perform/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
          payment_processor_id: processorId,
          customer_msisdn: phone,
          otp
        })
      });
      const performData = await performResponse.json();
      if (performData.status === "FAILED" || performData.message && performData.message.toLowerCase().includes("failed")) {
        throw new Error(performData.message || "Payment perform failed");
      }
      res.json({ success: true, data: performData });
    } catch (error) {
      console.error("Payment perform error:", error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Payment failed" });
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
