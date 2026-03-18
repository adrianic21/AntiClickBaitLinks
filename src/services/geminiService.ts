import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export type Provider = 'gemini' | 'openrouter' | 'cohere';

export interface ApiKeys {
  gemini?: string;
  openrouter?: string;
  cohere?: string;
}

// ─── Detectar si el error es de cuota/límite ─────────────────────────────────

function isQuotaError(error: any): boolean {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  return (
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('exhausted')
  );
}

// ─── Llamada a Gemini ─────────────────────────────────────────────────────────

async function callGemini(apiKey: string, url: string, language: string, systemPrompt: string, lengthInstruction: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.0-flash";
  const prompt = `Analyze the headline and content of this URL. 
    ${lengthInstruction}
    Do not include labels like 'Hook:', 'Answer:', 'Reveal:', or 'Gancho:'. 
    Do not explain the clickbait strategy. 
    The response must be in ${language}.
    URL: ${url}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ urlContext: {} }],
      systemInstruction: systemPrompt,
    },
  });

  return response.text || "No summary available.";
}

// ─── Llamada a OpenRouter ────────────────────────────────────────────────────

async function callOpenRouter(apiKey: string, url: string, language: string, systemPrompt: string, lengthInstruction: string): Promise<string> {
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
      { role: "system", content: systemPrompt },
      { role: "user", content: `Analyze this content from ${url}. ${lengthInstruction} The response must be in ${language}. CONTENT: ${articleContent}` }
    ],
  });

  return completion.choices[0].message.content || "No summary available.";
}

// ─── Llamada a Cohere ─────────────────────────────────────────────────────────

async function callCohere(apiKey: string, url: string, language: string, systemPrompt: string, lengthInstruction: string): Promise<string> {
  const fetchResponse = await fetch('/api/fetch-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

  if (!fetchResponse.ok) throw new Error("Failed to fetch article content for this provider.");
  const { text: articleContent } = await fetchResponse.json();

  const response = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'command-r-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this content from ${url}. ${lengthInstruction} The response must be in ${language}. CONTENT: ${articleContent}` }
      ],
    }),
  });

  if (!response.ok) throw new Error(`Cohere error: ${response.statusText}`);
  const data = await response.json();
  return data.message?.content?.[0]?.text || "No summary available.";
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
  const hasCohere = keys.cohere && keys.cohere !== "undefined";

  if (!hasGemini && !hasOpenRouter && !hasCohere) {
    throw new Error("API Key no configurada. Por favor, introduce tu propia API Key en la configuración.");
  }

  let lengthInstruction = "";
  if (length === 'short') {
    lengthInstruction = "Provide ONLY the direct, factual answer in maximum 1-2 sentences. Be as concise as possible.";
  } else if (length === 'medium') {
    lengthInstruction = "Provide the direct answer with some key context or details. Maximum 4 sentences.";
  } else if (length === 'long') {
    lengthInstruction = "Provide a comprehensive summary of the full article, ensuring the mystery in the headline is answered first. Use multiple paragraphs if necessary.";
  } else if (length === 'child') {
    lengthInstruction = "Explain the content of the article/video as if you were talking to a 10-year-old child. Use simple language, analogies, and a friendly tone. Ensure the main point is clear.";
  }

  const systemPrompt = "You are an anti-clickbait spoiler. Your ONLY task is to provide the direct factual answer to the mystery posed by a clickbait headline. You must NOT include any labels, introductory text, or explanations of the clickbait. Output ONLY the factual reveal found in the article.";

  // Orden de prioridad: provider elegido primero, luego los demás
  const allProviders: Provider[] = ['gemini', 'openrouter', 'cohere'];
  const orderedProviders: Provider[] = [
    provider,
    ...allProviders.filter(p => p !== provider)
  ];

  const availableProviders = orderedProviders.filter(p => {
    if (p === 'gemini') return hasGemini;
    if (p === 'openrouter') return hasOpenRouter;
    if (p === 'cohere') return hasCohere;
    return false;
  });

  let lastError: any;

  for (const p of availableProviders) {
    const key = keys[p]!;
    try {
      console.log(`🔄 Trying provider: ${p}`);
      if (p === 'gemini') {
        return await callGemini(key, url, language, systemPrompt, lengthInstruction);
      } else if (p === 'openrouter') {
        return await callOpenRouter(key, url, language, systemPrompt, lengthInstruction);
      } else {
        return await callCohere(key, url, language, systemPrompt, lengthInstruction);
      }
    } catch (error: any) {
      lastError = error;
      if (isQuotaError(error)) {
        console.warn(`⚠️ Quota exceeded for ${p}, trying next provider...`);
        continue; // Probar el siguiente
      }
      throw error; // Error distinto a cuota, lanzarlo
    }
  }

  // Todos los providers fallaron por cuota
  throw new Error("quota_exceeded_all");
}
