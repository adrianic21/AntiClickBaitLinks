import express from "express";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ─── Upstash Redis (token database) ──────────────────────────────────────────

interface TokenData {
  email: string;
  createdAt: string;
  used: boolean;
  revokedAt?: string;
}

async function redisGet(key: string): Promise<TokenData | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json() as { result: string | null };
  if (!data.result) return null;
  try {
    return JSON.parse(data.result) as TokenData;
  } catch {
    return null;
  }
}

async function redisSet(key: string, value: TokenData): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(JSON.stringify(value)),
  });
}

// List all token keys matching pattern token:*
async function redisKeys(pattern: string): Promise<string[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return [];

  const res = await fetch(`${url}/keys/${encodeURIComponent(pattern)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json() as { result: string[] };
  return data.result || [];
}

// ─── Token helpers ────────────────────────────────────────────────────────────

async function getToken(token: string): Promise<TokenData | null> {
  return redisGet(`token:${token}`);
}

async function saveToken(token: string, data: TokenData): Promise<void> {
  await redisSet(`token:${token}`, data);
}

async function revokeTokensByEmail(email: string): Promise<void> {
  const keys = await redisKeys('token:*');
  for (const key of keys) {
    const tokenId = key.replace('token:', '');
    const data = await redisGet(key);
    if (data && data.email === email && !data.revokedAt) {
      await saveToken(tokenId, {
        ...data,
        used: true,
        revokedAt: new Date().toISOString(),
      });
      console.log(`🚫 Token revocado para ${email}: ${tokenId}`);
    }
  }
}

// ─── IP-based usage tracking (free tier limit) ───────────────────────────────

const FREE_LIMIT = 10;
const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function getClientIp(req: express.Request): string {
  // Railway puts the real IP in x-forwarded-for
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

async function getUsageCount(ip: string): Promise<number> {
  const data = await redisGet(`usage:${ip}` as any);
  if (!data) return 0;
  // We store usage as { count, windowStart } — reuse TokenData fields creatively
  const usage = data as any;
  const windowStart = usage.windowStart || 0;
  if (Date.now() - windowStart > USAGE_WINDOW_MS) return 0; // window expired
  return usage.count || 0;
}

async function incrementUsage(ip: string): Promise<number> {
  const existing = await redisGet(`usage:${ip}` as any);
  const usage = existing as any;
  const now = Date.now();

  let count = 1;
  let windowStart = now;

  if (usage && (now - (usage.windowStart || 0)) < USAGE_WINDOW_MS) {
    count = (usage.count || 0) + 1;
    windowStart = usage.windowStart || now;
  }

  await redisSet(`usage:${ip}` as any, { count, windowStart, email: '', createdAt: new Date().toISOString(), used: false } as any);
  return count;
}

async function getUsageResetTime(ip: string): Promise<number | null> {
  const data = await redisGet(`usage:${ip}` as any);
  if (!data) return null;
  const usage = data as any;
  if (!usage.windowStart) return null;
  const resetAt = usage.windowStart + USAGE_WINDOW_MS;
  if (Date.now() > resetAt) return null;
  return resetAt;
}

// ─── Token device binding ─────────────────────────────────────────────────────

async function getTokenDevice(token: string): Promise<string | null> {
  const data = await redisGet(`device:${token}` as any);
  return data ? (data as any).deviceId || null : null;
}

async function bindTokenToDevice(token: string, deviceId: string): Promise<void> {
  await redisSet(`device:${token}` as any, { deviceId, email: '', createdAt: new Date().toISOString(), used: false } as any);
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

  // ── Rate limiting ─────────────────────────────────────────────────────────

  // General API limit: 60 requests per minute per IP
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
  });

  // Strict limit for token validation: 10 per minute per IP (prevents brute force)
  const tokenLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many token attempts, please wait.' },
  });

  // Admin endpoint: 5 per minute per IP
  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Admin rate limit exceeded.' },
  });

  app.use('/api/fetch-url', generalLimiter);
  app.use('/api/youtube', generalLimiter);
  app.use('/api/pdf-upload', generalLimiter);
  app.use('/api/mistral', generalLimiter);
  app.use('/api/deepseek', generalLimiter);
  app.use('/api/validate-token', tokenLimiter);
  app.use('/api/check-limit', generalLimiter);
  app.use('/api/admin/generate-token', adminLimiter);

  // ── Fetch URL content ─────────────────────────────────────────────────────

  // Helper: extract clean text from HTML using Cheerio
  function extractFromHtml(html: string): { text: string; title: string } {
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '';

    $(
      'script, style, noscript, iframe, ' +
      'nav, footer, header, aside, ' +
      '[id*="cookie"], [class*="cookie"], [id*="consent"], [class*="consent"], ' +
      '[id*="gdpr"], [class*="gdpr"], [id*="banner"], [class*="banner"], ' +
      '[id*="popup"], [class*="popup"], [id*="modal"], [class*="modal"], ' +
      '[id*="overlay"], [class*="overlay"], [id*="notice"], [class*="notice"], ' +
      '[id*="ad-"], [class*="ad-"], [id*="-ad"], [class*="-ad"], ' +
      '[id*="ads"], [class*="ads"], [class*="advertisement"], ' +
      '[class*="sponsored"], [id*="sponsored"], ' +
      '[class*="promo"], [id*="promo"], ' +
      '[class*="paywall"], [id*="paywall"], ' +
      '[class*="subscribe"], [id*="subscribe"], ' +
      '[class*="newsletter"], [id*="newsletter"], ' +
      '[class*="share"], [id*="share"], ' +
      '[class*="social"], [id*="social"], ' +
      '[class*="sidebar"], [id*="sidebar"], ' +
      '[class*="related"], [id*="related"], ' +
      '[class*="recommendation"], ' +
      '[class*="comment"], [id*="comment"]'
    ).remove();

    const articleEl = $('article').first();
    const mainEl = $('main').first();
    const contentEl = $('[class*="article-body"], [class*="article__body"], [class*="story-body"], [class*="entry-content"], [class*="post-content"], [class*="content-body"]').first();

    let text = '';
    if (articleEl.length) text = articleEl.text();
    else if (contentEl.length) text = contentEl.text();
    else if (mainEl.length) text = mainEl.text();
    else text = $('body').text();

    return { text: text.replace(/\s+/g, ' ').trim(), title: title.trim() };
  }

  // Helper: fetch via Jina Reader (handles JS-rendered sites, anti-bot protection)
  async function fetchViaJina(url: string): Promise<{ text: string; title: string }> {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Jina fetch failed: ${response.status}`);
    const text = await response.text();
    if (!text || text.length < 100) throw new Error('Jina returned too little content');

    // Extract title from first line if Jina includes it
    const lines = text.split('\n').filter(l => l.trim());
    const title = lines[0]?.startsWith('Title:') ? lines[0].replace('Title:', '').trim() : '';
    const body = title ? lines.slice(1).join(' ') : text;

    return { text: body.substring(0, 15000), title };
  }

  app.post("/api/fetch-url", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    // ── Handle PDF URLs directly ──────────────────────────────────────────
    if (url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('pdf')) {
      try {
        const pdfRes = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const data = await pdfParse(buffer);
          const text = data.text?.replace(/\s+/g, ' ').trim() || '';
          if (text.length > 100) {
            const title = data.info?.Title || '';
            console.log(`✅ Fetched PDF via URL (${text.length} chars)`);
            return res.json({ text: text.substring(0, 20000), title, type: 'pdf' });
          }
        }
      } catch (pdfErr: any) {
        console.warn('PDF URL fetch failed, trying as HTML:', pdfErr.message);
      }
    }

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    ];

    // ── Strategy 1: Direct Cheerio scraping ──────────────────────────────────
    for (const userAgent of userAgents) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Upgrade-Insecure-Requests': '1',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) continue;

        const html = await response.text();
        const { text, title } = extractFromHtml(html);

        // Only accept if we got meaningful content (>200 chars)
        if (text.length > 200) {
          console.log(`✅ Fetched via Cheerio (${text.length} chars)`);
          return res.json({ text: text.substring(0, 15000), title });
        }
      } catch {
        // Try next user agent
      }
    }

    // ── Strategy 2: Jina Reader (JS-rendered sites, anti-bot protected) ─────
    try {
      console.log(`🔄 Cheerio failed, trying Jina Reader...`);
      const { text, title } = await fetchViaJina(url);
      console.log(`✅ Fetched via Jina (${text.length} chars)`);
      return res.json({ text, title });
    } catch (jinaError: any) {
      console.error('Jina fetch failed:', jinaError.message);
    }

    // ── All strategies failed ─────────────────────────────────────────────────
    console.error("All fetch strategies failed for:", url);
    res.status(500).json({ error: 'Failed to fetch URL' });
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
      await saveToken(token, {
        email: payerEmail,
        createdAt: new Date().toISOString(),
        used: false,
      });

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
        await revokeTokensByEmail(payerEmail);
      }
    }

    res.status(200).json({ received: true });
  });

  // ── Validate Token (with device binding) ────────────────────────────────

  app.post("/api/validate-token", async (req, res) => {
    const { token, deviceId } = req.body;
    if (!token) return res.status(400).json({ valid: false, error: "Token required" });

    const tokenData = await getToken(token);
    if (!tokenData || tokenData.used || tokenData.revokedAt) {
      return res.status(200).json({ valid: false });
    }

    // Device binding: if deviceId provided, check or bind
    if (deviceId) {
      const boundDevice = await getTokenDevice(token);
      if (!boundDevice) {
        // First time activating — bind to this device
        await bindTokenToDevice(token, deviceId);
      } else if (boundDevice !== deviceId) {
        // Different device — reject
        return res.status(200).json({ valid: false, reason: 'device_mismatch' });
      }
    }

    res.status(200).json({ valid: true, email: tokenData.email });
  });

  // ── Check / record usage limit (IP-based) ───────────────────────────────

  app.post("/api/check-limit", async (req, res) => {
    const { record, isPremium } = req.body;
    if (isPremium) return res.json({ allowed: true, remaining: null, resetAt: null });

    const ip = getClientIp(req);
    const count = await getUsageCount(ip);

    if (record) {
      // Record a new usage
      if (count >= FREE_LIMIT) {
        const resetAt = await getUsageResetTime(ip);
        return res.json({ allowed: false, remaining: 0, resetAt });
      }
      const newCount = await incrementUsage(ip);
      return res.json({ allowed: true, remaining: FREE_LIMIT - newCount, resetAt: null });
    } else {
      // Just check without recording
      const remaining = Math.max(0, FREE_LIMIT - count);
      const resetAt = count >= FREE_LIMIT ? await getUsageResetTime(ip) : null;
      return res.json({ allowed: count < FREE_LIMIT, remaining, resetAt });
    }
  });

  // ── Admin: generar token manualmente ─────────────────────────────────────

  app.post("/api/admin/generate-token", async (req, res) => {
    const { secret, email } = req.body;

    if (secret !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!email) return res.status(400).json({ error: "Email required" });

    const token = uuidv4();
    await saveToken(token, {
      email,
      createdAt: new Date().toISOString(),
      used: false,
    });

    try {
      await sendPremiumEmail(email, token);
      console.log(`📧 Token manual enviado a ${email}: ${token}`);
    } catch (e: any) {
      console.error("❌ Email failed:", e?.message || e);
    }

    res.json({ token, email });
  });


  // ── YouTube transcript extractor ─────────────────────────────────────────

  app.post("/api/youtube", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    // Extract video ID from various YouTube URL formats
    const videoIdMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (!videoIdMatch) return res.status(400).json({ error: "Invalid YouTube URL" });

    const videoId = videoIdMatch[1];

    // Fetch transcript via Jina Reader (most reliable no-key method)
    try {
      const jinaUrl = `https://r.jina.ai/https://www.youtube.com/watch?v=${videoId}`;
      const jinaRes = await fetch(jinaUrl, {
        headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
        signal: AbortSignal.timeout(25000),
      });

      if (!jinaRes.ok) throw new Error(`Jina failed: ${jinaRes.status}`);

      const text = await jinaRes.text();
      if (!text || text.length < 100) throw new Error('No transcript content');

      // Extract title from Jina output
      const lines = text.split('\n').filter(l => l.trim());
      const titleLine = lines.find(l => l.startsWith('Title:'));
      const title = titleLine ? titleLine.replace('Title:', '').trim() : '';
      const body = text.replace(titleLine || '', '').trim();

      return res.json({ text: body.substring(0, 20000), title, type: 'youtube' });
    } catch (err: any) {
      console.error('YouTube transcript error:', err.message);
      return res.status(500).json({ error: 'Could not extract transcript from this video. Make sure it has subtitles enabled.' });
    }
  });

  // ── PDF extractor (from URL) ──────────────────────────────────────────────
  // Handled inside /api/fetch-url automatically when URL ends in .pdf

  // ── PDF upload ────────────────────────────────────────────────────────────

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf') cb(null, true);
      else cb(new Error('Only PDF files are allowed'));
    },
  });

  app.post("/api/pdf-upload", upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No PDF file provided" });

    try {
      const data = await pdfParse(req.file.buffer);
      const text = data.text?.replace(/\s+/g, ' ').trim() || '';

      if (text.length < 100) {
        return res.status(422).json({ error: 'PDF appears to be scanned or image-based. Only text PDFs are supported.' });
      }

      const title = data.info?.Title || req.file.originalname.replace('.pdf', '') || 'PDF Document';
      return res.json({ text: text.substring(0, 20000), title, type: 'pdf' });
    } catch (err: any) {
      console.error('PDF parse error:', err.message);
      return res.status(500).json({ error: 'Could not read this PDF file.' });
    }
  });

  // ── Mistral Proxy (avoids CORS — Mistral blocks direct browser calls) ──────

  app.post("/api/mistral", async (req, res) => {
    const { apiKey, messages, model } = req.body;
    if (!apiKey || !messages) return res.status(400).json({ error: "apiKey and messages required" });

    try {
      const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "mistral-small-latest",
          messages,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Mistral proxy error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ── DeepSeek Proxy (avoids CORS — DeepSeek blocks direct browser calls) ────

  app.post("/api/deepseek", async (req, res) => {
    const { apiKey, messages, model } = req.body;
    if (!apiKey || !messages) return res.status(400).json({ error: "apiKey and messages required" });

    try {
      const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || "deepseek-chat",
          messages,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: err });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("DeepSeek proxy error:", error.message);
      res.status(500).json({ error: error.message });
    }
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
