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
    (msg.includes("500") && !msg.includes("pdf_no_text") && !msg.includes("failed to process pdf"))
  );
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un extractor de datos anti-clickbait. Tu única misión es entregar la información que el titular promete, ELIMINANDO todo el relleno descriptivo.

REGLAS DE ORO (OBLIGATORIAS):
1. PROHIBIDO EL META-LENGUAJE: No uses frases como "El artículo detalla...", "Se mencionan...", "Este texto explica...". Si tu respuesta empieza así, HAS FALLADO.
2. RESPUESTA INMEDIATA: La primera frase debe ser la respuesta directa. Si el título dice "10 herramientas", empieza con la lista.
3. EJEMPLOS DE COMPORTAMIENTO:
   MAL: "El artículo detalla diez herramientas de IA gratuitas que ayudan a los desarrolladores..."
   BIEN: "Las 10 herramientas son: Cursor, GitHub Copilot, Claude, Gemini CLI, Codeium, Tabnine, Pieces, Continue, Cody y Aider."

4. LISTICLES: Si hay un número en el título, tu respuesta DEBE ser la lista de esos elementos. En modo 'short', solo nombres separados por comas.
5. ANTI-HYPE: Si el titular exagera, da la versión real y sobria.
6. SIN ETIQUETAS: No uses "Resumen:", "Respuesta:", ni negritas al principio.
7. CALIDAD: Si el contenido es basura o error, responde SOLO: "INSUFFICIENT_CONTENT".

TU META: Que el usuario NO tenga que hacer clic en el artículo para saber cuáles son los elementos de la lista.`;

// ─── Length instructions ──────────────────────────────────────────────────────

function getLengthInstruction(length: 'short' | 'medium' | 'long' | 'child'): string {
  switch (length) {
    case 'short':
      return `RESPUESTA DIRECTA DE 1-2 ORACIONES. Si el titular es una lista, tu respuesta DEBE ser únicamente la lista de elementos separados por comas. Ejemplo: "Cursor, Copilot, Claude, Gemini...". NADA MÁS.`;
    case 'medium':
      return `Escribe 3-5 oraciones. Responde directamente a la promesa del titular sin rodeos descriptivos. Si es una lista, NOMBRA TODOS LOS ELEMENTOS y añade una brevísima explicación de 3-5 palabras para los más importantes. Incluye cualquier limitación crítica (ej. "solo para Windows", "en fase beta").`;
    case 'long':
      return `Resumen exhaustivo de varios párrafos. Estructura: (1) Respuesta directa y completa a la promesa del titular, (2) Lista detallada de todos los puntos o herramientas con sus pros y contras según el texto, (3) Evidencia, limitaciones y advertencias importantes. No omitas ningún detalle técnico o matiz que el artículo proporcione.`;
    case 'child':
      return `Explica el núcleo del artículo a un niño de 10 años. Usa un lenguaje muy sencillo pero mantén la precisión sobre las limitaciones (ej. "esto aún es un experimento"). Si es una lista, explica brevemente qué son esas cosas y para qué sirven de forma divertida.`;
  }
}

// ─── Detect content type from URL ────────────────────────────────────────────

export function detectContentType(url: string): 'youtube' | 'pdf' | 'web' {
  if (/(?:youtube\.com\/(?:watch|shorts|embed)|youtu\.be\/)/.test(url)) return 'youtube';
  if (url.toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'web';
}

// ─── Fetch article content via our server ────────────────────────────────────

export async function fetchArticleContent(url: string): Promise<{ text: string; title: string; type: string }> {
  const contentType = detectContentType(url);
  const endpoint = contentType === 'youtube' ? '/api/youtube' : '/api/fetch-url';

  const fetchResponse = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });

  if (!fetchResponse.ok) {
    const err = await fetchResponse.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch content.");
  }

  const data = await fetchResponse.json();
  return { text: data.text || '', title: data.title || '', type: data.type || contentType };
}

// ─── Fetch PDF from uploaded file (base64) ───────────────────────────────────

export async function fetchPdfContent(file: File): Promise<{ text: string; title: string }> {
  const formData = new FormData();
  formData.append('pdf', file);

  const response = await fetch('/api/pdf-upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to process PDF.');
  }

  const data = await response.json();
  return { text: data.text || '', title: data.title || file.name };
}

// ─── Llamada a Gemini 2.5 Flash ───────────────────────────────────────────────

async function callGemini(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string,
  prefetchedContent?: { text: string; title: string; type: string }
): Promise<string> {
  const { text: articleContent, type } = prefetchedContent || await fetchArticleContent(url);
  const ai = new GoogleGenAI({ apiKey });

  const sourceLabel = type === 'youtube' ? 'video transcript' : type === 'pdf' ? 'PDF document' : 'article';
  const prompt = `Analyze this ${sourceLabel} content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the content describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

