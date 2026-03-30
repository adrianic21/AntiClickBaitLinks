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

interface StoredUserAccount {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  passwordHash?: string;
  providers: string[];
  createdAt: string;
  lastLoginAt: string;
  encryptedApiKeys?: string;
  uiLanguage?: string;
  summaryLanguage?: string;
  preferredLength?: 'short' | 'medium' | 'long';
  speechRate?: number;
  provider?: string;
  darkMode?: boolean;
  deepResearchEnabled?: boolean;
  dontShowAgain?: boolean;
  appInsights?: {
    savedSummaries: number;
    totalMinutesSaved: number;
  };
  feedSources?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    enabled: boolean;
    itemsPerLoad?: number;
    createdAt: number;
  }>;
  premium?: {
    isPremium: boolean;
    token?: string;
  };
}

interface SessionData {
  token: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
}

interface OAuthStateData {
  provider: 'google';
  redirectTo: string;
  createdAt: string;
}

const ARTICLE_CACHE_TTL_MS = 10 * 60 * 1000;
const articleCache = new Map<string, ArticleCacheEntry>();
const SESSION_COOKIE_NAME = 'acbl_session';
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const LOCAL_KV_PATH = path.join(process.cwd(), 'data', 'local-kv.json');
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

// ─── User-Agent pool ──────────────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
];

function decodeHtmlEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      if (!Number.isFinite(code) || code <= 0) return '';
      try { return String.fromCodePoint(code); } catch { return ''; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const code = Number.parseInt(String(hex), 16);
      if (!Number.isFinite(code) || code <= 0) return '';
      try { return String.fromCodePoint(code); } catch { return ''; }
    });
}

function decodeHtmlResponseBody(response: Response): Promise<string> {
  return response.arrayBuffer().then((buf) => {
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const bytes = new Uint8Array(buf);
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
    const charset =
      (contentType.match(/charset=([^\s;]+)/)?.[1] || '').trim();
    const looksLatin1 =
      charset.includes('iso-8859-1') || charset.includes('latin1');

    if (looksLatin1 || replacementCount >= 6) {
      return new TextDecoder('iso-8859-1', { fatal: false }).decode(bytes);
    }
    return utf8;
  });
}

interface LocalKvEntry {
  value: unknown;
  expiresAt?: number;
}

function ensureLocalKvDir(): void {
  const dir = path.dirname(LOCAL_KV_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readLocalKvStore(): Record<string, LocalKvEntry> {
  try {
    ensureLocalKvDir();
    if (!fs.existsSync(LOCAL_KV_PATH)) return {};
    return JSON.parse(fs.readFileSync(LOCAL_KV_PATH, 'utf-8')) as Record<string, LocalKvEntry>;
  } catch {
    return {};
  }
}

function writeLocalKvStore(store: Record<string, LocalKvEntry>): void {
  ensureLocalKvDir();
  fs.writeFileSync(LOCAL_KV_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function getLocalKvEntry(key: string): LocalKvEntry | null {
  const store = readLocalKvStore();
  const entry = store[key];
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    delete store[key];
    writeLocalKvStore(store);
    return null;
  }
  return entry;
}

function setLocalKvEntry(key: string, value: unknown, ttlSeconds?: number): void {
  const store = readLocalKvStore();
  store[key] = {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
  };
  writeLocalKvStore(store);
}

function deleteLocalKvEntry(key: string): void {
  const store = readLocalKvStore();
  if (store[key]) {
    delete store[key];
    writeLocalKvStore(store);
  }
}

function listLocalKvKeys(pattern: string): string[] {
  const escapedPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const regex = new RegExp(`^${escapedPattern}$`);
  const store = readLocalKvStore();
  const keys: string[] = [];

  for (const key of Object.keys(store)) {
    const entry = store[key];
    if (entry?.expiresAt && entry.expiresAt <= Date.now()) {
      delete store[key];
      continue;
    }
    if (regex.test(key)) keys.push(key);
  }

  writeLocalKvStore(store);
  return keys;
}

async function redisGet<T>(key: string): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    const fallback = getLocalKvEntry(key);
    return (fallback?.value as T) ?? null;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["GET", key]),
    });

    const data = await res.json();

    if (!data.result) return null;

    return JSON.parse(data.result);

  } catch (err) {
    console.error("Redis GET failed:", err);
    const fallback = getLocalKvEntry(key);
    return (fallback?.value as T) ?? null;
  }
}

