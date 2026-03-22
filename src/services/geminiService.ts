import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export type Provider = 'gemini' | 'openrouter' | 'mistral' | 'deepseek';

export interface ApiKeys {
  gemini?: string;
  openrouter?: string;
  mistral?: string;
  deepseek?: string;
}

// ─── Detectar si el error es de cuota/límite ─────────────────────────────────

function isQuotaError(error: any): boolean {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  return (
    msg.includes('resource_exhausted') ||
    msg.includes('quota_exceeded') ||
    msg.includes('ratelimitexceeded') ||
    msg.includes('rate_limit_exceeded') ||
    msg.includes('too many requests') ||
    (msg.includes('429') && (msg.includes('quota') || msg.includes('rate') || msg.includes('limit')))
  );
}

// ─── Detectar si el error es de autenticación/API key inválida ───────────────

export function isAuthError(error: any): boolean {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  return (
    msg.includes('api_key_invalid') ||
    msg.includes('invalid api key') ||
    msg.includes('invalid_api_key') ||
    msg.includes('unauthorized') ||
    msg.includes('unauthenticated') ||
    msg.includes('authentication') ||
    msg.includes('permission_denied') ||
    msg.includes('api key not valid') ||
    msg.includes('invalid key') ||
    msg.includes('401')
  );
}

// ─── Detectar si es un error transitorio (reintentable) ──────────────────────

function isTransientError(error: any): boolean {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('500')
  );
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a rigorous fact-preserving journalist assistant. Your job is to summarize news articles and web content with absolute accuracy, never omitting details that change the meaning or scope of the story.

CRITICAL RULES — follow all of them without exception:

1. PRESERVE LIMITING CONTEXT: If a study, discovery, or claim applies only to a specific group (animals, a particular country, a specific age group, a lab setting, etc.), you MUST explicitly state that limitation. Never generalize a finding beyond what the source states.

2. ANTI-HYPE: If the headline exaggerates or implies more than the content actually says, correct it in your summary. State what the content actually shows, not what the headline implies.

3. ACCURACY OVER BREVITY: It is better to include a crucial qualifying detail than to omit it for the sake of a shorter response. A summary that omits a key nuance is worse than no summary.

4. NO LABELS OR META-COMMENTARY: Do not use labels like "Summary:", "Headline:", "Answer:", or phrases like "This article explains...". Output only the factual content directly.

5. UNCERTAINTY: If the article itself is speculative or uses hedged language ("may", "could", "suggests"), reflect that uncertainty in your summary — do not present it as confirmed fact.

6. SCOPE: Only summarize what is actually in the article. Do not add outside knowledge or context not present in the source.

7. CONTENT QUALITY: If the extracted content is clearly not an article (e.g. it is a login page, error page, cookie consent wall, or technical gibberish), respond only with: "INSUFFICIENT_CONTENT". Do not describe the error — just output that exact token.`;

// ─── Length instructions ──────────────────────────────────────────────────────

function getLengthInstruction(length: 'short' | 'medium' | 'long' | 'child'): string {
  switch (length) {
    case 'short':
      return `Write exactly 1-2 sentences maximum. State the core fact directly. Only add a critical qualifier (e.g. animal study, single country) if it fundamentally changes the meaning. Be ruthlessly concise — the user will click for more if they want it.`;
    case 'medium':
      return `Write 3-5 sentences. Answer the headline directly, then add the most important supporting details and any critical qualifiers or limitations from the article (e.g. sample size, scope, caveats mentioned by researchers or experts quoted).`;
    case 'long':
      return `Write a thorough multi-paragraph summary. Cover: (1) the direct answer to the headline, (2) the key evidence or findings, (3) important limitations, caveats, or dissenting views mentioned in the article, (4) broader context if provided by the article itself. Do not omit any detail that materially affects how the reader should interpret the story.`;
    case 'child':
      return `Explain this article to a 10-year-old using simple words and a friendly tone. Make sure to include any important limitations in a way a child can understand — for example, "but this was only tested on mice, not people yet". Do not oversimplify to the point of being misleading.`;
  }
}

// ─── Fetch article content via our server ────────────────────────────────────

async function fetchArticleContent(url: string): Promise<string> {
  const fetchResponse = await fetch('/api/fetch-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!fetchResponse.ok) throw new Error("Failed to fetch article content.");
  const { text } = await fetchResponse.json();
  return text;
}

// ─── Llamada a Gemini 2.5 Flash ───────────────────────────────────────────────
// IMPORTANT: Gemini free tier is NOT available in EU/EEA/UK/Switzerland.
// European users should use OpenRouter or Mistral instead.

async function callGemini(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string,
  retryCount = 0
): Promise<string> {
  const articleContent = await fetchArticleContent(url);
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Analyze this article content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the article describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

ARTICLE CONTENT:
${articleContent}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { systemInstruction: SYSTEM_PROMPT },
    });
    const result = response.text || '';
    if (result.trim() === 'INSUFFICIENT_CONTENT') throw new Error('insufficient_content');
    return result || "No summary available.";
  } catch (error: any) {
    const msg = (error?.message || '').toLowerCase();
    if (retryCount === 0 && (msg.includes('429') || msg.includes('resource_exhausted'))) {
      await new Promise(resolve => setTimeout(resolve, 15000));
      return callGemini(apiKey, url, language, lengthInstruction, 1);
    }
    throw error;
  }
}

// ─── Llamada a OpenRouter ────────────────────────────────────────────────────
// Free tier: 200 requests/day, no geographic restrictions.
// Best free option for EU users.

async function callOpenRouter(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string
): Promise<string> {
  const articleContent = await fetchArticleContent(url);

  const openai = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    dangerouslyAllowBrowser: true
  });

  const completion = await openai.chat.completions.create({
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyze this article content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the article describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

ARTICLE CONTENT:
${articleContent}`
      }
    ],
  });

  const result = completion.choices[0].message.content || '';
  if (result.trim() === 'INSUFFICIENT_CONTENT') throw new Error('insufficient_content');
  return result || "No summary available.";
}

