import express from "express";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import path from "path";
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';

// ─── PDF text extraction (pdfjs-dist, no test-runner issues) ────────────────
async function extractPdfText(buffer: Buffer): Promise<{ text: string; title: string }> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  let title = '';
  try {
    const meta = await pdf.getMetadata();
    title = (meta.info as any)?.Title || '';
  } catch { /* ignore */ }

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ');
    fullText += pageText + '\n';
  }

  return {
    text: fullText.replace(/\s+/g, ' ').trim(),
    title,
  };
}

// ─── Upstash Redis (token database) ──────────────────────────────────────────

interface TokenData {
  email: string;
  createdAt: string;
  used: boolean;
  revokedAt?: string;
}

// FIX: Interfaces separadas para evitar abuso de tipos con TokenData
interface UsageData {
  count: number;
  windowStart: number;
}

interface DeviceData {
  deviceId: string;
  fingerprint?: string;
  boundAt?: string;
  lastValidatedAt?: string;
  transferCount?: number;
}

interface ArticleCacheEntry {
  text: string;
  title: string;
  type?: string;
  cachedAt: number;
}

const ARTICLE_CACHE_TTL_MS = 10 * 60 * 1000;
const articleCache = new Map<string, ArticleCacheEntry>();
const TRUSTED_NEWS_DOMAINS = [
  'reuters.com',
  'apnews.com',
  'bbc.com',
  'dw.com',
  'elpais.com',
  'ft.com',
  'theguardian.com',
  'lemonde.fr',
  'nytimes.com',
  'washingtonpost.com',
];

async function redisGet<T>(key: string): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json() as { result: string | null };
  if (!data.result) return null;
  try {
    return JSON.parse(data.result) as T;
  } catch {
    return null;
  }
}

async function redisSet<T>(key: string, value: T): Promise<void> {
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
  return redisGet<TokenData>(`token:${token}`);
}

async function saveToken(token: string, data: TokenData): Promise<void> {
  await redisSet<TokenData>(`token:${token}`, data);
}

async function revokeTokensByEmail(email: string): Promise<void> {
  const keys = await redisKeys('token:*');
  for (const key of keys) {
    const tokenId = key.replace('token:', '');
    const data = await redisGet<TokenData>(key);
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

// FIX: Una única función getClientIp — eliminada la duplicada que vivía dentro de startServer
function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function getUsageId(req: express.Request): string {
  const rawDeviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId.trim() : '';
  if (rawDeviceId && rawDeviceId.length >= 8 && rawDeviceId.length <= 128) {
    return `device:${rawDeviceId}`;
  }
  return `ip:${getClientIp(req)}`;
}

async function getUsageCount(ip: string): Promise<number> {
  const count = await redisGet<number>(`usage_count:${ip}`);
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

// FIX: Operación atómica con INCR de Redis para evitar race condition.
// Antes: GET + SET separados permitían que requests simultáneos burlasen el límite.
async function incrementUsage(ip: string): Promise<number> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return 1;

  const key = `usage_count:${ip}`;
  const windowKey = `usage_window:${ip}`;

  // Incremento atómico
  const incrRes = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}` },
  });
  const incrData = await incrRes.json() as { result: number };
  const newCount = incrData.result;

  // Si es el primer uso, establecer TTL de 24h en ambas claves
  if (newCount === 1) {
    const ttl = Math.floor(USAGE_WINDOW_MS / 1000);
    await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${ttl}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}` },
    });
    // Guardar el windowStart para poder calcular el resetAt
    await redisSet<UsageData>(windowKey, { count: newCount, windowStart: Date.now() });
    await fetch(`${redisUrl}/expire/${encodeURIComponent(windowKey)}/${ttl}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}` },
    });
  }

  return newCount;
}

async function getUsageResetTime(ip: string): Promise<number | null> {
  const data = await redisGet<UsageData>(`usage_window:${ip}`);
  if (!data?.windowStart) return null;
  const resetAt = data.windowStart + USAGE_WINDOW_MS;
  if (Date.now() > resetAt) return null;
  return resetAt;
}

// ─── Token device binding ─────────────────────────────────────────────────────