async function redisSet<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    setLocalKvEntry(key, value, ttlSeconds);
    return;
  }

  try {
    const command = ttlSeconds
      ? ["SET", key, JSON.stringify(value), "EX", String(ttlSeconds)]
      : ["SET", key, JSON.stringify(value)];

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    const data = await res.json();
    if (data.error) {
      console.error("Redis SET error:", data.error);
    }

  } catch (err) {
    console.error("Redis SET failed:", err);
    setLocalKvEntry(key, value, ttlSeconds);
  }
}

async function redisKeys(pattern: string): Promise<string[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return listLocalKvKeys(pattern);

  try {
    const res = await fetch(`${url}/keys/${encodeURIComponent(pattern)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as { result: string[] };
    return data.result || [];
  } catch {
    return listLocalKvKeys(pattern);
  }
}

async function redisDelete(key: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    deleteLocalKvEntry(key);
    return;
  }

  try {
    await fetch(`${url}/del/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    deleteLocalKvEntry(key);
  }
}

function getCookieValue(req: express.Request, name: string): string | null {
  const header = String(req.headers.cookie || '');
  const cookies = header.split(';').map(part => part.trim()).filter(Boolean);
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = cookie.slice(0, separatorIndex).trim();
    if (key !== name) continue;
    return decodeURIComponent(cookie.slice(separatorIndex + 1));
  }
  return null;
}

function buildSessionCookie(token: string, maxAgeSeconds = 60 * 60 * 24 * 30): string {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds};${secure}`;
}

function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0;${secure}`;
}

function getAccountEncryptionSecret(): string {
  return process.env.ACCOUNT_DATA_SECRET || process.env.ADMIN_SECRET || 'anticlickbait-account-secret';
}

function getNormalizedAppUrl(): string {
  return String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
}

function encryptJson(value: unknown): string {
  const secret = crypto.createHash('sha256').update(getAccountEncryptionSecret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf-8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptJson<T>(payload?: string): T | undefined {
  if (!payload) return undefined;
  try {
    const secret = crypto.createHash('sha256').update(getAccountEncryptionSecret()).digest();
    const buffer = Buffer.from(payload, 'base64');
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', secret, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
    return JSON.parse(decrypted) as T;
  } catch {
    return undefined;
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password: string, storedHash?: string): Promise<boolean> {
  if (!storedHash) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey as Buffer);
    });
  });
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

// ─── Token helpers ────────────────────────────────────────────────────────────

async function getToken(token: string): Promise<TokenData | null> {
  return redisGet<TokenData>(`token:${token}`);
}

async function saveToken(token: string, data: TokenData): Promise<void> {
  await redisSet<TokenData>(`token:${token}`, data);
}

async function getUserById(userId: string): Promise<StoredUserAccount | null> {
  return redisGet<StoredUserAccount>(`user:${userId}`);
}

async function saveUser(user: StoredUserAccount): Promise<void> {
  await redisSet<StoredUserAccount>(`user:${user.id}`, user);
  await redisSet<string>(`user_email:${user.email.toLowerCase()}`, user.id);
}

async function getUserByEmail(email: string): Promise<StoredUserAccount | null> {
  const userId = await redisGet<string>(`user_email:${email.toLowerCase()}`);
  if (!userId) return null;
  return getUserById(userId);
}

async function getOAuthLinkedUser(provider: string, providerUserId: string): Promise<StoredUserAccount | null> {
  const userId = await redisGet<string>(`oauth:${provider}:${providerUserId}`);
  if (!userId) return null;
  return getUserById(userId);
}

async function linkOAuthUser(provider: string, providerUserId: string, userId: string): Promise<void> {
  await redisSet<string>(`oauth:${provider}:${providerUserId}`, userId);
}

