import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export type Provider = 'gemini' | 'openrouter';

export interface ApiKeys {
  gemini?: string;
  openrouter?: string;
}

// ─── Detectar si el error es de cuota/límite ─────────────────────────────────

function isQuotaError(error: any): boolean {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  // Only treat as quota error if it's genuinely a quota/rate-limit signal
  // Avoid false positives from unrelated network errors
  return (
    msg.includes('resource_exhausted') ||
    msg.includes('quota_exceeded') ||
    msg.includes('rateLimitExceeded') ||
    msg.includes('rate_limit_exceeded') ||
    msg.includes('too many requests') ||
    (msg.includes('429') && (msg.includes('quota') || msg.includes('rate') || msg.includes('limit')))
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

6. SCOPE: Only summarize what is actually in the article. Do not add outside knowledge or context not present in the source.`;

// ─── Length instructions ──────────────────────────────────────────────────────

function getLengthInstruction(length: 'short' | 'medium' | 'long' | 'child'): string {
  switch (length) {
    case 'short':
      return `Write 1-3 concise sentences that answer the headline and preserve any critical context or limitations (e.g. animal study, single country, preliminary research). If a key nuance changes the meaning, include it even if it makes the response slightly longer.`;

    case 'medium':
      return `Write 3-5 sentences. Answer the headline directly, then add the most important supporting details and any critical qualifiers or limitations from the article (e.g. sample size, scope, caveats mentioned by researchers or experts quoted).`;

    case 'long':
      return `Write a thorough multi-paragraph summary. Cover: (1) the direct answer to the headline, (2) the key evidence or findings, (3) important limitations, caveats, or dissenting views mentioned in the article, (4) broader context if provided by the article itself. Do not omit any detail that materially affects how the reader should interpret the story.`;

    case 'child':
      return `Explain this article to a 10-year-old using simple words and a friendly tone. Make sure to include any important limitations in a way a child can understand — for example, "but this was only tested on mice, not people yet". Do not oversimplify to the point of being misleading.`;
  }
}

// ─── Llamada a Gemini ─────────────────────────────────────────────────────────

async function callGemini(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string,
  retryCount = 0
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.0-flash";

  const prompt = `Analyze the headline and full content of this URL and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the article describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

URL: ${url}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ urlContext: {} }],
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    return response.text || "No summary available.";
  } catch (error: any) {
    const msg = (error?.message || '').toLowerCase();
    // Per-minute rate limit (not daily quota) — wait 15s and retry once
    if (retryCount === 0 && (msg.includes('429') || msg.includes('resource_exhausted'))) {
      await new Promise(resolve => setTimeout(resolve, 15000));
      return callGemini(apiKey, url, language, lengthInstruction, 1);
    }
    throw error;
  }
}

// ─── Llamada a OpenRouter ────────────────────────────────────────────────────

async function callOpenRouter(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string
): Promise<string> {
  const fetchResponse = await fetch('/api/fetch-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

  if (!fetchResponse.ok) throw new Error("Failed to fetch article content for this provider.");
  const { text: articleContent } = await fetchResponse.json();

  const openai = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    dangerouslyAllowBrowser: true
  });

  const completion = await openai.chat.completions.create({
    model: "google/gemini-2.0-flash-001",
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

  return completion.choices[0].message.content || "No summary available.";
}

// ─── Función principal con fallback automático ────────────────────────────────

export async function summarizeUrl(
  url: string,
  language: string = "Spanish",
  userApiKeys?: ApiKeys | string,
  length: 'short' | 'medium' | 'long' | 'child' = 'short',
  provider: Provider = 'gemini'
) {
  // Compatibilidad con llamadas antiguas que pasan un string
  let keys: ApiKeys;
  if (typeof userApiKeys === 'string') {
    keys = { [provider]: userApiKeys } as ApiKeys;
  } else {
    keys = userApiKeys || {};
  }

  const hasGemini = keys.gemini && keys.gemini !== "undefined";
  const hasOpenRouter = keys.openrouter && keys.openrouter !== "undefined";

  if (!hasGemini && !hasOpenRouter) {
    throw new Error("API Key no configurada. Por favor, introduce tu propia API Key en la configuración.");
  }

  const lengthInstruction = getLengthInstruction(length);

  // Orden de prioridad: provider elegido primero, luego los demás
  const allProviders: Provider[] = ['gemini', 'openrouter'];
  const orderedProviders: Provider[] = [
    provider,
    ...allProviders.filter(p => p !== provider)
  ];

  const availableProviders = orderedProviders.filter(p => {
    if (p === 'gemini') return hasGemini;
    if (p === 'openrouter') return hasOpenRouter;
    return false;
  });

  let lastError: any;

  for (const p of availableProviders) {
    const key = keys[p]!;
    try {
      console.log(`🔄 Trying provider: ${p}`);
      if (p === 'gemini') {
        return await callGemini(key, url, language, lengthInstruction);
      } else {
        return await callOpenRouter(key, url, language, lengthInstruction);
      }
    } catch (error: any) {
      lastError = error;
      if (isQuotaError(error)) {
        console.warn(`⚠️ Quota exceeded for ${p}, trying next provider...`);
        continue;
      }
      throw error;
    }
  }

  // Todos los providers fallaron por cuota
  throw new Error("quota_exceeded_all");
}