CONTENT:
${articleContent}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", content: prompt }],
      systemInstruction: SYSTEM_PROMPT,
    });
    const result = response.text || '';
    if (result.trim() === 'INSUFFICIENT_CONTENT') throw new Error('insufficient_content');
    return result || "No summary available.";
  } catch (error: any) {
    throw error;
  }
}

// ─── Llamada a OpenRouter ────────────────────────────────────────────────────

async function callOpenRouter(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string,
  prefetchedContent?: { text: string; title: string; type: string }
): Promise<string> {
  const { text: articleContent, type } = prefetchedContent || await fetchArticleContent(url);
  const sourceLabel = type === 'youtube' ? 'video transcript' : type === 'pdf' ? 'PDF document' : 'article';

  const openai = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    dangerouslyAllowBrowser: true
  });

  const userPrompt = `Analyze this ${sourceLabel} content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the content describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

CONTENT:
${articleContent}`;

  const completion = await openai.chat.completions.create({
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
  });

  const result = completion.choices[0].message.content || '';
  if (result.trim() === 'INSUFFICIENT_CONTENT') throw new Error('insufficient_content');
  return result || "No summary available.";
}

// ─── Llamada a Mistral (via server proxy to avoid CORS) ─────────────────────
// FIX: El system prompt ahora se inyecta como role:"system" en el array de mensajes.
// Antes se enviaba como `systemInstruction` y el proxy del servidor lo ignoraba completamente.

async function callMistral(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string,
  prefetchedContent?: { text: string; title: string; type: string }
): Promise<string> {
  const { text: articleContent, type } = prefetchedContent || await fetchArticleContent(url);
  const sourceLabel = type === 'youtube' ? 'video transcript' : type === 'pdf' ? 'PDF document' : 'article';

  const userPrompt = `Analyze this ${sourceLabel} content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the article describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

CONTENT:
${articleContent}`;

  const response = await fetch('/api/mistral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
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
// FIX: El system prompt ahora se inyecta como role:"system" en el array de mensajes.
// Antes se enviaba como `systemInstruction` y el proxy del servidor lo ignoraba completamente.

async function callDeepSeek(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string,
  prefetchedContent?: { text: string; title: string; type: string }
): Promise<string> {
  const { text: articleContent, type } = prefetchedContent || await fetchArticleContent(url);
  const sourceLabel = type === 'youtube' ? 'video transcript' : type === 'pdf' ? 'PDF document' : 'article';

  const userPrompt = `Analyze this ${sourceLabel} content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the article describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

CONTENT:
${articleContent}`;

  const response = await fetch('/api/deepseek', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
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

// ─── Orquestador principal con Fallbacks ──────────────────────────────────────

export async function summarizeUrl(
  url: string,
  apiKeys: ApiKeys,
  provider: Provider,
  language: string,
  length: 'short' | 'medium' | 'long' | 'child' = 'medium',
  prefetchedContent?: { text: string; title: string; type: string }
): Promise<string> {
  const lengthInstruction = getLengthInstruction(length);

  let content = prefetchedContent;
  if (!content) {
    try {
      content = await fetchArticleContent(url);
    } catch (e: any) {
      throw e;
    }
  }

  if (!content.text || content.text.length < 30) {
    throw new Error('insufficient_content');
  }

  // ─── LLAMADA AL PROVEEDOR CON FALLBACK ──────────────────────────────────
  const allProviders: Provider[] = ['gemini', 'openrouter', 'mistral', 'deepseek'];
  const providersToTry = [provider, ...allProviders.filter(p => p !== provider)];

  let lastError: any = null;

  for (const p of providersToTry) {
    const key = apiKeys[p as keyof ApiKeys];
    if (!key) continue;

    try {
      switch (p) {
        case 'gemini':
          return await callGemini(key, url, language, lengthInstruction, content);
        case 'openrouter':
          return await callOpenRouter(key, url, language, lengthInstruction, content);
        case 'mistral':
          return await callMistral(key, url, language, lengthInstruction, content);
        case 'deepseek':
          return await callDeepSeek(key, url, language, lengthInstruction, content);
      }
    } catch (error: any) {
      lastError = error;

      if (isAuthError(error)) throw error;
      if (error.message === 'insufficient_content') throw error;

      if (isQuotaError(error) || isTransientError(error)) {
        console.warn(`Provider ${p} failed, trying next...`, error);
        if (isTransientError(error)) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error('quota_exceeded_all');
}