// ─── Llamada a Mistral (via server proxy to avoid CORS) ─────────────────────
// EU-based company, free tier available, no geographic restrictions.
// Get your free API key at: https://console.mistral.ai

async function callMistral(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string
): Promise<string> {
  const articleContent = await fetchArticleContent(url);

  const userMessage = `Analyze this article content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the article describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

ARTICLE CONTENT:
${articleContent}`;

  const response = await fetch('/api/mistral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Mistral request failed');
  }

  const data = await response.json();
  const mistralResult = data.choices?.[0]?.message?.content || '';
  if (mistralResult.trim() === 'INSUFFICIENT_CONTENT') throw new Error('insufficient_content');
  return mistralResult || 'No summary available.';
}

// ─── Llamada a DeepSeek (via server proxy to avoid CORS) ─────────────────────
// Free tier: $5 credits on signup. Very capable model for summarization.
// Get your API key at: https://platform.deepseek.com/api_keys

async function callDeepSeek(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string
): Promise<string> {
  const articleContent = await fetchArticleContent(url);

  const userMessage = `Analyze this article content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the article describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

ARTICLE CONTENT:
${articleContent}`;

  const response = await fetch('/api/deepseek', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'DeepSeek request failed');
  }

  const data = await response.json();
  const deepseekResult = data.choices?.[0]?.message?.content || '';
  if (deepseekResult.trim() === 'INSUFFICIENT_CONTENT') throw new Error('insufficient_content');
  return deepseekResult || 'No summary available.';
}

// ─── Función principal con fallback automático ────────────────────────────────

export async function summarizeUrl(
  url: string,
  language: string = "Spanish",
  userApiKeys?: ApiKeys | string,
  length: 'short' | 'medium' | 'long' | 'child' = 'short',
  provider: Provider = 'gemini'
) {
  let keys: ApiKeys;
  if (typeof userApiKeys === 'string') {
    keys = { [provider]: userApiKeys } as ApiKeys;
  } else {
    keys = userApiKeys || {};
  }

  const hasGemini = !!(keys.gemini && keys.gemini !== "undefined");
  const hasOpenRouter = !!(keys.openrouter && keys.openrouter !== "undefined");
  const hasMistral = !!(keys.mistral && keys.mistral !== "undefined");
  const hasDeepSeek = !!(keys.deepseek && keys.deepseek !== "undefined");

  if (!hasGemini && !hasOpenRouter && !hasMistral && !hasDeepSeek) {
    throw new Error("API Key no configurada. Por favor, introduce tu propia API Key en la configuración.");
  }

  const lengthInstruction = getLengthInstruction(length);

  const allProviders: Provider[] = ['gemini', 'openrouter', 'mistral', 'deepseek'];
  const orderedProviders: Provider[] = [
    provider,
    ...allProviders.filter(p => p !== provider)
  ];

  const availableProviders = orderedProviders.filter(p => {
    if (p === 'gemini') return hasGemini;
    if (p === 'openrouter') return hasOpenRouter;
    if (p === 'mistral') return hasMistral;
    if (p === 'deepseek') return hasDeepSeek;
    return false;
  });

  let lastError: any;

  const callProvider = async (p: Provider, key: string): Promise<string> => {
    if (p === 'gemini') return callGemini(key, url, language, lengthInstruction);
    if (p === 'openrouter') return callOpenRouter(key, url, language, lengthInstruction);
    if (p === 'mistral') return callMistral(key, url, language, lengthInstruction);
    return callDeepSeek(key, url, language, lengthInstruction);
  };

  for (const p of availableProviders) {
    const key = keys[p]!;
    try {
      console.log(`🔄 Trying provider: ${p}`);
      return await callProvider(p, key);
    } catch (error: any) {
      lastError = error;

      if (isQuotaError(error)) {
        console.warn(`⚠️ Quota exceeded for ${p}, trying next provider...`);
        continue;
      }

      // Insufficient content — no point trying other providers with same content
      if (error.message === 'insufficient_content') {
        throw new Error('insufficient_content');
      }

      // Auth errors — propagate immediately with a clear message
      if (isAuthError(error)) {
        throw new Error('api_key_invalid');
      }

      // Transient errors (network, server down) — retry once after 2s
      if (isTransientError(error)) {
        console.warn(`⚠️ Transient error for ${p}, retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        try {
          return await callProvider(p, key);
        } catch (retryError: any) {
          lastError = retryError;
          // If still failing after retry, try next provider if available
          console.warn(`⚠️ Retry failed for ${p}, trying next provider...`);
          continue;
        }
      }

      throw error;
    }
  }

  throw new Error("quota_exceeded_all");
}