async function createSession(userId: string): Promise<SessionData> {
  const session: SessionData = {
    token: crypto.randomBytes(32).toString('base64url'),
    userId,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
  await redisSet<SessionData>(`session:${session.token}`, session);
  return session;
}

async function getSessionByToken(token: string): Promise<SessionData | null> {
  if (!token) return null;
  return redisGet<SessionData>(`session:${token}`);
}

async function saveSession(session: SessionData): Promise<void> {
  await redisSet<SessionData>(`session:${session.token}`, session);
}

async function getAuthenticatedUser(req: express.Request): Promise<StoredUserAccount | null> {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  const session = await getSessionByToken(token);
  if (!session) return null;
  const user = await getUserById(session.userId);
  if (!user) return null;
  session.lastSeenAt = new Date().toISOString();
  await saveSession(session);
  return user;
}

async function getAuthenticatedSession(req: express.Request): Promise<SessionData | null> {
  const token = getCookieValue(req, SESSION_COOKIE_NAME);
  if (!token) return null;
  return getSessionByToken(token);
}

async function deleteSession(token: string): Promise<void> {
  if (!token) return;
  await redisDelete(`session:${token}`);
}

async function saveOAuthState(state: string, data: OAuthStateData): Promise<void> {
  await redisSet<OAuthStateData>(`oauth_state:${state}`, data, OAUTH_STATE_TTL_SECONDS);
}

async function getOAuthState(state: string): Promise<OAuthStateData | null> {
  return redisGet<OAuthStateData>(`oauth_state:${state}`);
}

function toPublicUser(user: StoredUserAccount) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || null,
    providers: user.providers,
    isPremium: Boolean(user.premium?.isPremium),
  };
}

