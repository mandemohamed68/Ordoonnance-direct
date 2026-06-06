// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import cron from "node-cron";
import { createServer as createViteServer } from "vite";
dotenv.config({ override: true });
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
    console.log(`[SMS] Attempting to send to ${to}`);
    try {
      if (!process.env.SMS_API_USER || !process.env.SMS_API_HASH) {
        console.warn(`[SMS] CONFIGURATION MANQUANTE: Simulation de l'envoi du message: "${message}" vers ${to}`);
        return res.json({
          success: true,
          simulated: true,
          info: "Message simul\xE9 car SMS_API_USER ou SMS_API_HASH n'est pas configur\xE9 dans les param\xE8tres de l'application."
        });
      }
      let apiUrl = `https://aqilasms.com/api/v1/send?user=${process.env.SMS_API_USER}&hash=${process.env.SMS_API_HASH}&to=${to}&message=${encodeURIComponent(message)}&sender=${process.env.SMS_SENDER_ID || "SanteDirect"}`;
      console.log(`[SMS] Calling API: aqilasms.com...`);
      let response;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1e4);
        try {
          response = await fetch(apiUrl, { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        console.warn(`[SMS] Primary URL failed, trying api.aqilasms.com fallback...`, err);
        apiUrl = `https://api.aqilasms.com/api/v1/send?user=${process.env.SMS_API_USER}&hash=${process.env.SMS_API_HASH}&to=${to}&message=${encodeURIComponent(message)}&sender=${process.env.SMS_SENDER_ID || "SanteDirect"}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1e4);
        try {
          response = await fetch(apiUrl, { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }
      }
      const resultText = await response.text();
      console.log(`[SMS] Response Status: ${response.status} ${response.statusText}`);
      console.log(`[SMS] Response Body: ${resultText.substring(0, 500)}`);
      let jsonResponse = null;
      try {
        jsonResponse = JSON.parse(resultText);
        if (jsonResponse && jsonResponse.status === "error") {
          throw new Error(`SMS API error: ${jsonResponse.error_string || jsonResponse.message || "Unknown error"}`);
        }
      } catch (e) {
      }
      if (response.ok) {
        res.json({ success: true, response: resultText });
      } else {
        throw new Error(`SMS API HTTP error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error("[SMS] Error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof Error && "cause" in error ? error.cause : void 0
      });
    }
  });
  const SAPPAY_PROCESSORS = {
    orange: "11688813752134336",
    moov: "11688813838374580",
    telecel: "11744695746597207",
    coris: "11702302492453862"
  };
  const cleanMsisdn = (phone) => {
    let cleaned = phone.replace(/\D/g, "");
    if (cleaned.startsWith("00226")) cleaned = cleaned.substring(5);
    else if (cleaned.startsWith("226")) cleaned = cleaned.substring(3);
    if (cleaned.length > 8 && cleaned.startsWith("0")) {
      cleaned = cleaned.substring(1);
    }
    if (cleaned.length > 8) {
      cleaned = cleaned.substring(cleaned.length - 8);
    }
    return cleaned;
  };
  const safeJson = async (response) => {
    const contentType = response.headers.get("content-type");
    const text = await response.text();
    if (contentType && contentType.includes("application/json")) {
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error(`[Sappay] JSON parsing failed: ${e}. Body: ${text}`);
      }
    }
    console.log(`[Sappay Text Response] Statut: ${response.status}. Body: ${text.substring(0, 500)}`);
    const statusWords = ["SUCCESS", "OK", "FAILED", "ERROR"];
    if (text.match(/^[A-Z0-9]{5,}$/) && !statusWords.includes(text.toUpperCase())) {
      return { invoice_id: text, success: true };
    }
    if (text.toUpperCase() === "SUCCESS" || text.toUpperCase() === "OK") {
      return { success: true, message: text };
    }
    if (response.ok) {
      return { success: true, response: text };
    }
    throw new Error(`Erreur API Sappay: ${response.status} ${response.statusText}. R\xE9ponse: ${text.substring(0, 100)}`);
  };
  const getSappayToken = async (isTest = false) => {
    const clientId = (process.env.SAPPAY_CLIENT_ID || "np25qXFhh0Xq7zBnqmqmWLaC7TRwAX6Qg3GNc39").trim();
    const clientSecret = (process.env.SAPPAY_CLIENT_SECRET || "i1x9hvOO36wTgTOYQaUesWk8CcxjpY0tnTenq2ti8Ia4myRbEilyhiD7HbG4V4oOLUoMOIhFyliZiJQ0hdQrKsLJGVkOMH9TI23B5QiuIIuOuZFG4lrLiJq5fHH5dwNq").trim();
    const username = (process.env.SAPPAY_USERNAME || "mandemohamed68@gmail.com").trim();
    const password = (process.env.SAPPAY_PASSWORD || "mm@27071986").trim();
    const baseUrl = "https://api.prod.sappay.net/api/public";
    const authUrl = `${baseUrl}/authentication/`;
    console.log(`[Sappay Auth] Identifiers check: 
      - ClientID length: ${clientId.length} ${process.env.SAPPAY_CLIENT_ID ? "(From Env)" : "(Default Hardcoded)"}
      - ClientSecret length: ${clientSecret.length}
      - Username: ${username}
    `);
    const authParams = new URLSearchParams();
    authParams.append("grant_type", "password");
    authParams.append("username", username);
    authParams.append("password", password);
    const authParamsFull = new URLSearchParams(authParams);
    authParamsFull.append("client_id", clientId);
    authParamsFull.append("client_secret", clientSecret);
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    try {
      console.log(`[Sappay Auth] Trial 1: Body params (x-www-form-urlencoded) to ${authUrl}...`);
      let response = await fetch(authUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json"
        },
        body: authParamsFull.toString()
      });
      let data = await response.json().catch(() => null);
      const isTrial1Success = !!(data && data.access_token);
      console.log(`[Sappay Auth] Trial 1 Result: Status ${response.status}`, isTrial1Success ? "Success" : data?.error || "No Token");
      if (!isTrial1Success) {
        const noTrailingUrl = authUrl.replace(/\/$/, "");
        console.warn(`[Sappay Auth] Trial 2: No trailing slash to ${noTrailingUrl}...`);
        response = await fetch(noTrailingUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
          },
          body: authParamsFull.toString()
        });
        data = await response.json().catch(() => null);
        const isTrial2Success = !!(data && data.access_token);
        console.log(`[Sappay Auth] Trial 2 Result: Status ${response.status}`, isTrial2Success ? "Success" : data?.error || "No Token");
      }
      if (!data || !data.access_token) {
        console.warn(`[Sappay Auth] Trial 3: Basic Auth Header + Body params...`);
        response = await fetch(authUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "Authorization": `Basic ${basicAuth}`
          },
          body: authParams.toString()
        });
        data = await response.json().catch(() => null);
        const isTrial3Success = !!(data && data.access_token);
        console.log(`[Sappay Auth] Trial 3 Result: Status ${response.status}`, isTrial3Success ? "Success" : data?.error || "No Token");
      }
      if (!data || !data.access_token) {
        console.warn("[Sappay Auth] Trial 4: JSON body with all params...");
        response = await fetch(authUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            grant_type: "password",
            client_id: clientId,
            client_secret: clientSecret,
            username,
            password
          })
        });
        data = await response.json().catch(() => null);
        const isTrial4Success = !!(data && data.access_token);
        console.log(`[Sappay Auth] Trial 4 Result: Status ${response.status}`, isTrial4Success ? "Success" : data?.error || "No Token");
      }
      if (!data || !data.access_token) {
        console.error("[Sappay Auth] Toutes les m\xE9thodes d'authentification ont \xE9chou\xE9. R\xE9ponse finale:", JSON.stringify(data, null, 2));
        const detail = data?.message || data?.error_description || data?.error || data?.detail || "Identifiants invalides";
        throw new Error(`Erreur d'authentification Sappay: ${detail}. (Statut ${response.status})`);
      }
      console.log("[Sappay Auth] Success! Token acquired.");
      return data.access_token;
    } catch (error) {
      console.error("[Sappay Auth] Exception:", error);
      throw error;
    }
  };
  app.get("/api/admin/system-status", (req, res) => {
    const sappayConfigured = !!((process.env.SAPPAY_CLIENT_ID || "np25qXFhh0Xq7zBnqmqmWLaC7TRwAX6Qg3GNc39") && (process.env.SAPPAY_CLIENT_SECRET || "i1x9hvOO36wTgTOYQaUesWk8CcxjpY0tnTenq2ti8Ia4myRbEilyhiD7HbG4V4oOLUoMOIhFyliZiJQ0hdQrKsLJGVkOMH9TI23B5QiuIIuOuZFG4lrLiJq5fHH5dwNq") && (process.env.SAPPAY_USERNAME || "mandemohamed68@gmail.com") && (process.env.SAPPAY_PASSWORD || "mm@27071986"));
    res.json({
      success: true,
      services: {
        sappay: {
          configured: sappayConfigured,
          clientIdSet: !!(process.env.SAPPAY_CLIENT_ID || "np25qXFhh0Xq7zBnqmqmWLaC7TRwAX6Qg3GNc39"),
          clientSecretSet: !!(process.env.SAPPAY_CLIENT_SECRET || "i1x9hvOO36wTgTOYQaUesWk8CcxjpY0tnTenq2ti8Ia4myRbEilyhiD7HbG4V4oOLUoMOIhFyliZiJQ0hdQrKsLJGVkOMH9TI23B5QiuIIuOuZFG4lrLiJq5fHH5dwNq"),
          usernameSet: !!(process.env.SAPPAY_USERNAME || "mandemohamed68@gmail.com"),
          passwordSet: !!(process.env.SAPPAY_PASSWORD || "mm@27071986")
        },
        sms: {
          configured: !!(process.env.SMS_API_USER && process.env.SMS_API_HASH),
          userSet: !!process.env.SMS_API_USER,
          hashSet: !!process.env.SMS_API_HASH
        },
        gemini: {
          configured: !!process.env.GEMINI_API_KEY,
          keySet: !!process.env.GEMINI_API_KEY
        }
      }
    });
  });
  const handleSandboxPaymentInit = async (method) => {
    console.log("[Sappay Sandbox] Simulated Init");
    return {
      success: true,
      invoiceId: `TEST_${Math.random().toString(36).substring(7).toUpperCase()}`,
      processorId: SAPPAY_PROCESSORS[method],
      otpRequired: method === "moov" || method === "coris"
    };
  };
  const handleSandboxPaymentPerform = async (invoiceId) => {
    console.log("[Sappay Sandbox] Simulated Perform");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return {
      success: true,
      data: {
        status: "SUCCESS",
        message: "Paiement simul\xE9 r\xE9ussi (Sandbox Mode)",
        invoice_id: invoiceId
      }
    };
  };
  const handleProductionPaymentInit = async (amount, phone, email, method) => {
    const publicUrl = "https://api.prod.sappay.net/api/public";
    const checkoutUrl = "https://api.prod.sappay.net/api/checkout";
    const token = await getSappayToken(false);
    const formattedPhone = cleanMsisdn(phone);
    console.log(`[Sappay Prod] Initialisation: ${amount} FCFA via ${method} (${formattedPhone})`);
    const invoiceResponse = await fetch(`${publicUrl}/invoice/`, {
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
          // BF
        },
        amount: parseFloat(String(amount)).toFixed(2),
        note: `Ordonnance Direct - ${method.toUpperCase()}`
      })
    });
    const invoiceData = await safeJson(invoiceResponse);
    console.log("[Sappay Prod] Donn\xE9es facture:", JSON.stringify(invoiceData, null, 2));
    let invoiceId = invoiceData.response?.invoice_detail?.invoice_id || invoiceData.invoice_detail?.invoice_id || invoiceData.response?.invoice_id || invoiceData.invoice_id || invoiceData.id;
    if (!invoiceId) {
      const findId = (obj) => {
        if (!obj) return null;
        if (typeof obj === "string" && obj.match(/^W[A-Z0-9]{5,}$/)) return obj;
        if (typeof obj === "object" && !Array.isArray(obj)) {
          const keys = ["invoice_id", "id", "uid", "reference", "invoiceId", "response"];
          for (const k of keys) {
            if (typeof obj[k] === "string" && obj[k].match(/^W[A-Z0-9]{5,}$/)) return obj[k];
          }
          for (const k in obj) {
            const res = findId(obj[k]);
            if (res) return res;
          }
        }
        return null;
      };
      invoiceId = findId(invoiceData);
    }
    if (!invoiceId) {
      const getError = (data) => {
        if (!data) return null;
        if (typeof data.message === "string" && data.message.length > 0) return data.message;
        if (data.error) {
          if (typeof data.error === "string" && data.error.length > 0) return data.error;
          if (typeof data.error === "object" && Object.keys(data.error).length > 0) {
            return data.error.message || data.error.description || JSON.stringify(data.error);
          }
        }
        return null;
      };
      const errorMsg = getError(invoiceData) || "Identifiant de facture introuvable.";
      throw new Error(`Erreur Sappay: ${errorMsg}`);
    }
    const processorId = SAPPAY_PROCESSORS[method];
    const pushOperators = ["moov", "coris"];
    const isPush = pushOperators.includes(method.toLowerCase());
    if (isPush) {
      console.log(`[Sappay Prod] PUSH Flow: D\xE9clenchement /get-otp/ pour ${method}...`);
      const otpResponse = await fetch(`${checkoutUrl}/get-otp/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          customer_msisdn: formattedPhone,
          invoice_id: invoiceId,
          payment_processor_id: processorId
        })
      });
      const otpData = await safeJson(otpResponse);
      console.log(`[Sappay Prod] R\xE9ponse OTP:`, JSON.stringify(otpData, null, 2));
      if (!otpResponse.ok || otpData.success === false) {
        const getError = (data) => {
          if (!data) return null;
          if (typeof data.message === "string" && data.message.length > 0) return data.message;
          if (data.error) {
            if (typeof data.error === "string" && data.error.length > 0) return data.error;
            if (typeof data.error === "object" && Object.keys(data.error).length > 0) {
              return data.error.message || data.error.description || JSON.stringify(data.error);
            }
          }
          if (data.response && typeof data.response.message === "string") return data.response.message;
          return null;
        };
        const msg = getError(otpData) || "\xC9chec de l'envoi du code par SMS.";
        throw new Error(`Erreur op\xE9rateur: ${msg}`);
      }
      const transId = otpData.response?.trans_id || otpData.trans_id || otpData.transaction_id;
      return {
        success: true,
        invoiceId,
        processorId,
        transId,
        otpRequired: true,
        flowType: "PUSH-OTP",
        normalizedPhone: formattedPhone
      };
    }
    return {
      success: true,
      invoiceId,
      processorId,
      otpRequired: false,
      flowType: "PULL-OTP",
      normalizedPhone: formattedPhone
    };
  };
  const handleProductionPaymentPerform = async (invoiceId, processorId, phone, otp, trans_id, amount, email) => {
    const checkoutUrl = "https://api.prod.sappay.net/api/checkout";
    const token = await getSappayToken(false);
    const formattedPhone = cleanMsisdn(phone);
    const body = {
      invoice_id: invoiceId,
      payment_processor_id: processorId,
      customer_msisdn: formattedPhone,
      otp
    };
    if (trans_id) body.trans_id = trans_id;
    if (amount) body.amount = amount;
    if (email) body.email = email || "client@e-recharge.app";
    console.log(`[Sappay Prod] Ex\xE9cution du paiement: Facture=${invoiceId}, MSISDN=${formattedPhone}, Mode=${processorId}...`);
    const performResponse = await fetch(`${checkoutUrl}/perform/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const performData = await safeJson(performResponse);
    console.log(`[Sappay Prod] R\xE9sultat Perform:`, JSON.stringify(performData, null, 2));
    let transactionStatus = "";
    if (performData.response?.status) {
      transactionStatus = String(performData.response.status).toUpperCase();
    } else if (performData.invoice_detail?.status) {
      transactionStatus = String(performData.invoice_detail.status).toUpperCase();
    } else if (performData.invoice_details?.status) {
      transactionStatus = String(performData.invoice_details.status).toUpperCase();
    } else if (performData.status && typeof performData.status === "string" && !performData.status.match(/^\d+$/)) {
      transactionStatus = String(performData.status).toUpperCase();
    }
    const messageLower = String(performData.message || "").toLowerCase();
    const isFailed = transactionStatus === "FAILED" || transactionStatus === "ERROR" || transactionStatus === "REJECTED" || performData.success === false || performData.success === "false" || messageLower.includes("failed") || messageLower.includes("\xE9chou\xE9") || messageLower.includes("failure") || performData.error && typeof performData.error === "object" && Object.keys(performData.error).length > 0;
    if (isFailed) {
      const extractError = (data) => {
        if (!data) return null;
        if (typeof data.message === "string" && data.message.length > 0) return data.message;
        if (typeof data.description === "string" && data.description.length > 0) return data.description;
        if (typeof data.error_description === "string" && data.error_description.length > 0) return data.error_description;
        if (data.error) {
          if (typeof data.error === "string" && data.error.length > 0) return data.error;
          if (typeof data.error === "object" && Object.keys(data.error).length > 0) {
            return data.error.message || data.error.description || JSON.stringify(data.error);
          }
        }
        if (data.response && typeof data.response.message === "string") return data.response.message;
        return null;
      };
      const rawMsg = extractError(performData) || "Le paiement a \xE9t\xE9 rejet\xE9 par l'op\xE9rateur (Transaction Failed).";
      let finalMsg = rawMsg;
      const msgLower = rawMsg.toLowerCase();
      if (msgLower.includes("otp") && (msgLower.includes("exist") || msgLower.includes("invalid") || msgLower.includes("incorrect"))) {
        finalMsg = "Code OTP incorrect. V\xE9rifiez et r\xE9essayez.";
      } else if (msgLower.includes("timeout") || msgLower.includes("d\xE9lai")) {
        finalMsg = "D\xE9lai d\xE9pass\xE9. Veuillez r\xE9essayer dans 60 secondes.";
      } else if (msgLower.includes("insufficient") || msgLower.includes("insuffisant")) {
        finalMsg = "Solde insuffisant sur ce num\xE9ro.";
      } else if (msgLower.includes("invalid number") || msgLower.includes("invalide") || msgLower.includes("num\xE9ro")) {
        finalMsg = "Num\xE9ro de t\xE9l\xE9phone invalide.";
      } else if (msgLower.includes("session") || msgLower.includes("403") || msgLower.includes("401")) {
        finalMsg = "Session expir\xE9e. Veuillez vous reconnecter.";
      } else if (msgLower.includes("network") || msgLower.includes("r\xE9seau") || msgLower.includes("connexion")) {
        finalMsg = "Probl\xE8me de connexion. V\xE9rifiez votre r\xE9seau.";
      } else if (msgLower.includes("failed") || msgLower.includes("fail") || msgLower.includes("\xE9chou\xE9")) {
        finalMsg = "La transaction a \xE9chou\xE9. Causes possibles : code OTP incorrect ou expir\xE9, solde insuffisant, ou op\xE9ration annul\xE9e sur votre t\xE9l\xE9phone.";
      }
      throw new Error(finalMsg);
    }
    return { success: true, data: performData };
  };
  app.post("/api/payment/init", async (req, res) => {
    const { amount, phone, email, method, isTest } = req.body;
    console.log(`[API Payment Init] Method: ${method}, IsTest: ${isTest}`);
    try {
      if (isTest) {
        const result = await handleSandboxPaymentInit(method);
        return res.json(result);
      } else {
        const result = await handleProductionPaymentInit(amount, phone, email, method);
        return res.json(result);
      }
    } catch (error) {
      console.error("[API Payment Init] Error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Erreur d'initialisation du paiement"
      });
    }
  });
  app.post("/api/payment/perform", async (req, res) => {
    const { invoiceId, processorId, phone, otp, trans_id, amount, email, isTest } = req.body;
    console.log(`[API Payment Perform] Test: ${isTest}, Invoice: ${invoiceId}`);
    try {
      if (isTest || invoiceId && invoiceId.startsWith("TEST_")) {
        const result = await handleSandboxPaymentPerform(invoiceId);
        return res.json(result);
      } else {
        const result = await handleProductionPaymentPerform(invoiceId, processorId, phone, otp, trans_id, amount, email);
        return res.json(result);
      }
    } catch (error) {
      console.error("[API Payment Perform] Error:", error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Le paiement a \xE9chou\xE9." });
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
    console.log("ENV VARS AVAILABLE:", Object.keys(process.env).filter((k) => k.includes("GEMINI") || k.includes("API") || k.includes("KEY")));
    console.log("GEMINI KEY:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) : "UNDEFINED");
  });
  server.keepAliveTimeout = 65e3;
  server.headersTimeout = 66e3;
  console.log("--- SCHEDULER STARTUP ---");
  cron.schedule("* * * * *", () => {
  });
}
startServer().catch((err) => {
  console.error("FAILED TO START SERVER:", err);
});