function buildDeviceFingerprint(req: express.Request, deviceId: string): string {
  const userAgent = String(req.headers['user-agent'] || '');
  const acceptLanguage = String(req.headers['accept-language'] || '');
  const secChUa = String(req.headers['sec-ch-ua'] || '');
  const secChUaPlatform = String(req.headers['sec-ch-ua-platform'] || '');
  const secChUaMobile = String(req.headers['sec-ch-ua-mobile'] || '');
  const serverSalt = process.env.DEVICE_FINGERPRINT_SALT || process.env.ADMIN_SECRET || 'anticlickbait-default-salt';

  const raw = [
    deviceId,
    userAgent,
    acceptLanguage,
    secChUa,
    secChUaPlatform,
    secChUaMobile,
    serverSalt,
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function getTokenDevice(token: string): Promise<DeviceData | null> {
  return redisGet<DeviceData>(`device:${token}`);
}

async function bindTokenToDevice(token: string, deviceData: DeviceData): Promise<void> {
  await redisSet<DeviceData>(`device:${token}`, deviceData);
}

function isDeviceTransferEnabled(): boolean {
  const value = String(process.env.PREMIUM_TRANSFER_ON_MISMATCH || '').toLowerCase().trim();
  if (!value) return false;
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return true;
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
// FIX: Reemplazada la verificación custom con crc32c (que no existe en Node.js crypto
// y lanzaría un error en producción) por la API oficial de verificación de PayPal.

async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function verifyPaypalWebhook(req: express.Request): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true;

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;

  try {
    const accessToken = await getPayPalAccessToken();

    const verifyRes = await fetch('https://api-m.paypal.com/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        auth_algo: req.headers['paypal-auth-algo'],
        cert_url: req.headers['paypal-cert-url'],
        transmission_id: req.headers['paypal-transmission-id'],
        transmission_sig: req.headers['paypal-transmission-sig'],
        transmission_time: req.headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: JSON.parse(req.body.toString()),
      }),
    });

    const data = await verifyRes.json() as { verification_status: string };
    return data.verification_status === 'SUCCESS';
  } catch (err) {
    console.error('PayPal webhook verification error:', err);
    return false;
  }
}

// ─── URL safety validation (SSRF protection) ─────────────────────────────────
// FIX: Evitar que un atacante envíe URLs internas (localhost, red Railway, metadatos cloud)

function isAllowedUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    // Block localhost and private IP ranges
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '169.254.169.254' || // AWS/GCP metadata
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── Express app ──────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();

  // FIX: Eliminado el `app.set('trust proxy', 1)` duplicado — solo se necesita uno
  app.set('trust proxy', 1);

  const PORT = Number(process.env.PORT) || 3000;
  app.use('/api/paypal-webhook', express.raw({ type: 'application/json' }));
  app.use(express.json());

  // ── Rate limiting ─────────────────────────────────────────────────────────

  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: getClientIp,
    message: { error: 'Too many requests, please slow down.' },
  });

  const tokenLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: getClientIp,
    message: { error: 'Too many token attempts, please wait.' },
  });

  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: getClientIp,
    message: { error: 'Admin rate limit exceeded.' },
  });

  app.use('/api/fetch-url', generalLimiter);
  app.use('/api/youtube', generalLimiter);
  app.use('/api/pdf-upload', generalLimiter);
  app.use('/api/mistral', generalLimiter);
  app.use('/api/deepseek', generalLimiter);
  app.use('/api/check-limit', generalLimiter);
  app.use('/api/validate-token', tokenLimiter);
  app.use('/api/admin', adminLimiter);

  // ── Fetch URL content ─────────────────────────────────────────────────────

  function cleanReadableText(text: string): string {
    return text
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/(Suscr[ií]bete|Subscribe|Sign in|Inicia sesi[oó]n|Reg[ií]strate|Accept cookies|Aceptar cookies|Cookie Policy).{0,120}/gi, ' ')
      .trim();
  }

  function scoreReadableCandidate(text: string): number {
    if (!text) return 0;
    const cleaned = cleanReadableText(text);
    if (cleaned.length < 120) return 0;

    const paragraphishBreaks = (text.match(/\n/g) || []).length;
    const sentenceCount = (cleaned.match(/[.!?](?:\s|$)/g) || []).length;
    const penaltyTerms = [
      'cookie', 'cookies', 'subscribe', 'subscription', 'sign in', 'newsletter',
      'advertisement', 'publicidad', 'anuncio', 'related articles', 'artículos relacionados',
      'latest news', 'últimas noticias', 'read more', 'seguir leyendo',
    ];
    const penalties = penaltyTerms.reduce((total, term) => (
      total + ((cleaned.toLowerCase().match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length * 120)
    ), 0);

    return cleaned.length + (paragraphishBreaks * 80) + (sentenceCount * 25) - penalties;
  }

  function extractStructuredArticleData($: cheerio.CheerioAPI): { text: string; title: string } {
    let bestText = '';
    let bestTitle = '';

    $('script[type="application/ld+json"]').each((_i, el) => {
      const raw = $(el).contents().text().trim();
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw);
        const nodes = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.['@graph'])
            ? parsed['@graph']
            : [parsed];

        for (const node of nodes) {
          const articleBody = typeof node?.articleBody === 'string' ? node.articleBody : '';
          const description = typeof node?.description === 'string' ? node.description : '';
          const alternativeText = Array.isArray(node?.text)
            ? node.text.filter((value: unknown) => typeof value === 'string').join('\n\n')
            : typeof node?.text === 'string'
              ? node.text
              : '';
          const candidateText = cleanReadableText([articleBody, description].filter(Boolean).join('\n\n'));
          const enrichedCandidate = cleanReadableText([candidateText, alternativeText].filter(Boolean).join('\n\n'));
          const candidateTitle =
            typeof node?.headline === 'string' ? node.headline :
            typeof node?.name === 'string' ? node.name :
            '';

          if (scoreReadableCandidate(enrichedCandidate) > scoreReadableCandidate(bestText)) {
            bestText = enrichedCandidate;
            bestTitle = candidateTitle || bestTitle;
          }
        }
      } catch {
        // Ignore malformed structured data blocks.
      }
    });

    return { text: bestText, title: bestTitle };
  }

  function extractFromHtml(html: string): { text: string; title: string } {
    const $ = cheerio.load(html);

    const metaTitle =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '';
    const metaDescription =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';
    const structured = extractStructuredArticleData($);

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
      '[class*="share-bar"], [class*="share-buttons"], ' +
      '[class*="social"], [id*="social"], ' +
      '[class*="sidebar"], [id*="sidebar"], ' +
      '[class*="related"], [id*="related"], ' +
      '[class*="recommendation"], ' +
      '[class*="comment"], [id*="comment"], ' +
      '[class*="tags"], [id*="tags"], ' +
      '[class*="breadcrumb"], [id*="breadcrumb"]'
    ).remove();

    const contentSelectors = [
      '[itemprop="articleBody"]', '[data-testid="articleBody"]',
      '[data-testid="storyBody"]', '[data-testid="article-content"]',
      '[data-component="text-block"]', '[data-module="ArticleBody"]',
      '[data-qa="article-body"]', '[data-cy="article-content"]',
      '.articleBody', '.article-body__content', '.article-content__content-group',
      '.StoryBodyCompanionColumn', '.caas-body', '.story-content',
      '.article-main-content', '.article__main', '.post-body',
      '.article-text', '.article__text', '.story__content',
      'article .article-body', 'article .article__body',
      'article .article-content', 'article .article__content',
      '.article-body', '.article__body',
      '.article-content', '.article__content',
      '.a_c', '.article_body', '.articulo-cuerpo',
      '.cuerpo-articulo', '.noticia__cuerpo',
      '.entry-content', '.post-content', '.post__content', '.body-content',
      '.story-body', '.story-body__inner', '.article__body-content',
      '.content-body', '.content__body', '.main-content', '.page-content',
      'article', 'main', '.content', '#content',
    ];

    const candidates: string[] = [];
    if (structured.text) candidates.push(structured.text);

    for (const sel of contentSelectors) {
      const el = $(sel).first();
      if (el.length) {
        const paragraphText = el.find('p')
          .map((_i, p) => $(p).text().trim())
          .get()
          .filter(Boolean)
          .filter(p => p.length > 35)
          .join('\n');
        const candidate = cleanReadableText(paragraphText || el.text());
        if (candidate.length > 120) candidates.push(candidate);
      }
    }

    const bodyParagraphs = $('article p, main p, [role="main"] p, body p')
      .map((_i, p) => $(p).text().trim())
      .get()
      .filter(Boolean)
      .filter(p => p.length > 40);
    if (bodyParagraphs.length) {
      candidates.push(cleanReadableText(bodyParagraphs.join('\n')));
    }

    candidates.push(cleanReadableText($('body').text()));

    const bestText = candidates
      .map(candidate => cleanReadableText(candidate))
      .sort((a, b) => scoreReadableCandidate(b) - scoreReadableCandidate(a))[0] || '';

    const withMetaDescription = metaDescription
      ? cleanReadableText(`${bestText}\n\n${metaDescription}`)
      : bestText;
    const withLeadParagraph = cleanReadableText([
      withMetaDescription,
      $('article h2, main h2, article strong, main strong')
        .map((_i, el) => $(el).text().trim())
        .get()
        .filter(Boolean)
        .slice(0, 4)
        .join('\n'),
    ].filter(Boolean).join('\n\n'));

    const text = scoreReadableCandidate(withLeadParagraph) > scoreReadableCandidate(withMetaDescription)
      ? withLeadParagraph
      : withMetaDescription;

    return {
      text,
      title: (structured.title || metaTitle).trim(),
    };
  }

  async function fetchViaJina(url: string): Promise<{ text: string; title: string }> {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
        'X-Remove-Selector': 'header,footer,nav,aside,.cookie,.banner,.popup,.modal,.sidebar,.related,.ads,.newsletter',
        'X-Timeout': '25',
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Jina fetch failed: ${response.status}`);
    const text = await response.text();
    if (!text || text.length < 100) throw new Error('Jina returned too little content');

    const lines = text.split('\n').filter(l => l.trim());
    const titleLine = lines.find(l => l.startsWith('Title:') || l.startsWith('# '));
    const title = titleLine
      ? titleLine.replace(/^Title:|^# /, '').trim()
      : '';
    const body = titleLine ? text.replace(titleLine, '').trim() : text;

    return { text: body.substring(0, 20000), title };
  }

  function getCachedArticle(url: string): ArticleCacheEntry | null {
    const cached = articleCache.get(url);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > ARTICLE_CACHE_TTL_MS) {
      articleCache.delete(url);
      return null;
    }
    return cached;
  }

  function setCachedArticle(url: string, entry: Omit<ArticleCacheEntry, 'cachedAt'>): ArticleCacheEntry {
    const cachedEntry: ArticleCacheEntry = {
      ...entry,
      cachedAt: Date.now(),
    };
    articleCache.set(url, cachedEntry);
    return cachedEntry;
  }

  async function fetchReadableArticle(url: string): Promise<{ text: string; title: string; type: string }> {
    const cachedArticle = getCachedArticle(url);
    if (cachedArticle) {
      return {
        text: cachedArticle.text,
        title: cachedArticle.title,
        type: cachedArticle.type || 'web',
      };
    }

    const candidateUrls = Array.from(new Set([
      url,
      url.includes('?') ? `${url}&output=amp` : `${url}?output=amp`,
      url.endsWith('/') ? `${url}amp/` : `${url}/amp`,
    ]));

    if (url.toLowerCase().endsWith('.pdf')) {
      try {
        const pdfRes = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const { text, title: pdfTitle } = await extractPdfText(buffer);
          if (text.length > 100) {
            const cachedPdf = setCachedArticle(url, {
              text: text.substring(0, 20000),
              title: pdfTitle,
              type: 'pdf',
            });
            return { text: cachedPdf.text, title: cachedPdf.title, type: 'pdf' };
          }
        }
      } catch {
        // Fall through to HTML strategies
      }
    }

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    ];

    for (const candidateUrl of candidateUrls) {
      for (const userAgent of userAgents) {
        try {
          const response = await fetch(candidateUrl, {
            headers: {
              'User-Agent': userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
              'Cache-Control': 'no-cache',
              'Upgrade-Insecure-Requests': '1',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
          });

          if (!response.ok) continue;

          const html = await response.text();
          const { text, title } = extractFromHtml(html);

          if (scoreReadableCandidate(text) > 180) {
            const cachedHtml = setCachedArticle(url, {
              text: text.substring(0, 20000),
              title,
              type: 'web',
            });
            return { text: cachedHtml.text, title: cachedHtml.title, type: 'web' };
          }
        } catch {
          // Try next candidate/agent
        }
      }
    }

    const { text, title } = await fetchViaJina(url);
    const cachedJina = setCachedArticle(url, { text, title, type: 'web' });
    return { text: cachedJina.text, title: cachedJina.title, type: 'web' };
  }

  app.post("/api/fetch-url", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    // FIX: Validar URL para prevenir SSRF antes de hacer cualquier fetch
    if (!isAllowedUrl(url)) {
      return res.status(400).json({ error: "Invalid or disallowed URL" });
    }

    const cachedArticle = getCachedArticle(url);
    if (cachedArticle) {
      return res.json({
        text: cachedArticle.text,
        title: cachedArticle.title,
        type: cachedArticle.type || 'web',
        cached: true,
      });
    }

    // FIX: Usar .endsWith('.pdf') en lugar de .includes('pdf') para evitar falsos positivos
    // (ej. pdfcandy.com o /update-pdf-viewer)
    if (url.toLowerCase().endsWith('.pdf')) {
      try {
        const pdfRes = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const { text, title: pdfTitle } = await extractPdfText(buffer);
          if (text.length > 100) {
            console.log(`✅ Fetched PDF via URL (${text.length} chars)`);
            const cachedPdf = setCachedArticle(url, {
              text: text.substring(0, 20000),
              title: pdfTitle,
              type: 'pdf',
            });
            return res.json({ text: cachedPdf.text, title: cachedPdf.title, type: 'pdf' });
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
          signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) continue;

        const html = await response.text();
        const { text, title } = extractFromHtml(html);

        if (scoreReadableCandidate(text) > 180) {
          console.log(`✅ Fetched via Cheerio (${text.length} chars)`);
          const cachedHtml = setCachedArticle(url, {
            text: text.substring(0, 20000),
            title,
            type: 'web',
          });
          return res.json({ text: cachedHtml.text, title: cachedHtml.title, type: 'web' });
        }
      } catch {
        // Try next user agent
      }
    }

    try {
      console.log(`🔄 Cheerio failed, trying Jina Reader...`);
      const { text, title } = await fetchViaJina(url);
      console.log(`✅ Fetched via Jina (${text.length} chars)`);
      const cachedJina = setCachedArticle(url, { text, title, type: 'web' });
      return res.json({ text: cachedJina.text, title: cachedJina.title, type: 'web' });
    } catch (jinaError: any) {
      console.error('Jina fetch failed:', jinaError.message);
    }

    console.error("All fetch strategies failed for:", url);
    res.status(500).json({ error: 'Failed to fetch URL' });
  });

  app.post("/api/rss-preview", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (!isAllowedUrl(url)) {
      return res.status(400).json({ error: 'Invalid or disallowed URL' });
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.8,es;q=0.7',
          'Cache-Control': 'no-cache',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        return res.status(400).json({ error: 'Could not load this RSS feed' });
      }

      const xml = await response.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      const feedTitle =
        $('channel > title').first().text().trim() ||
        $('feed > title').first().text().trim() ||
        'Custom feed';

      const items = $('item, entry')
        .map((_index, element) => {
          const node = $(element);
          const title = node.find('title').first().text().trim();
          const atomHref = node.find('link').first().attr('href');
          const textLink = node.find('link').first().text().trim();
          const guid = node.find('guid').first().text().trim();
          const urlValue = atomHref || textLink || (guid.startsWith('http') ? guid : '');
          const publishedAt =
            node.find('pubDate').first().text().trim() ||
            node.find('published').first().text().trim() ||
            node.find('updated').first().text().trim() ||
            null;

          if (!title || !urlValue || !/^https?:\/\//i.test(urlValue)) {
            return null;
          }

          return {
            title,
            url: urlValue,
            publishedAt,
          };
        })
        .get()
        .filter(Boolean)
        .slice(0, 25);

      return res.json({ title: feedTitle, items });
    } catch (error: any) {
      console.error('RSS preview failed:', error?.message || error);
      return res.status(500).json({ error: 'Could not parse this feed' });
    }
  });

  app.post("/api/deep-investigate", async (req, res) => {
    const { url, title } = req.body;
    if (!url || !title) {
      return res.status(400).json({ error: 'URL and title are required' });
    }

    try {
      const query = encodeURIComponent(`"${String(title).slice(0, 140)}"`);
      const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
      const rssResponse = await fetch(rssUrl, { signal: AbortSignal.timeout(12000) });
      if (!rssResponse.ok) {
        return res.status(500).json({ error: 'search_failed' });
      }

      const xml = await rssResponse.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      const candidates = $('item').map((_index, item) => {
        const link = $(item).find('link').first().text().trim();
        const itemTitle = $(item).find('title').first().text().trim();
        const source = $(item).find('source').first().text().trim();
        return { link, title: itemTitle, source };
      }).get()
        .filter((item) => item.link && item.title)
        .filter((item) => item.link !== url)
        .filter((item) => TRUSTED_NEWS_DOMAINS.some((domain) => item.link.includes(domain)))
        .slice(0, 6);

      const sources = [];

      for (const candidate of candidates) {
        try {
          const article = await fetchReadableArticle(candidate.link);
          if (!article.text || article.text.length < 140) continue;
          const sourceHost = (() => {
            try {
              return new URL(candidate.link).hostname.replace(/^www\./, '');
            } catch {
              return 'source';
            }
          })();
          sources.push({
            title: candidate.title,
            url: candidate.link,
            source: candidate.source || sourceHost,
            snippet: article.text.slice(0, 320).replace(/\s+/g, ' ').trim(),
          });
        } catch {
          // Keep trying other trusted sources.
        }

        if (sources.length >= 3) break;
      }

      return res.json({ sources });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'deep_investigation_failed' });
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

    // FIX: verifyPaypalWebhook ahora es async (usa la API oficial de PayPal)
    const isValid = await verifyPaypalWebhook(req);
    if (!isValid) {
      console.warn("⚠️ PayPal webhook signature invalid");
      return res.status(401).json({ error: "Invalid signature" });
    }

    console.log("📦 PayPal event received:", event.event_type);

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

  app.post("/api/validate-token", tokenLimiter, async (req, res) => {
    const { token, deviceId } = req.body;
    if (!token) return res.status(400).json({ valid: false, error: "Token required" });
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ valid: false, error: "Device ID required" });
    }
    const normalizedDeviceId = deviceId.trim();
    if (normalizedDeviceId.length < 8 || normalizedDeviceId.length > 128) {
      return res.status(400).json({ valid: false, error: "Invalid device ID" });
    }

    const tokenData = await getToken(token);
    if (!tokenData || tokenData.used || tokenData.revokedAt) {
      return res.status(200).json({ valid: false });
    }

    const currentFingerprint = buildDeviceFingerprint(req, normalizedDeviceId);
    const boundDevice = await getTokenDevice(token);

    if (!boundDevice) {
      await bindTokenToDevice(token, {
        deviceId: normalizedDeviceId,
        fingerprint: currentFingerprint,
        boundAt: new Date().toISOString(),
        lastValidatedAt: new Date().toISOString(),
        transferCount: 0,
      });
    } else {
      if (boundDevice.deviceId !== normalizedDeviceId) {
        if (isDeviceTransferEnabled()) {
          await bindTokenToDevice(token, {
            deviceId: normalizedDeviceId,
            fingerprint: currentFingerprint,
            boundAt: boundDevice.boundAt || new Date().toISOString(),
            lastValidatedAt: new Date().toISOString(),
            transferCount: (boundDevice.transferCount || 0) + 1,
          });
          return res.status(200).json({ valid: true, transferred: true, email: tokenData.email });
        }
        return res.status(200).json({ valid: false, reason: 'device_mismatch' });
      }

      // Compatibilidad con bindings antiguos (solo deviceId): se migra en caliente.
      if (boundDevice.fingerprint && boundDevice.fingerprint !== currentFingerprint) {
        return res.status(200).json({ valid: false, reason: 'device_mismatch' });
      }

      await bindTokenToDevice(token, {
        ...boundDevice,
        fingerprint: currentFingerprint,
        lastValidatedAt: new Date().toISOString(),
      });
    }

    res.status(200).json({ valid: true, email: tokenData.email });
  });

  // ── Check / record usage limit (IP-based) ───────────────────────────────

  app.post("/api/check-limit", async (req, res) => {
    const { record, isPremium } = req.body;
    if (isPremium) return res.json({ allowed: true, remaining: null, resetAt: null });

    const usageId = getUsageId(req);
    const count = await getUsageCount(usageId);

    if (record) {
      if (count >= FREE_LIMIT) {
        const resetAt = await getUsageResetTime(usageId);
        return res.json({ allowed: false, remaining: 0, resetAt });
      }
      const newCount = await incrementUsage(usageId);
      return res.json({ allowed: true, remaining: FREE_LIMIT - newCount, resetAt: null });
    } else {
      const remaining = Math.max(0, FREE_LIMIT - count);
      const resetAt = count >= FREE_LIMIT ? await getUsageResetTime(usageId) : null;
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

    const videoIdMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (!videoIdMatch) return res.status(400).json({ error: "Invalid YouTube URL" });

    const videoId = videoIdMatch[1];

    try {
      const jinaUrl = `https://r.jina.ai/https://www.youtube.com/watch?v=${videoId}`;
      const jinaRes = await fetch(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
          'X-Return-Format': 'text',
          'X-With-Generated-Alt': 'true',
          'X-Timeout': '30',
        },
        signal: AbortSignal.timeout(35000),
      });

      if (!jinaRes.ok) throw new Error(`Jina failed: ${jinaRes.status}`);

      const text = await jinaRes.text();
      if (!text || text.length < 200) throw new Error('No transcript content');

      const lines = text.split('\n').filter(l => l.trim());
      const titleLine = lines.find(l => l.startsWith('Title:') || l.startsWith('# '));
      const title = titleLine ? titleLine.replace(/^Title:|^# /, '').trim() : '';
      const body = titleLine ? text.replace(titleLine, '').trim() : text;

      return res.json({ text: body.substring(0, 25000), title, type: 'youtube' });
    } catch (err: any) {
      console.warn('YouTube Jina strategy failed, trying direct fetch:', err.message);
    }

    try {
      const ytRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (ytRes.ok) {
        const html = await ytRes.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : '';
        const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
        const desc = descMatch ? descMatch[1] : '';
        const dataMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
        const longDesc = dataMatch ? dataMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';

        const combined = [longDesc || desc].filter(Boolean).join('\n');
        if (combined.length > 100) {
          const note = 'Note: This is the video description as the transcript could not be extracted automatically.\n\n';
          return res.json({ text: (note + combined).substring(0, 20000), title, type: 'youtube' });
        }
      }
    } catch (err2: any) {
      console.warn('YouTube direct fetch failed:', err2.message);
    }

    return res.status(500).json({ error: 'Could not extract content from this video. The video may not have subtitles or may be restricted.' });
  });

  // ── PDF upload ────────────────────────────────────────────────────────────

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === 'application/pdf') cb(null, true);
      else cb(new Error('Only PDF files are allowed'));
    },
  });

  app.post("/api/pdf-upload", upload.single('pdf'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No PDF file provided" });

    try {
      const { text, title: pdfTitle } = await extractPdfText(req.file.buffer);

      if (text.length < 20) {
        return res.status(422).json({ error: 'pdf_no_text' });
      }

      const title = pdfTitle || req.file.originalname.replace('.pdf', '') || 'PDF Document';
      return res.json({ text: text.substring(0, 20000), title, type: 'pdf' });
    } catch (err: any) {
      console.error('PDF parse error:', err.message);
      return res.status(500).json({ error: 'Could not read this PDF file.' });
    }
  });

  // ── Mistral Proxy ──────────────────────────────────────────────────────────
  // El system prompt llega ya incluido en el array `messages` desde el cliente.
  // El proxy solo reenvía lo que recibe — no necesita saber nada del system prompt.

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

  // ── DeepSeek Proxy ─────────────────────────────────────────────────────────
  // Igual que Mistral — el system prompt viene en el array `messages` del cliente.

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
