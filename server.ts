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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          response = await fetch(apiUrl, { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        console.warn(`[SMS] Primary URL failed, trying api.aqilasms.com fallback...`, err);
        apiUrl = `https://api.aqilasms.com/api/v1/send?user=${process.env.SMS_API_USER}&hash=${process.env.SMS_API_HASH}&to=${to}&message=${encodeURIComponent(message)}&sender=${process.env.SMS_SENDER_ID || 'SanteDirect'}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
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
    // Remove all non-digits
    let cleaned = phone.replace(/\D/g, "");
    
    // Remove common prefixes for Burkina Faso
    if (cleaned.startsWith("00226")) cleaned = cleaned.substring(5);
    else if (cleaned.startsWith("226")) cleaned = cleaned.substring(3);
    
    // If it starts with 0 (e.g. 01, 02, etc. in some formats), remove it if length > 8
    if (cleaned.length > 8 && cleaned.startsWith("0")) {
      cleaned = cleaned.substring(1);
    }
    
    // Ensure we only have the last 8 digits for Burkina operators
    if (cleaned.length > 8) {
      cleaned = cleaned.substring(cleaned.length - 8);
    }
    
    return cleaned;
  };

  const safeJson = async (response: Response) => {
    const contentType = response.headers.get("content-type");
    const text = await response.text();
    
    if (contentType && contentType.includes("application/json")) {
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error(`[Sappay] JSON parsing failed: ${e}. Body: ${text}`);
      }
    }

    // Fallback for non-JSON or failed JSON parsing
    console.log(`[Sappay Text Response] Statut: ${response.status}. Body: ${text.substring(0, 500)}`);
    
    // Si on a un texte brut qui ressemble à un ID de facture (ex: "W7VNFP9QFMX")
    // On exclut les mots de statut comme SUCCESS, OK, FAILED
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

    throw new Error(`Erreur API Sappay: ${response.status} ${response.statusText}. Réponse: ${text.substring(0, 100)}`);
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
    
    console.log(`[Sappay Prod] Initialisation: ${amount} FCFA via ${method} (${formattedPhone})`);

    // 1. Create SIMPLE invoice before payment
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
        amount: parseFloat(String(amount)).toFixed(2),
        note: `Ordonnance Direct - ${method.toUpperCase()}`
      })
    });
    
    const invoiceData = await safeJson(invoiceResponse);
    console.log("[Sappay Prod] Données facture:", JSON.stringify(invoiceData, null, 2));
    
    // Comprehensive Search for ID according to the user provided flow logic
    // Log shows: response.invoice_detail.invoice_id
    let invoiceId = invoiceData.response?.invoice_detail?.invoice_id || 
                    invoiceData.invoice_detail?.invoice_id || 
                    invoiceData.response?.invoice_id ||
                    invoiceData.invoice_id || 
                    invoiceData.id;

    if (!invoiceId) {
      // General search fallback if standard path fails
      const findId = (obj: any): string | null => {
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
      const getError = (data: any) => {
        if (!data) return null;
        if (typeof data.message === 'string' && data.message.length > 0) return data.message;
        if (data.error) {
          if (typeof data.error === 'string' && data.error.length > 0) return data.error;
          if (typeof data.error === 'object' && Object.keys(data.error).length > 0) {
            return data.error.message || data.error.description || JSON.stringify(data.error);
          }
        }
        return null;
      };
      const errorMsg = getError(invoiceData) || "Identifiant de facture introuvable.";
      throw new Error(`Erreur Sappay: ${errorMsg}`);
    }

    const processorId = SAPPAY_PROCESSORS[method as keyof typeof SAPPAY_PROCESSORS];
    
    // 2. Trigger OTP only for PUSH operators (Moov, Coris) per requested flow
    const pushOperators = ["moov", "coris"];
    const isPush = pushOperators.includes(method.toLowerCase());

    if (isPush) {
       console.log(`[Sappay Prod] PUSH Flow: Déclenchement /get-otp/ pour ${method}...`);
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
       console.log(`[Sappay Prod] Réponse OTP:`, JSON.stringify(otpData, null, 2));
       
       if (!otpResponse.ok || (otpData.success === false)) {
          const getError = (data: any) => {
            if (!data) return null;
            if (typeof data.message === 'string' && data.message.length > 0) return data.message;
            if (data.error) {
              if (typeof data.error === 'string' && data.error.length > 0) return data.error;
              if (typeof data.error === 'object' && Object.keys(data.error).length > 0) {
                return data.error.message || data.error.description || JSON.stringify(data.error);
              }
            }
            if (data.response && typeof data.response.message === 'string') return data.response.message;
            return null;
          };
          const msg = getError(otpData) || "Échec de l'envoi du code par SMS.";
          throw new Error(`Erreur opérateur: ${msg}`);
       }

       // Extraction de trans_id (le log montre response.trans_id)
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

  const handleProductionPaymentPerform = async (invoiceId: string, processorId: string, phone: string, otp: string, trans_id?: string, amount?: string, email?: string) => {
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

    // Sappay logs show email and amount are sometimes required in perform
    if (trans_id) body.trans_id = trans_id;
    if (amount) body.amount = amount;
    if (email) body.email = email || "client@e-recharge.app";

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
      transactionStatus === "ERROR" ||
      transactionStatus === "REJECTED" ||
      performData.success === false || 
      performData.success === "false" ||
      messageLower.includes("failed") || 
      messageLower.includes("échoué") || 
      messageLower.includes("failure") ||
      (performData.error && typeof performData.error === "object" && Object.keys(performData.error).length > 0);
    
    if (isFailed) {
       const extractError = (data: any) => {
         if (!data) return null;
         if (typeof data.message === 'string' && data.message.length > 0) return data.message;
         if (typeof data.description === 'string' && data.description.length > 0) return data.description;
         if (typeof data.error_description === 'string' && data.error_description.length > 0) return data.error_description;
         if (data.error) {
           if (typeof data.error === 'string' && data.error.length > 0) return data.error;
           if (typeof data.error === 'object' && Object.keys(data.error).length > 0) {
             return data.error.message || data.error.description || JSON.stringify(data.error);
           }
         }
         if (data.response && typeof data.response.message === 'string') return data.response.message;
         return null;
       };

       const rawMsg = extractError(performData) || "Le paiement a été rejeté par l'opérateur (Transaction Failed).";
       
       let finalMsg = rawMsg;
       const msgLower = rawMsg.toLowerCase();

       // mapping according to instructions
       if (msgLower.includes("otp") && (msgLower.includes("exist") || msgLower.includes("invalid") || msgLower.includes("incorrect"))) {
         finalMsg = "Code OTP incorrect. Vérifiez et réessayez.";
       } else if (msgLower.includes("timeout") || msgLower.includes("délai")) {
         finalMsg = "Délai dépassé. Veuillez réessayer dans 60 secondes.";
       } else if (msgLower.includes("insufficient") || msgLower.includes("insuffisant")) {
         finalMsg = "Solde insuffisant sur ce numéro.";
       } else if (msgLower.includes("invalid number") || msgLower.includes("invalide") || msgLower.includes("numéro")) {
         finalMsg = "Numéro de téléphone invalide.";
       } else if (msgLower.includes("session") || msgLower.includes("403") || msgLower.includes("401")) {
         finalMsg = "Session expirée. Veuillez vous reconnecter.";
       } else if (msgLower.includes("network") || msgLower.includes("réseau") || msgLower.includes("connexion")) {
         finalMsg = "Problème de connexion. Vérifiez votre réseau.";
       } else if (msgLower.includes("failed") || msgLower.includes("fail") || msgLower.includes("échoué")) {
         finalMsg = "La transaction a échoué. Causes possibles : code OTP incorrect ou expiré, solde insuffisant, ou opération annulée sur votre téléphone.";
       }
       
       throw new Error(finalMsg);
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
    const { invoiceId, processorId, phone, otp, trans_id, amount, email, isTest } = req.body;
    console.log(`[API Payment Perform] Test: ${isTest}, Invoice: ${invoiceId}`);
    
    try {
      if (isTest || (invoiceId && invoiceId.startsWith('TEST_'))) {
        const result = await handleSandboxPaymentPerform(invoiceId);
        return res.json(result);
      } else {
        const result = await handleProductionPaymentPerform(invoiceId, processorId, phone, otp, trans_id, amount, email);
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