function buildAccountResponse(user: StoredUserAccount) {
  return {
    user: toPublicUser(user),
    account: {
      apiKeys: decryptJson<Record<string, string | undefined>>(user.encryptedApiKeys) || {},
      preferences: {
        uiLanguage: user.uiLanguage,
        summaryLanguage: user.summaryLanguage,
        preferredLength: user.preferredLength,
        speechRate: user.speechRate,
        provider: user.provider,
        darkMode: user.darkMode,
        deepResearchEnabled: user.deepResearchEnabled,
        dontShowAgain: user.dontShowAgain,
      },
      appInsights: user.appInsights || { savedSummaries: 0, totalMinutesSaved: 0 },
      feedSources: user.feedSources || [],
      premium: user.premium || { isPremium: false },
    },
  };
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
const USAGE_WINDOW_MS = 24 * 60 * 60 * 1000;

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

async function getUsageIdForRequest(req: express.Request): Promise<string> {
  const user = await getAuthenticatedUser(req);
  if (user) return `user:${user.id}`;
  return getUsageId(req);
}

async function getUsageCount(ip: string): Promise<number> {
  const count = await redisGet<number>(`usage_count:${ip}`);
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

async function incrementUsage(ip: string): Promise<number> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return 1;

  const key = `usage_count:${ip}`;
  const windowKey = `usage_window:${ip}`;

  const incrRes = await fetch(`${redisUrl}/incr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}` },
  });
  const incrData = await incrRes.json() as { result: number };
  const newCount = incrData.result;

  if (newCount === 1) {
    const ttl = Math.floor(USAGE_WINDOW_MS / 1000);
    await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${ttl}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}` },
    });
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

function isAllowedUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '169.254.169.254' ||
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

  app.get('/api/auth/me', async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(200).json({ user: null });
    return res.json({ user: toPublicUser(user) });
  });

  app.post('/api/auth/signup', tokenLimiter, async (req, res) => {
    const { email, password, name } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const displayName = String(name || '').trim() || normalizedEmail.split('@')[0] || 'User';
    const rawPassword = String(password || '');

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    if (rawPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await getUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'This email is already registered' });
    }

    const user: StoredUserAccount = {
      id: uuidv4(),
      email: normalizedEmail,
      displayName,
      passwordHash: await hashPassword(rawPassword),
      providers: ['password'],
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      appInsights: { savedSummaries: 0, totalMinutesSaved: 0 },
      premium: { isPremium: false },
      feedSources: [],
    };

    await saveUser(user);
    const session = await createSession(user.id);
    res.setHeader('Set-Cookie', buildSessionCookie(session.token));
    return res.status(201).json(buildAccountResponse(user));
  });

  app.post('/api/auth/login', tokenLimiter, async (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const rawPassword = String(password || '');

    const user = await getUserByEmail(normalizedEmail);
    if (!user || !(await verifyPassword(rawPassword, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.lastLoginAt = new Date().toISOString();
    await saveUser(user);
    const session = await createSession(user.id);
    res.setHeader('Set-Cookie', buildSessionCookie(session.token));
    return res.json(buildAccountResponse(user));
  });

  app.post('/api/auth/forgot-password', tokenLimiter, async (req, res) => {
    const { email, newPassword } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const rawPassword = String(newPassword || '');

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    if (rawPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(200).json({ ok: true });
    }

    user.passwordHash = await hashPassword(rawPassword);
    if (!user.providers.includes('password')) {
      user.providers.push('password');
    }
    await saveUser(user);
    return res.json({ ok: true });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const token = getCookieValue(req, SESSION_COOKIE_NAME);
    if (token) await deleteSession(token);
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.json({ ok: true });
  });

  app.get('/api/auth/google/start', async (_req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const appUrl = getNormalizedAppUrl();
    if (!clientId || !appUrl) {
      return res.redirect('/?authError=google_not_configured');
    }
    const state = crypto.randomBytes(16).toString('hex');
    await saveOAuthState(state, { provider: 'google', redirectTo: appUrl, createdAt: new Date().toISOString() });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${appUrl}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const denied = String(req.query.error || '');
    const appUrl = getNormalizedAppUrl();
    const stateData = await getOAuthState(state);
    if (denied) {
      return res.redirect('/?authError=google_access_denied');
    }
    if (!code || !stateData || stateData.provider !== 'google' || !appUrl) {
      return res.redirect('/?authError=google_invalid_state');
    }

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID || '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          redirect_uri: `${appUrl}/api/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };
      if (!tokenRes.ok || !tokenData.access_token) {
        console.error('Google token exchange failed:', tokenData);
        return res.redirect('/?authError=google_token_exchange_failed');
      }

      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const googleUser = await userRes.json() as { id: string; email: string; name?: string; picture?: string };
      if (!userRes.ok || !googleUser.id || !googleUser.email) {
        console.error('Google profile fetch failed:', googleUser);
        return res.redirect('/?authError=google_profile_failed');
      }

      let user = await getOAuthLinkedUser('google', googleUser.id);
      if (!user) user = await getUserByEmail(googleUser.email);

      if (!user) {
        user = {
          id: uuidv4(),
          email: googleUser.email.toLowerCase(),
          displayName: googleUser.name || googleUser.email.split('@')[0],
          avatarUrl: googleUser.picture,
          providers: ['google'],
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          appInsights: { savedSummaries: 0, totalMinutesSaved: 0 },
          premium: { isPremium: false },
          feedSources: [],
        };
      } else {
        user.displayName = user.displayName || googleUser.name || user.email.split('@')[0];
        user.avatarUrl = googleUser.picture || user.avatarUrl;
        user.lastLoginAt = new Date().toISOString();
        if (!user.providers.includes('google')) user.providers.push('google');
      }

      await saveUser(user);
      await linkOAuthUser('google', googleUser.id, user.id);
      const session = await createSession(user.id);
      res.setHeader('Set-Cookie', buildSessionCookie(session.token));
      return res.redirect('/?auth=success');
    } catch (error) {
      console.error('Google auth failed:', error);
      return res.redirect('/?authError=google_failed');
    }
  });

  app.get('/api/account', async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    return res.json(buildAccountResponse(user));
  });

  app.post('/api/account', async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { apiKeys, preferences, appInsights, feedSources, premium, profile } = req.body || {};
    if (apiKeys && typeof apiKeys === 'object') {
      user.encryptedApiKeys = encryptJson(apiKeys);
    }
    if (preferences && typeof preferences === 'object') {
      if (typeof preferences.uiLanguage === 'string') user.uiLanguage = preferences.uiLanguage;
      if (typeof preferences.summaryLanguage === 'string') user.summaryLanguage = preferences.summaryLanguage;
      if (preferences.preferredLength === 'short' || preferences.preferredLength === 'medium' || preferences.preferredLength === 'long') user.preferredLength = preferences.preferredLength;
      if (typeof preferences.speechRate === 'number') user.speechRate = preferences.speechRate;
      if (typeof preferences.provider === 'string') user.provider = preferences.provider;
      if (typeof preferences.darkMode === 'boolean') user.darkMode = preferences.darkMode;
      if (typeof preferences.deepResearchEnabled === 'boolean') user.deepResearchEnabled = preferences.deepResearchEnabled;
      if (typeof preferences.dontShowAgain === 'boolean') user.dontShowAgain = preferences.dontShowAgain;
    }
    if (appInsights && typeof appInsights.savedSummaries === 'number' && typeof appInsights.totalMinutesSaved === 'number') {
      user.appInsights = {
        savedSummaries: Math.max(0, appInsights.savedSummaries),
        totalMinutesSaved: Math.max(0, appInsights.totalMinutesSaved),
      };
    }
    if (Array.isArray(feedSources)) {
      user.feedSources = feedSources.slice(0, 40);
    }
    if (premium && typeof premium === 'object') {
      user.premium = {
        isPremium: Boolean(premium.isPremium),
        token: typeof premium.token === 'string' ? premium.token : user.premium?.token,
      };
    }
    if (profile && typeof profile === 'object') {
      if (typeof profile.displayName === 'string') {
        const trimmed = profile.displayName.trim();
        if (trimmed) {
          user.displayName = trimmed.slice(0, 60);
        }
      }
    }
    await saveUser(user);
    return res.json({ ok: true, user: toPublicUser(user) });
  });

  // ── Content extraction helpers ────────────────────────────────────────────

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

  function normalizeWhitespace(value: string): string {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isPlausibleOriginalTitle(title: string): boolean {
    const normalized = normalizeWhitespace(decodeHtmlEntities(title));
    if (!normalized || normalized.length < 8) return false;
    if (/^[\d\s\-–—|:/.,]+$/.test(normalized)) return false;

    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length < 2) return false;

    const letters = (normalized.match(/\p{L}/gu) || []).length;
    const digits = (normalized.match(/\d/g) || []).length;
    if (letters === 0) return false;
    if (digits > letters * 1.4) return false;

    const lowered = normalized.toLowerCase();
    const banned = ['home', 'homepage', 'front page', 'untitled', 'loading', 'access denied', '404', '403', '500'];
    return !banned.includes(lowered);
  }

  function pickBestOriginalTitle(...candidates: Array<string | null | undefined>): string {
    let best = '';
    let bestScore = -1;

    for (const candidate of candidates) {
      const normalized = normalizeWhitespace(decodeHtmlEntities(String(candidate || '')));
      if (!isPlausibleOriginalTitle(normalized)) continue;

      const words = normalized.split(/\s+/).length;
      const letters = (normalized.match(/\p{L}/gu) || []).length;
      const separators = (normalized.match(/[:\-–—|]/g) || []).length;
      const score = (words * 30) + letters - (separators * 3);

      if (score > bestScore) {
        best = normalized;
        bestScore = score;
      }
    }

    return best;
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

  // NEW: Extract embedded JavaScript data (Next.js, Nuxt, etc.)
  function extractEmbeddedJsData($: cheerio.CheerioAPI): string {
    const candidates: string[] = [];

    // Next.js __NEXT_DATA__
    const nextDataEl = $('script#__NEXT_DATA__');
    if (nextDataEl.length) {
      try {
        const raw = nextDataEl.text();
        const data = JSON.parse(raw);
        const stringified = JSON.stringify(data);
        // Extract long strings likely to be article content
        const matches = stringified.match(/"[^"\\]{300,}"/g) || [];
        const extracted = matches
          .map(m => m.slice(1, -1)
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, ' ')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
          )
          .filter(s => s.split(' ').length > 20) // at least 20 words
          .join('\n\n');
        if (extracted.length > 200) candidates.push(extracted);
      } catch { /* ignore */ }
    }

    // Nuxt __NUXT_DATA__ or window.__NUXT__
    $('script').each((_i, el) => {
      const content = $(el).text();
      if (!content || content.length < 500) return;
      if (content.includes('__NUXT__') || content.includes('window.__NUXT_DATA__')) {
        try {
          const jsonMatch = content.match(/\{[\s\S]{500,}\}/);
          if (jsonMatch) {
            const matches = jsonMatch[0].match(/"[^"\\]{300,}"/g) || [];
            const extracted = matches
              .map(m => m.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"'))
              .filter(s => s.split(' ').length > 20)
              .join('\n\n');
            if (extracted.length > 200) candidates.push(extracted);
          }
        } catch { /* ignore */ }
      }
    });

    return candidates.join('\n\n').substring(0, 15000);
  }

  function extractFromHtml(html: string): { text: string; title: string } {
    const $ = cheerio.load(html);
    const h1Title = $('h1').first().text() || '';

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
    const embeddedJs = extractEmbeddedJsData($);

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
    if (embeddedJs) candidates.push(embeddedJs);

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
      title: pickBestOriginalTitle(structured.title, metaTitle, h1Title),
    };
  }

  // ── Fetch strategies ──────────────────────────────────────────────────────

  /** Strategy 1: Direct fetch with a given user agent */
  async function fetchDirectWithUA(url: string, userAgent: string): Promise<{ text: string; title: string } | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(9000),
      });

      if (!response.ok) return null;

      const html = await decodeHtmlResponseBody(response as any);
      const result = extractFromHtml(html);
      if (scoreReadableCandidate(result.text) > 180) return result;
      return null;
    } catch {
      return null;
    }
  }

  /** Strategy 2: AMP version of the URL */
  async function fetchViaAmp(url: string): Promise<{ text: string; title: string } | null> {
    const ampUrls = [
      `${url.replace(/\/$/, '')}/amp`,
      url.includes('?') ? `${url}&amp=1` : `${url}?amp=1`,
    ];
    for (const ampUrl of ampUrls) {
      try {
        const response = await fetch(ampUrl, {
          headers: {
            'User-Agent': USER_AGENTS[0],
            'Accept': 'text/html',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(7000),
        });
        if (!response.ok) continue;
        const html = await decodeHtmlResponseBody(response as any);
        const result = extractFromHtml(html);
        if (scoreReadableCandidate(result.text) > 300) return result;
      } catch { /* try next */ }
    }
    return null;
  }

  /** Strategy 3: Google AMP Cache */
  async function fetchViaGoogleAmpCache(url: string): Promise<{ text: string; title: string } | null> {
    try {
      const parsed = new URL(url);
      // Convert domain to AMP cache format: dots become dashes
      const domainSlug = parsed.hostname.replace(/\./g, '-');
      const ampCacheUrl = `https://${domainSlug}.cdn.ampproject.org/c/${parsed.hostname}${parsed.pathname}${parsed.search}`;

      const response = await fetch(ampCacheUrl, {
        headers: {
          'User-Agent': USER_AGENTS[0],
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      const html = await decodeHtmlResponseBody(response as any);
      const result = extractFromHtml(html);
      if (scoreReadableCandidate(result.text) > 300) return result;
      return null;
    } catch {
      return null;
    }
  }

  /** Strategy 4: 12ft.io paywall bypass */
  async function fetchVia12ft(url: string): Promise<{ text: string; title: string } | null> {
    try {
      const response = await fetch(`https://12ft.io/proxy?q=${encodeURIComponent(url)}`, {
        headers: {
          'User-Agent': USER_AGENTS[0],
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://12ft.io/',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return null;
      const html = await decodeHtmlResponseBody(response as any);
      const result = extractFromHtml(html);
      if (scoreReadableCandidate(result.text) > 300) return result;
      return null;
    } catch {
      return null;
    }
  }

  /** Strategy 5: Jina Reader */
  async function fetchViaJina(url: string): Promise<{ text: string; title: string }> {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
        'X-Remove-Selector': 'header,footer,nav,aside,.cookie,.banner,.popup,.modal,.sidebar,.related,.ads,.newsletter',
        'X-Timeout': '25',
        'X-No-Cache': 'true',
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

    return { text: body.substring(0, 22000), title: pickBestOriginalTitle(title) };
  }

  /** Strategy 6: Jina Reader with markdown format */
  async function fetchViaJinaMarkdown(url: string): Promise<{ text: string; title: string } | null> {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const response = await fetch(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
          'X-Return-Format': 'markdown',
          'X-Timeout': '25',
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) return null;
      const text = await response.text();
      if (!text || text.length < 150) return null;

      const lines = text.split('\n').filter(l => l.trim());
      const titleLine = lines.find(l => l.startsWith('# '));
      const title = titleLine ? titleLine.replace(/^# /, '').trim() : '';
      const body = titleLine ? text.replace(titleLine, '').trim() : text;

      // Remove markdown formatting for cleaner text
      const cleaned = body
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
        .trim();

      if (cleaned.length > 200) return { text: cleaned.substring(0, 22000), title: pickBestOriginalTitle(title) };
      return null;
    } catch {
      return null;
    }
  }

  /** Strategy 7: Wayback Machine (archive.org) */
  async function fetchViaWayback(url: string): Promise<{ text: string; title: string } | null> {
    try {
      const availRes = await fetch(
        `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!availRes.ok) return null;

      const avail = await availRes.json() as {
        archived_snapshots?: { closest?: { url?: string; available?: boolean } }
      };
      const snapshotUrl = avail.archived_snapshots?.closest?.url;
      if (!snapshotUrl || !avail.archived_snapshots?.closest?.available) return null;

      const response = await fetch(snapshotUrl, {
        headers: {
          'User-Agent': USER_AGENTS[0],
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) return null;

      const html = await decodeHtmlResponseBody(response as any);
      const result = extractFromHtml(html);
      if (scoreReadableCandidate(result.text) > 300) return result;
      return null;
    } catch {
      return null;
    }
  }

  /** Strategy 8: Minimal fallback — extract ANY content (meta, headings, first paragraphs) */
  async function fetchMinimalContent(url: string): Promise<{ text: string; title: string } | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENTS[4], // Googlebot
          'Accept': 'text/html',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;

      const html = await decodeHtmlResponseBody(response as any);
      const $ = cheerio.load(html);

      const title =
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('title').text().trim() ||
        $('h1').first().text().trim() ||
        '';

      const parts: string[] = [
        $('meta[property="og:description"]').attr('content') || '',
        $('meta[name="twitter:description"]').attr('content') || '',
        $('meta[name="description"]').attr('content') || '',
        $('h1').first().text().trim() || '',
        $('h2').map((_i, el) => $(el).text().trim()).get().slice(0, 6).join('. ') || '',
        $('p').map((_i, el) => $(el).text().trim()).get()
          .filter(p => p.length > 40)
          .slice(0, 30)
          .join('\n') || '',
      ].filter(Boolean);

      const text = cleanReadableText(parts.join('\n\n'));
      if (text.length > 100) {
        return { text: text.substring(0, 10000), title: pickBestOriginalTitle(title) };
      }
      return null;
    } catch {
      return null;
    }
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

  /**
   * Main article fetching pipeline with 8 progressive strategies.
   * Returns as soon as a strategy succeeds with readable content.
   */
  async function fetchWithAllStrategies(url: string): Promise<{ text: string; title: string; type: string }> {
    // Minimum score thresholds
    const MIN_SCORE = 180;
    const MIN_LENGTH = 150;

    // Helper to check if a result is good enough
    const isGood = (r: { text: string; title: string } | null): r is { text: string; title: string } => {
      if (!r) return false;
      return r.text.length >= MIN_LENGTH || scoreReadableCandidate(r.text) >= MIN_SCORE;
    };

    // Strategy 1a: Direct fetch with Chrome UA
    {
      const result = await fetchDirectWithUA(url, USER_AGENTS[0]);
      if (isGood(result)) {
        console.log(`✅ [direct/chrome] ${result!.text.length} chars`);
        return { ...result!, type: 'web' };
      }
    }

    // Strategy 1b: Direct fetch with Safari UA
    {
      const result = await fetchDirectWithUA(url, USER_AGENTS[1]);
      if (isGood(result)) {
        console.log(`✅ [direct/safari] ${result!.text.length} chars`);
        return { ...result!, type: 'web' };
      }
    }

    // Strategy 1c: Direct fetch with Mobile UA
    {
      const result = await fetchDirectWithUA(url, USER_AGENTS[2]);
      if (isGood(result)) {
        console.log(`✅ [direct/mobile] ${result!.text.length} chars`);
        return { ...result!, type: 'web' };
      }
    }

    // Strategy 2: AMP version
    {
      const result = await fetchViaAmp(url);
      if (isGood(result)) {
        console.log(`✅ [amp] ${result!.text.length} chars`);
        return { ...result!, type: 'web' };
      }
    }

    // Strategy 3: Google AMP Cache
    {
      const result = await fetchViaGoogleAmpCache(url);
      if (isGood(result)) {
        console.log(`✅ [google-amp-cache] ${result!.text.length} chars`);
        return { ...result!, type: 'web' };
      }
    }

    // Strategy 4: 12ft.io (paywall bypass)
    {
      const result = await fetchVia12ft(url);
      if (isGood(result)) {
        console.log(`✅ [12ft] ${result!.text.length} chars`);
        return { ...result!, type: 'web' };
      }
    }

    // Strategy 5: Jina Reader (text format)
    try {
      const result = await fetchViaJina(url);
      if (isGood(result)) {
        console.log(`✅ [jina/text] ${result.text.length} chars`);
        return { ...result, type: 'web' };
      }
    } catch (e: any) {
      console.warn(`⚠️ [jina/text] failed: ${e.message}`);
    }

    // Strategy 6: Jina Reader (markdown format)
    {
      const result = await fetchViaJinaMarkdown(url);
      if (isGood(result)) {
        console.log(`✅ [jina/markdown] ${result!.text.length} chars`);
        return { ...result!, type: 'web' };
      }
    }

    // Strategy 7: Wayback Machine (async, can be slow)
    {
      const result = await fetchViaWayback(url);
      if (isGood(result)) {
        console.log(`✅ [wayback] ${result!.text.length} chars`);
        return { ...result!, type: 'web' };
      }
    }

    // Strategy 8: Minimal fallback — get ANYTHING available
    {
      const result = await fetchMinimalContent(url);
      if (result && result.text.length > 100) {
        console.log(`✅ [minimal] ${result.text.length} chars`);
        return { ...result, type: 'web' };
      }
    }

    throw new Error('All fetch strategies exhausted — insufficient content');
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

    if (url.toLowerCase().endsWith('.pdf')) {
      try {
        const pdfRes = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const { text, title: pdfTitle } = await extractPdfText(buffer);
          if (text.length > 100) {
            const entry = setCachedArticle(url, {
              text: text.substring(0, 20000),
              title: pdfTitle,
              type: 'pdf',
            });
            return { text: entry.text, title: entry.title, type: 'pdf' };
          }
        }
      } catch { /* fall through */ }
    }

    const result = await fetchWithAllStrategies(url);
    const entry = setCachedArticle(url, {
      text: result.text.substring(0, 22000),
      title: result.title,
      type: result.type,
    });
    return { text: entry.text, title: entry.title, type: entry.type || 'web' };
  }

  // ── Fetch URL endpoint ────────────────────────────────────────────────────

  app.post("/api/fetch-url", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

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

    // PDF via URL
    if (url.toLowerCase().endsWith('.pdf')) {
      try {
        const pdfRes = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const { text, title: pdfTitle } = await extractPdfText(buffer);
          if (text.length > 100) {
            console.log(`✅ Fetched PDF via URL (${text.length} chars)`);
            const entry = setCachedArticle(url, {
              text: text.substring(0, 20000),
              title: pdfTitle,
              type: 'pdf',
            });
            return res.json({ text: entry.text, title: entry.title, type: 'pdf' });
          }
        }
      } catch (pdfErr: any) {
        console.warn('PDF URL fetch failed, trying as HTML:', pdfErr.message);
      }
    }

    try {
      const result = await fetchWithAllStrategies(url);
      const entry = setCachedArticle(url, {
        text: result.text.substring(0, 22000),
        title: result.title,
        type: result.type,
      });
      return res.json({ text: entry.text, title: entry.title, type: entry.type || 'web' });
    } catch (err: any) {
      console.error("All fetch strategies failed for:", url, err.message);
      return res.status(500).json({ error: 'Failed to fetch URL' });
    }
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

      if (boundDevice.fingerprint && boundDevice.fingerprint !== currentFingerprint) {
        return res.status(200).json({ valid: false, reason: 'device_mismatch' });
      }

      await bindTokenToDevice(token, {
        ...boundDevice,
        fingerprint: currentFingerprint,
        lastValidatedAt: new Date().toISOString(),
      });
    }

    const session = await getAuthenticatedSession(req);
    if (session) {
      const user = await getUserById(session.userId);
      if (user) {
        user.premium = {
          isPremium: true,
          token,
        };
        await saveUser(user);
      }
    }

    res.status(200).json({ valid: true, email: tokenData.email });
  });

  // ── Check / record usage limit (IP-based) ───────────────────────────────

  app.post("/api/check-limit", async (req, res) => {
    const { record, isPremium } = req.body;
    if (isPremium) return res.json({ allowed: true, remaining: null, resetAt: null });

    const usageId = await getUsageIdForRequest(req);
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

      return res.json({ text: body.substring(0, 25000), title: pickBestOriginalTitle(title), type: 'youtube' });
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
          return res.json({ text: (note + combined).substring(0, 20000), title: pickBestOriginalTitle(title), type: 'youtube' });
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
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = errText;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson?.error?.message || errJson?.message || errText;
        } catch { /* use raw text */ }
        console.error(`DeepSeek API error ${response.status}:`, errMsg);
        return res.status(response.status).json({ error: errMsg });
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
