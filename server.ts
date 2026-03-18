import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import crypto from 'crypto';

// ─── Token Database (simple JSON file) ───────────────────────────────────────

const TOKENS_FILE = path.join(process.cwd(), 'tokens.json');

function loadTokens(): Record<string, {
  email: string;
  createdAt: string;
  used: boolean;
  revokedAt?: string;
}> {
  if (!fs.existsSync(TOKENS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveTokens(tokens: Record<string, {
  email: string;
  createdAt: string;
  used: boolean;
  revokedAt?: string;
}>) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// ─── Email sender (Brevo REST API) ───────────────────────────────────────────

async function sendPremiumEmail(toEmail: string, token: string) {
  const apiKey = process.env.BREVO_API_KEY || '';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'AntiClickBaitLinks', email: 'noreply@anticlickbaitlinks.com' },
      to: [{ email: toEmail }],
      cc: process.env.YOUR_EMAIL ? [{ email: process.env.YOUR_EMAIL }] : undefined,
      subject: '🎉 Tu acceso Premium a AntiClickBaitLinks',
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #059669;">¡Gracias por tu compra!</h2>
          <p>Tu token de acceso Premium es:</p>
          <div style="background: #f0fdf4; border: 2px solid #059669; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <code style="font-size: 1.2rem; font-weight: bold; color: #065f46; letter-spacing: 2px;">${token}</code>
          </div>
          <p>Para activar tu cuenta:</p>
          <ol>
            <li>Abre <a href="https://anticlickbaitlinks.com">AntiClickBaitLinks</a></li>
            <li>Pulsa el candado 🔒 o el botón "¿Ya eres Premium?"</li>
            <li>Pega tu token y pulsa "Activar"</li>
          </ol>
          <p style="color: #6b7280; font-size: 0.85rem;">Guarda este email. Tu token es personal e intransferible.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Brevo error: ${error}`);
  }

  console.log('✅ Email sent via Brevo to:', toEmail);
}

// ─── PayPal webhook signature verification ───────────────────────────────────

function verifyPaypalWebhook(req: express.Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true;

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;

  const transmissionId = req.headers['paypal-transmission-id'] as string;
  const timestamp = req.headers['paypal-transmission-time'] as string;
  const certUrl = req.headers['paypal-cert-url'] as string;
  const actualSig = req.headers['paypal-transmission-sig'] as string;

  if (!transmissionId || !timestamp || !certUrl || !actualSig) return false;

  const message = `${transmissionId}|${timestamp}|${webhookId}|${crypto.createHash('crc32c' as any).update(JSON.stringify(req.body)).digest('hex')}`;
  const expectedSig = crypto.createHmac('sha256', webhookId).update(message).digest('base64');

  return crypto.timingSafeEqual(Buffer.from(actualSig), Buffer.from(expectedSig));
}

// ─── Express app ──────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use('/api/paypal-webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());

  // ── Fetch URL content ─────────────────────────────────────────────────────

  app.post("/api/fetch-url", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) throw new Error(`Failed to fetch URL: ${response.statusText}`);

      const html = await response.text();
      const $ = cheerio.load(html);
      $('script, style, nav, footer, header').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim();

      res.json({ text: text.substring(0, 15000) });
    } catch (error: any) {
      console.error("Error fetching URL:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── PayPal Webhook ────────────────────────────────────────────────────────

  app.post("/api/paypal-webhook", async (req, res) => {
    let event: any;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    if (!verifyPaypalWebhook(req)) {
      console.warn("⚠️ PayPal webhook signature invalid");
      return res.status(401).json({ error: "Invalid signature" });
    }

    console.log("📦 PayPal event received:", event.event_type);

    // ── Pago completado → generar token y enviar email ──────────────────────
    if (
      event.event_type === 'PAYMENT.CAPTURE.COMPLETED' ||
      event.event_type === 'CHECKOUT.ORDER.APPROVED'
    ) {
      const payerEmail =
        event.resource?.payer?.email_address ||
        event.resource?.payment_source?.paypal?.email_address;

      if (!payerEmail) {
        console.warn("⚠️ No email found in PayPal event");
        return res.status(200).json({ received: true });
      }

      const token = uuidv4();
      const tokens = loadTokens();
      tokens[token] = {
        email: payerEmail,
        createdAt: new Date().toISOString(),
        used: false,
      };
      saveTokens(tokens);

      console.log(`✅ Token generated for ${payerEmail}: ${token}`);

      try {
        await sendPremiumEmail(payerEmail, token);
        console.log(`📧 Email sent to ${payerEmail}`);
      } catch (emailError) {
        console.error("❌ Error sending email:", emailError);
      }
    }

    // ── Reembolso → revocar el token del usuario ────────────────────────────
    if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
      const payerEmail =
        event.resource?.payer?.email_address ||
        event.resource?.payment_source?.paypal?.email_address;

      if (payerEmail) {
        const tokens = loadTokens();
        let revoked = false;

        for (const [token, data] of Object.entries(tokens)) {
          if (data.email === payerEmail && !data.revokedAt) {
            tokens[token] = {
              ...data,
              used: true,
              revokedAt: new Date().toISOString(),
            };
            revoked = true;
            console.log(`🚫 Token revocado para ${payerEmail}: ${token}`);
          }
        }

        if (revoked) saveTokens(tokens);
      }
    }

    res.status(200).json({ received: true });
  });

  // ── Validate Token ────────────────────────────────────────────────────────

  app.post("/api/validate-token", async (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ valid: false, error: "Token required" });

    const tokens = loadTokens();
    const tokenData = tokens[token];

    if (!tokenData || tokenData.used || tokenData.revokedAt) {
      return res.status(200).json({ valid: false });
    }

    res.status(200).json({ valid: true, email: tokenData.email });
  });

  // ── Admin: generar token manualmente ─────────────────────────────────────

  app.post("/api/admin/generate-token", async (req, res) => {
    const { secret, email } = req.body;

    if (secret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!email) return res.status(400).json({ error: "Email required" });

    const token = uuidv4();
    const tokens = loadTokens();
    tokens[token] = { email, createdAt: new Date().toISOString(), used: false };
    saveTokens(tokens);

    try {
      await sendPremiumEmail(email, token);
      console.log(`📧 Token manual enviado a ${email}: ${token}`);
    } catch (e: any) {
      console.error("❌ Email failed:", e?.message || e);
    }

    res.json({ token, email });
  });

  // ── Vite / Static ─────────────────────────────────────────────────────────

  const distPath = path.join(process.cwd(), 'dist');
  const distExists = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));

  if (distExists) {
    console.log('Serving static files from dist/');
    app.use(express.static(distPath));
    app.get(/^(?!\/api\/).*$/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('Starting Vite dev server...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
