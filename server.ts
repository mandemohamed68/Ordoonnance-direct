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
    if (!process.env.SMS_API_USER || !process.env.SMS_API_HASH) {
      throw new Error("Missing SMS API credentials. Please configure SMS_API_USER and SMS_API_HASH in the Settings menu.");
    }

    const apiUrl = "https://tfso.sappay.net/index.php";
    const params = new URLSearchParams({
      app: "ws",
      u: process.env.SMS_API_USER,
      h: process.env.SMS_API_HASH,
      op: "pv",
      to: to,
      msg: message,
      sender_id: process.env.SMS_SENDER_ID || "PHARMACIE"
    });

    const response = await fetch(`${apiUrl}?${params.toString()}`);
    const resultText = await response.text();
    console.log("SMS API response:", resultText);
    
    // Check if the API returned an error JSON
    try {
      const jsonResponse = JSON.parse(resultText);
      if (jsonResponse.status === "ERR") {
        throw new Error(`SMS API error: ${jsonResponse.error_string}`);
      }
    } catch (e) {
      // If it's not JSON, ignore and proceed
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

// --- Sappay Payment APIs ---

const SAPPAY_PROCESSORS = {
  orange: "11688813752134336",
  moov: "11688813838374580",
  telecel: "11744695746597207",
  coris: "11702302492453862"
};

async function getSappayToken() {
  if (!process.env.SAPPAY_CLIENT_ID || !process.env.SAPPAY_CLIENT_SECRET || !process.env.SAPPAY_USERNAME || !process.env.SAPPAY_PASSWORD) {
    throw new Error("Missing Sappay API credentials. Please configure SAPPAY_CLIENT_ID, SAPPAY_CLIENT_SECRET, SAPPAY_USERNAME, and SAPPAY_PASSWORD in the Settings menu.");
  }

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

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Sappay Auth Failed: ${err}`);
  }

  const data = await response.json();
  return data.access_token;
}

app.post("/api/payment/init", async (req, res) => {
  try {
    const { amount, phone, email, method } = req.body;
    const token = await getSappayToken();

    // 1. Create Invoice
    const invoiceRes = await fetch("https://api.prod.sappay.net/api/public/invoice/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        type: "SIMPLE",
        customer: {
          email: email || "client@ordonnance-direct.com",
          country: 1 // Burkina Faso
        },
        amount: amount.toString(),
        note: "Paiement Ordonnance Direct"
      })
    });

    if (!invoiceRes.ok) {
      const err = await invoiceRes.text();
      throw new Error(`Invoice creation failed: ${err}`);
    }

    const invoiceData = await invoiceRes.json();
    const invoiceId = invoiceData.invoice_id;

    // 2. If method is Moov (or Coris if configured), trigger get-otp
    let requiresOtp = false;
    if (method === 'moov' || method === 'coris') {
      requiresOtp = true;
      const otpRes = await fetch("https://api.prod.sappay.net/api/checkout/get-otp/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          customer_msisdn: phone,
          invoice_id: invoiceId,
          payment_processor_id: SAPPAY_PROCESSORS[method as keyof typeof SAPPAY_PROCESSORS]
        })
      });

      if (!otpRes.ok) {
        const err = await otpRes.text();
        throw new Error(`Get OTP failed: ${err}`);
      }
    } else if (method === 'orange' || method === 'telecel') {
      // Orange and Telecel might also use OTP in some flows, but according to docs:
      // "Tous les moyens de paiement ne nécessitent pas get-otp/"
      // We'll assume they still require the user to input an OTP generated via USSD on their phone.
      requiresOtp = true; 
    }

    res.json({ success: true, invoiceId, requiresOtp });
  } catch (error) {
    console.error("Payment Init Error:", error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/payment/perform", async (req, res) => {
  try {
    const { invoiceId, phone, otp, method } = req.body;
    const token = await getSappayToken();

    const processorId = SAPPAY_PROCESSORS[method as keyof typeof SAPPAY_PROCESSORS];
    if (!processorId) throw new Error("Invalid payment method");

    const performRes = await fetch("https://api.prod.sappay.net/api/checkout/perform/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        invoice_id: invoiceId,
        payment_processor_id: processorId,
        customer_msisdn: phone,
        otp: otp
      })
    });

    if (!performRes.ok) {
      const err = await performRes.text();
      throw new Error(`Payment perform failed: ${err}`);
    }

    const performData = await performRes.json();
    res.json({ success: true, data: performData });
  } catch (error) {
    console.error("Payment Perform Error:", error);
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
