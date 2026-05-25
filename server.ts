import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";
import cron from 'node-cron';
import { createServer as createViteServer } from "vite";

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();

  // Enable CORS for local development and mobile app access
  app.use(cors());

  // Hardcode port to 3000 per infrastructure requirements
  const PORT = 3000;

  console.log('--- SERVER STARTUP (V2) ---');
  console.log('Time:', new Date().toISOString());
  console.log('Directory:', __dirname);
  console.log('Port:', PORT);
  console.log('Environment:', process.env.NODE_ENV);

  app.use(express.json({ limit: '10mb' }));

  // Health check for Cloud Run
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // SMS API Endpoint
  app.post("/api/send-sms", async (req, res) => {
    const { to, message } = req.body;
    console.log(`[SMS] Attempting to send to ${to}`);
    try {
      if (!process.env.SMS_API_USER || !process.env.SMS_API_HASH) {
        console.warn(`[SMS] CONFIGURATION MANQUANTE: Simulation de l'envoi du message: "${message}" vers ${to}`);
        return res.json({ 
          success: true, 
          simulated: true, 
          info: "Message simulé car SMS_API_USER ou SMS_API_HASH n'est pas configuré dans les paramètres de l'application." 
        });
      }

      // Try primary URL
      let apiUrl = `https://aqilasms.com/api/v1/send?user=${process.env.SMS_API_USER}&hash=${process.env.SMS_API_HASH}&to=${to}&message=${encodeURIComponent(message)}&sender=${process.env.SMS_SENDER_ID || 'SanteDirect'}`;
      
      console.log(`[SMS] Calling API: aqilasms.com...`);
      let response;
      try {
        response = await fetch(apiUrl);
      } catch (err) {
        console.warn(`[SMS] Primary URL failed, trying api.aqilasms.com fallback...`, err);
        apiUrl = `https://api.aqilasms.com/api/v1/send?user=${process.env.SMS_API_USER}&hash=${process.env.SMS_API_HASH}&to=${to}&message=${encodeURIComponent(message)}&sender=${process.env.SMS_SENDER_ID || 'SanteDirect'}`;
        response = await fetch(apiUrl);
      }
      const resultText = await response.text();
      console.log(`[SMS] Response Status: ${response.status} ${response.statusText}`);
      console.log(`[SMS] Response Body: ${resultText.substring(0, 500)}`);
      
      let jsonResponse = null;
      try {
        jsonResponse = JSON.parse(resultText);
        if (jsonResponse && jsonResponse.status === 'error') {
          throw new Error(`SMS API error: ${jsonResponse.error_string || jsonResponse.message || 'Unknown error'}`);
        }
      } catch (e) {
        // Not JSON, that's fine if the result indicates success in text
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
        details: error instanceof Error && 'cause' in error ? (error as any).cause : undefined
      });
    }
  });

  // --- Payment APIs ---
  const SAPPAY_PROCESSORS = {
    orange: "11688813752134336",
    moov: "11688813838374580",
    telecel: "11744695746597207",
    coris: "11702302492453862"
  };

  const cleanMsisdn = (phone: string): string => {
    let cleaned = phone.replace(/[\s\-\(\)]+/g, "");
    cleaned = cleaned.replace(/^(\+226|226|00226)/, "");
    cleaned = cleaned.replace(/^0+/, "");
    return cleaned;
  };

  const safeJson = async (response: Response) => {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      const text = await response.text();
      console.error(`[Sappay] Expected JSON but got ${contentType}. Body snippet: ${text.substring(0, 200)}`);
      throw new Error(`Erreur API Sappay (Non-JSON): ${response.status} ${response.statusText}`);
    }
  };

  const getSappayToken = async (isTest: boolean = false) => {
    const clientId = (process.env.SAPPAY_CLIENT_ID || "np25qXFhh0Xq7zBnqmqmWLaC7TRwAX6Qg3GNc39").trim();
    const clientSecret = (process.env.SAPPAY_CLIENT_SECRET || "i1x9hvOO36wTgTOYQaUesWk8CcxjpY0tnTenq2ti8Ia4myRbEilyhiD7HbG4V4oOLUoMOIhFyliZiJQ0hdQrKsLJGVkOMH9TI23B5QiuIIuOuZFG4lrLiJq5fHH5dwNq").trim();
    const username = (process.env.SAPPAY_USERNAME || "mandemohamed68@gmail.com").trim();
    const password = (process.env.SAPPAY_PASSWORD || "mm@27071986").trim();

    const baseUrl = "https://api.prod.sappay.net/api/public";
    const authUrl = `${baseUrl}/authentication/`;
    
    console.log(`[Sappay Auth] Identifiers check: 
      - ClientID length: ${clientId.length} ${process.env.SAPPAY_CLIENT_ID ? '(From Env)' : '(Default Hardcoded)'}
      - ClientSecret length: ${clientSecret.length}
      - Username: ${username}
    `);
    
    // Some OAuth2 servers require client_id/secret in the Body, others in the Header
    const authParams = new URLSearchParams();
    authParams.append("grant_type", "password");
    authParams.append("username", username);
    authParams.append("password", password);
    
    // Full params including client credentials for compatibility
    const authParamsFull = new URLSearchParams(authParams);
    authParamsFull.append("client_id", clientId);
    authParamsFull.append("client_secret", clientSecret);

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

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
      console.log(`[Sappay Auth] Trial 1 Result: Status ${response.status}`, isTrial1Success ? "Success" : (data?.error || "No Token"));
      
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
        console.log(`[Sappay Auth] Trial 2 Result: Status ${response.status}`, isTrial2Success ? "Success" : (data?.error || "No Token"));
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
        console.log(`[Sappay Auth] Trial 3 Result: Status ${response.status}`, isTrial3Success ? "Success" : (data?.error || "No Token"));
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
            username: username,
            password: password
          })
        });
        data = await response.json().catch(() => null);
        const isTrial4Success = !!(data && data.access_token);
        console.log(`[Sappay Auth] Trial 4 Result: Status ${response.status}`, isTrial4Success ? "Success" : (data?.error || "No Token"));
      }
      
      if (!data || !data.access_token) {
        console.error("[Sappay Auth] Toutes les méthodes d'authentification ont échoué. Réponse finale:", JSON.stringify(data, null, 2));
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

  // API Status Check for Admin Dashboard
  app.get("/api/admin/system-status", (req, res) => {
    const sappayConfigured = !!((process.env.SAPPAY_CLIENT_ID || "np25qXFhh0Xq7zBnqmqmWLaC7TRwAX6Qg3GNc39") && 
                                (process.env.SAPPAY_CLIENT_SECRET || "i1x9hvOO36wTgTOYQaUesWk8CcxjpY0tnTenq2ti8Ia4myRbEilyhiD7HbG4V4oOLUoMOIhFyliZiJQ0hdQrKsLJGVkOMH9TI23B5QiuIIuOuZFG4lrLiJq5fHH5dwNq") && 
                                (process.env.SAPPAY_USERNAME || "mandemohamed68@gmail.com") && 
                                (process.env.SAPPAY_PASSWORD || "mm@27071986"));

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

  // --- Payment Core Logic ---
  const handleSandboxPaymentInit = async (method: string) => {
    console.log("[Sappay Sandbox] Simulated Init");
    return { 
      success: true, 
      invoiceId: `TEST_${Math.random().toString(36).substring(7).toUpperCase()}`,
      processorId: SAPPAY_PROCESSORS[method as keyof typeof SAPPAY_PROCESSORS],
      otpRequired: method === "moov" || method === "coris"
    };
  };

  const handleSandboxPaymentPerform = async (invoiceId: string) => {
    console.log("[Sappay Sandbox] Simulated Perform");
    await new Promise(resolve => setTimeout(resolve, 1500));
    return { 
      success: true, 
      data: { 
        status: "SUCCESS", 
        message: "Paiement simulé réussi (Sandbox Mode)",
        invoice_id: invoiceId 
      } 
    };
  };

  const handleProductionPaymentInit = async (amount: number, phone: string, email: string, method: string) => {
    const publicUrl = "https://api.prod.sappay.net/api/public";
    const checkoutUrl = "https://api.prod.sappay.net/api/checkout";
    
    const token = await getSappayToken(false);

    // Normalisation du numéro de téléphone (seulement les 8 chiffres locaux pour Sappay)
    const formattedPhone = cleanMsisdn(phone);
    
    console.log(`[Sappay Prod] Phone normalization: ${phone} -> ${formattedPhone}`);

    // 1. Create SIMPLE invoice before payment
    console.log(`[Sappay Prod] Creating invoice for ${amount}...`);
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
          country: 1 // BF
        },
        amount: String(amount),
        note: `Paiement Ordonnance Direct - Opérateur: ${method.toUpperCase()}`
      })
    });
    
    const invoiceData = await safeJson(invoiceResponse);
    console.log("[Sappay Prod] Données facture reçues:", JSON.stringify(invoiceData, null, 2));
    
    // Extraction exhaustive de l'ID de la facture
    const findId = (obj: any): string | null => {
      if (!obj || typeof obj !== 'object') return null;
      
      // Liste des clés de redirection ou d'ID probables
      const keys = ['invoice_id', 'id', 'invoice_uid', 'uid', 'reference', 'invoiceId'];
      for (const key of keys) {
        if (obj[key] && typeof obj[key] === 'string' && obj[key].length > 3) return obj[key];
      }
      
      // Recherche dans les sous-objets communs d'API
      const subKeys = ['response', 'data', 'invoice', 'details', 'invoice_details', 'invoice_detail'];
      for (const sk of subKeys) {
        if (obj[sk] && typeof obj[sk] === 'object') {
          const found = findId(obj[sk]);
          if (found) return found;
        }
      }
      return null;
    };

    let invoiceId = findId(invoiceData);
    
    // Fallback si l'ID est encodé différemment ou si l'ID est la 'response' elle-même
    if (!invoiceId) {
       if (typeof invoiceData.response === 'string' && invoiceData.response.length > 5) invoiceId = invoiceData.response;
       else if (typeof invoiceData.message === 'string' && invoiceData.message.match(/^W[A-Z0-9]{5,}$/)) invoiceId = invoiceData.message;
    }
    
    if (!invoiceId) {
      const fullDataStr = JSON.stringify(invoiceData);
      console.error("[Sappay Prod] ID introuvable. Structure:", fullDataStr);
      
      const isSuccess = invoiceData.success === true || invoiceData.status === "Success" || invoiceData.message === "Success";
      if (isSuccess) {
        throw new Error(`Succès Sappay mais identifiant manquant. Réponse: ${fullDataStr.substring(0, 100)}...`);
      }
      
      const errorDetail = invoiceData.error || invoiceData.message || invoiceData.detail || "ID introuvable";
      throw new Error(`Erreur facture: ${errorDetail}`);
    }
    const processorId = SAPPAY_PROCESSORS[method as keyof typeof SAPPAY_PROCESSORS];
    
    if (!processorId) {
      throw new Error(`Méthode de paiement non supportée: ${method}`);
    }

    // 2. Trigger OTP only if required by operator
    let otpRequired = false;
    // According to documentation: Moov and Coris use get-otp. Orange and Telecel use USSD first.
    if (method === "moov" || method === "coris") {
       console.log(`[Sappay Prod] Déclenchement de get-otp pour ${method} (${formattedPhone})...`);
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
       console.log(`[Sappay Prod] Réponse requête OTP pour ${method}:`, otpData);
       
       // Handle specific error cases for get-otp
       if (otpResponse.status >= 400) {
         const errorMsg = otpData.message || otpData.error || "Échec de l'envoi de l'OTP.";
         throw new Error(`Erreur OTP (${method}): ${errorMsg}`);
       }
       
       otpRequired = true;
    }

    return { success: true, invoiceId, processorId, otpRequired, normalizedPhone: formattedPhone };
  };

  const handleProductionPaymentPerform = async (invoiceId: string, processorId: string, phone: string, otp: string, trans_id?: string) => {
    const checkoutUrl = "https://api.prod.sappay.net/api/checkout";
    const token = await getSappayToken(false);

    // Normalisation du numéro de téléphone (seulement les 8 chiffres locaux pour Sappay)
    const formattedPhone = cleanMsisdn(phone);

    const body: any = {
      invoice_id: invoiceId,
      payment_processor_id: processorId,
      customer_msisdn: formattedPhone,
      otp: otp
    };

    // Moov might need trans_id if provided from a previous step or specific flow
    if (trans_id) body.trans_id = trans_id;

    console.log(`[Sappay Prod] Exécution du paiement: Facture=${invoiceId}, MSISDN=${formattedPhone}, Mode=${processorId}...`);
    const performResponse = await fetch(`${checkoutUrl}/perform/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    
    const performData = await safeJson(performResponse);
    console.log(`[Sappay Prod] Résultat Perform:`, JSON.stringify(performData, null, 2));
    
    // We look for transaction status. In Sappay, the HTTP status is sometimes 200, but the transaction status can be FAILED or SUCCESS.
    // So let's extract the actual transaction status.
    let transactionStatus = "";
    
    // Check nested response status first, as it holds the true status
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
    
    // Evaluate if the payment failed
    const isFailed = 
      transactionStatus === "FAILED" || 
      performData.success === false || 
      performData.success === "false" ||
      messageLower.includes("failed") || 
      messageLower.includes("échoué") || 
      messageLower.includes("failure") ||
      (performData.error && typeof performData.error === "object" && Object.keys(performData.error).length > 0);
    
    if (isFailed) {
       const msg = performData.message || 
                   performData.description || 
                   performData.error_description || 
                   (performData.error && typeof performData.error === "object" ? (performData.error.message || performData.error.description || JSON.stringify(performData.error)) : "") || 
                   "Le paiement a été rejeté par l'opérateur (Transaction Failed).";
       
       // Si le message est "Transaction Failed", on ajoute une suggestion
       let finalMsg = msg;
       if (msg === "Transaction Failed" || finalMsg.toLowerCase().includes("failed") || finalMsg.toLowerCase().includes("fail")) {
         finalMsg = "La transaction a échoué. Causes possibles : code OTP incorrect ou expiré, solde insuffisant, ou opération annulée sur votre téléphone.";
       }
       
       throw new Error(`Échec: ${finalMsg}`);
    }

    return { success: true, data: performData };
  };

  // --- Payment API Route Controllers ---
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
    const { invoiceId, processorId, phone, otp, trans_id, isTest } = req.body;
    console.log(`[API Payment Perform] Test: ${isTest}, Invoice: ${invoiceId}`);
    
    try {
      if (isTest || (invoiceId && invoiceId.startsWith('TEST_'))) {
        const result = await handleSandboxPaymentPerform(invoiceId);
        return res.json(result);
      } else {
        const result = await handleProductionPaymentPerform(invoiceId, processorId, phone, otp, trans_id);
        return res.json(result);
      }
    } catch (error) {
      console.error("[API Payment Perform] Error:", error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Le paiement a échoué." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serving static files in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
    console.log("ENV VARS AVAILABLE:", Object.keys(process.env).filter(k => k.includes('GEMINI') || k.includes('API') || k.includes('KEY')));
    console.log("GEMINI KEY:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) : "UNDEFINED");
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // --- Background Script Scheduler ---
  console.log('--- SCHEDULER STARTUP ---');
  cron.schedule('* * * * *', () => {
    // Logic for periodic tasks
  });
}

startServer().catch((err) => {
  console.error("FAILED TO START SERVER:", err);
});
