import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export type Provider = 'gemini' | 'openrouter' | 'mistral' | 'deepseek';

export interface ApiKeys {
  gemini?: string;
  openrouter?: string;
  mistral?: string;
  deepseek?: string;
}

export interface SummaryResult {
  summary: string;
  title: string;
  articleLength: number;
  providerUsed: Provider;
  attemptedProviders: Provider[];
}

export interface InvestigationSource {
  title: string;
  url: string;
  source: string;
  snippet: string;
}

export interface InvestigationResult {
  verdict: string;
  confidence: 'low' | 'medium' | 'high';
  findings: string[];
  relatedSources: InvestigationSource[];
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryTransientOperation<T>(
  operation: () => Promise<T>,
  attempts = 2,
  baseDelayMs = 450
): Promise<T> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (!isTransientError(error) || attempt === attempts) {
        throw error;
      }
      await sleep(baseDelayMs * attempt);
    }
  }

  throw lastError;
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

function getResponseLengthInstruction(length: 'short' | 'medium' | 'long' | 'child'): string {
  switch (length) {
    case 'short':
      return `RESPUESTA DIRECTA DE 2-3 ORACIONES con contexto minimo suficiente para entender el titular sin abrir el enlace. Longitud aproximada: entre 220 y 420 caracteres.`;
    case 'medium':
      return `Escribe 4-6 oraciones con buen contexto y sin relleno. Longitud aproximada: entre 450 y 900 caracteres.`;
    case 'long':
      return `Resumen exhaustivo de varios parrafos. Longitud aproximada: entre 900 y 1700 caracteres.`;
    case 'child':
      return `Explica el nucleo del articulo a un nino de 10 anos con lenguaje muy claro, breve y facil de seguir. Longitud aproximada: entre 260 y 520 caracteres.`;
  }
}

function normalizeContentForSpeed(
  content: string,
  length: 'short' | 'medium' | 'long' | 'child'
): string {
  // Limitar tokens acelera notablemente la respuesta en textos muy largos.
  const maxCharsByLength: Record<typeof length, number> = {
    short: 10000,
    medium: 16000,
    long: 26000,
    child: 12000,
  };
  const maxChars = maxCharsByLength[length];
  if (content.length <= maxChars) return content;
  return `${content.slice(0, maxChars)}\n\n[TRUNCATED_FOR_SPEED]`;
}

function normalizeTitleForScoring(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
}

export function estimateLieScore(title: string, content: string): number {
  if (!title || !content) return 0;

  const titleWords = normalizeTitleForScoring(title);
  const contentLower = content.toLowerCase();
  const matchedWords = titleWords.filter(word => contentLower.includes(word));
  const mismatchRatio = titleWords.length > 0 ? 1 - (matchedWords.length / titleWords.length) : 0;

  const hypePatterns = [
    /shock|shocking|brutal|bombshell|increible|incredible|unbelievable|viral|secret|nadie te cuenta|nadie vio|ultima hora/i,
    /you won['’]t believe|te dejara|te dejará|explota|destroza|humilla|arrasa|caos/i,
    /\b\d+\s+(trucos|secrets|formas|ways|errores|mistakes)\b/i,
  ];
  const punctuationBoost = (title.match(/[!?]/g) || []).length * 6;
  const capsBoost = (title.match(/\b[A-ZÁÉÍÓÚÜÑ]{4,}\b/g) || []).length * 7;
  const hypeBoost = hypePatterns.reduce((acc, pattern) => acc + (pattern.test(title) ? 16 : 0), 0);

  const rawScore = (mismatchRatio * 62) + punctuationBoost + capsBoost + hypeBoost;
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

// ─── Detect content type from URL ────────────────────────────────────────────

export function detectContentType(url: string): 'youtube' | 'pdf' | 'web' {
  if (/(?:youtube\.com\/(?:watch|shorts|embed)|youtu\.be\/)/.test(url)) return 'youtube';
  if (url.toLowerCase().endsWith('.pdf')) return 'pdf';
  return 'web';
}

function deriveTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    const decoded = decodeURIComponent(lastSegment)
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    return decoded || parsed.hostname;
  } catch {
    return '';
  }
}

function deriveTitleFromText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Texto seleccionado';
}

// ─── Fetch article content via our server ────────────────────────────────────

export async function fetchArticleContent(url: string): Promise<{ text: string; title: string; type: string }> {
  const contentType = detectContentType(url);
  const endpoint = contentType === 'youtube' ? '/api/youtube' : '/api/fetch-url';

  const fetchResponse = await retryTransientOperation(() => fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  }), 2, 350);

  if (!fetchResponse.ok) {
    const err = await fetchResponse.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch content.");
  }

  const data = await fetchResponse.json();
  return { text: data.text || '', title: data.title || deriveTitleFromUrl(url), type: data.type || contentType };
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

export async function validateApiKey(provider: Provider, apiKey: string): Promise<boolean> {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) return false;

  try {
    switch (provider) {
      case 'gemini': {
        const ai = new GoogleGenAI({ apiKey: trimmedKey });
        await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: "Reply with OK",
        });
        return true;
      }
      case 'openrouter': {
        const openai = new OpenAI({
          apiKey: trimmedKey,
          baseURL: "https://openrouter.ai/api/v1",
          dangerouslyAllowBrowser: true
        });
        await openai.chat.completions.create({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: "Reply with OK" }],
          max_tokens: 5,
        });
        return true;
      }
      case 'mistral': {
        const response = await fetch('/api/mistral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: trimmedKey,
            model: 'mistral-small-latest',
            messages: [{ role: 'user', content: 'Reply with OK' }],
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(err.error || 'Mistral validation failed');
        }
        return true;
      }
      case 'deepseek': {
        const response = await fetch('/api/deepseek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: trimmedKey,
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: 'Reply with OK' }],
          }),
        });
        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          const error = new Error(errorText || 'DeepSeek validation failed');

          if (response.status === 401 || response.status === 403 || isAuthError(error)) {
            return false;
          }

          // DeepSeek puede devolver errores de saldo, cuota o bloqueos temporales
          // aunque la key sea correcta. En esos casos la damos por valida.
          return true;
        }
        return true;
      }
    }
  } catch (error: any) {
    if (isAuthError(error)) return false;
    if (isQuotaError(error) || isTransientError(error)) return true;
    return false;
  }
}

// ─── Llamada a Gemini 2.5 Flash ───────────────────────────────────────────────

async function callGemini(
  apiKey: string,
  url: string,
  language: string,
  lengthInstruction: string,
  length: 'short' | 'medium' | 'long' | 'child',
  prefetchedContent?: { text: string; title: string; type: string }
): Promise<string> {
  const { text: articleContent, type } = prefetchedContent || await fetchArticleContent(url);
  const ai = new GoogleGenAI({ apiKey });
  const optimizedContent = normalizeContentForSpeed(articleContent, length);

  const sourceLabel = type === 'youtube' ? 'video transcript' : type === 'pdf' ? 'PDF document' : 'article';
  const prompt = `${SYSTEM_PROMPT}

Analyze this ${sourceLabel} content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the content describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

CONTENT:
${optimizedContent}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
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
  length: 'short' | 'medium' | 'long' | 'child',
  prefetchedContent?: { text: string; title: string; type: string }
): Promise<string> {
  const { text: articleContent, type } = prefetchedContent || await fetchArticleContent(url);
  const sourceLabel = type === 'youtube' ? 'video transcript' : type === 'pdf' ? 'PDF document' : 'article';
  const optimizedContent = normalizeContentForSpeed(articleContent, length);

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
${optimizedContent}`;

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
  length: 'short' | 'medium' | 'long' | 'child',
  prefetchedContent?: { text: string; title: string; type: string }
): Promise<string> {
  const { text: articleContent, type } = prefetchedContent || await fetchArticleContent(url);
  const sourceLabel = type === 'youtube' ? 'video transcript' : type === 'pdf' ? 'PDF document' : 'article';
  const optimizedContent = normalizeContentForSpeed(articleContent, length);

  const userPrompt = `Analyze this ${sourceLabel} content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the article describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

CONTENT:
${optimizedContent}`;

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
  length: 'short' | 'medium' | 'long' | 'child',
  prefetchedContent?: { text: string; title: string; type: string }
): Promise<string> {
  const { text: articleContent, type } = prefetchedContent || await fetchArticleContent(url);
  const sourceLabel = type === 'youtube' ? 'video transcript' : type === 'pdf' ? 'PDF document' : 'article';
  const optimizedContent = normalizeContentForSpeed(articleContent, length);

  const userPrompt = `Analyze this ${sourceLabel} content from ${url} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the article describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

CONTENT:
${optimizedContent}`;

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

async function callProviderWithPrompt(
  provider: Provider,
  apiKey: string,
  prompt: string
): Promise<string> {
  switch (provider) {
    case 'gemini': {
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      return result.text || '';
    }
    case 'openrouter': {
      const openai = new OpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
        dangerouslyAllowBrowser: true
      });
      const result = await openai.chat.completions.create({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
      });
      return result.choices?.[0]?.message?.content || '';
    }
    case 'mistral': {
      const response = await fetch('/api/mistral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model: 'mistral-small-latest',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Mistral request failed');
      return data.choices?.[0]?.message?.content || '';
    }
    case 'deepseek': {
      const response = await fetch('/api/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'DeepSeek request failed');
      return data.choices?.[0]?.message?.content || '';
    }
  }
}

// ─── Orquestador principal con Fallbacks ──────────────────────────────────────

export async function summarizeUrl(
  url: string,
  apiKeys: ApiKeys,
  provider: Provider,
  language: string,
  length: 'short' | 'medium' | 'long' | 'child' = 'medium',
  prefetchedContent?: { text: string; title: string; type: string },
  providerPriority?: Provider[]
): Promise<SummaryResult> {
  const lengthInstruction = `${getLengthInstruction(length)} ${getResponseLengthInstruction(length)}`;

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
  const orderedProviders = providerPriority?.length
    ? providerPriority
    : [provider, ...allProviders.filter(p => p !== provider)];
  const providersToTry = orderedProviders.filter((value, index, array) => array.indexOf(value) === index);
  const attemptedProviders: Provider[] = [];

  let lastError: any = null;

  for (const p of providersToTry) {
    const key = apiKeys[p as keyof ApiKeys];
    if (!key) continue;
    attemptedProviders.push(p);

    try {
      switch (p) {
        case 'gemini':
          return {
            summary: await retryTransientOperation(
              () => callGemini(key, url, language, lengthInstruction, length, content),
              2,
              500
            ),
            title: content.title || '',
            articleLength: content.text.length,
            providerUsed: p,
            attemptedProviders,
          };
        case 'openrouter':
          return {
            summary: await retryTransientOperation(
              () => callOpenRouter(key, url, language, lengthInstruction, length, content),
              2,
              500
            ),
            title: content.title || '',
            articleLength: content.text.length,
            providerUsed: p,
            attemptedProviders,
          };
        case 'mistral':
          return {
            summary: await retryTransientOperation(
              () => callMistral(key, url, language, lengthInstruction, length, content),
              2,
              500
            ),
            title: content.title || '',
            articleLength: content.text.length,
            providerUsed: p,
            attemptedProviders,
          };
        case 'deepseek':
          return {
            summary: await retryTransientOperation(
              () => callDeepSeek(key, url, language, lengthInstruction, length, content),
              2,
              500
            ),
            title: content.title || '',
            articleLength: content.text.length,
            providerUsed: p,
            attemptedProviders,
          };
      }
    } catch (error: any) {
      lastError = error;

      if (isAuthError(error)) throw error;
      if (error.message === 'insufficient_content') throw error;

      if (isQuotaError(error) || isTransientError(error)) {
        console.warn(`Provider ${p} failed, trying next...`, error);
        if (isTransientError(error)) {
          await new Promise(resolve => setTimeout(resolve, 700));
        }
        continue;
      }

      throw error;
    }
  }

  if (isTransientError(lastError)) {
    throw new Error('provider_temporary_failure');
  }

  throw lastError || new Error('quota_exceeded_all');
}

export async function investigateClaim(
  url: string,
  articleTitle: string,
  articleSummary: string,
  apiKeys: ApiKeys,
  providerPriority: Provider[]
): Promise<InvestigationResult> {
  const response = await fetch('/api/deep-investigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title: articleTitle }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'deep_investigation_failed');
  }

  const relatedSources = Array.isArray(data.sources) ? data.sources as InvestigationSource[] : [];
  if (relatedSources.length === 0) {
    throw new Error('deep_investigation_failed');
  }

  const prompt = `Analiza si esta noticia parece fiable o si su titular exagera o distorsiona los hechos.

Devuelve SOLO JSON valido con esta forma:
{
  "verdict": "texto corto",
  "confidence": "low|medium|high",
  "findings": ["hallazgo 1", "hallazgo 2", "hallazgo 3"]
}

Noticia original:
Titulo: ${articleTitle}
URL: ${url}
Resumen: ${articleSummary}

Fuentes de contraste:
${relatedSources.map((source, index) => `${index + 1}. ${source.source} | ${source.title}\nURL: ${source.url}\nSnippet: ${source.snippet}`).join('\n\n')}

Evalua si las otras fuentes apoyan, matizan o contradicen la noticia original.`;

  let raw = '';
  let providerUsed: Provider | null = null;
  let lastError: unknown = null;

  for (const provider of providerPriority) {
    const key = apiKeys[provider];
    if (!key) continue;
    try {
      raw = await retryTransientOperation(() => callProviderWithPrompt(provider, key, prompt), 2, 350);
      providerUsed = provider;
      break;
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  if (!raw) {
    throw (lastError instanceof Error ? lastError : new Error('deep_investigation_failed'));
  }

  try {
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    const parsed = JSON.parse(jsonText) as Omit<InvestigationResult, 'relatedSources'>;
    return {
      verdict: parsed.verdict || `Veredicto generado con ${providerUsed || 'IA'}`,
      confidence: parsed.confidence || 'medium',
      findings: Array.isArray(parsed.findings) ? parsed.findings.slice(0, 4) : [],
      relatedSources,
    };
  } catch {
    return {
      verdict: 'Las fuentes externas aportan contexto adicional, pero la verificacion automatica no pudo estructurarse del todo.',
      confidence: 'medium',
      findings: relatedSources.slice(0, 3).map(source => `${source.source}: ${source.title}`),
      relatedSources,
    };
  }
}

export async function summarizeTextContent(
  rawText: string,
  apiKeys: ApiKeys,
  provider: Provider,
  language: string,
  length: 'short' | 'medium' | 'long' | 'child' = 'medium',
  providerPriority?: Provider[]
): Promise<SummaryResult> {
  const normalizedText = rawText.replace(/\s+/g, ' ').trim();
  if (normalizedText.length < 80) {
    throw new Error('insufficient_content');
  }

  const lengthInstruction = `${getLengthInstruction(length)} ${getResponseLengthInstruction(length)}`;
  const prompt = `${SYSTEM_PROMPT}

Analiza este texto seleccionado por el usuario y resumelo con precision.

${lengthInstruction}

The response must be written in ${language}.

Selected text:
${normalizeContentForSpeed(normalizedText, length)}`;

  const allProviders: Provider[] = ['gemini', 'openrouter', 'mistral', 'deepseek'];
  const orderedProviders = providerPriority?.length
    ? providerPriority
    : [provider, ...allProviders.filter(p => p !== provider)];
  const providersToTry = orderedProviders.filter((value, index, array) => array.indexOf(value) === index);
  const attemptedProviders: Provider[] = [];
  let lastError: any = null;

  for (const currentProvider of providersToTry) {
    const key = apiKeys[currentProvider];
    if (!key) continue;
    attemptedProviders.push(currentProvider);

    try {
      const summary = await retryTransientOperation(
        () => callProviderWithPrompt(currentProvider, key, prompt),
        2,
        400
      );

      if (!summary.trim() || summary.trim() === 'INSUFFICIENT_CONTENT') {
        throw new Error('insufficient_content');
      }

      return {
        summary,
        title: deriveTitleFromText(normalizedText),
        articleLength: normalizedText.length,
        providerUsed: currentProvider,
        attemptedProviders,
      };
    } catch (error: any) {
      lastError = error;
      if (isAuthError(error)) throw error;
      if (error.message === 'insufficient_content') throw error;
      if (isQuotaError(error) || isTransientError(error)) continue;
      throw error;
    }
  }

  if (isTransientError(lastError)) {
    throw new Error('provider_temporary_failure');
  }

  throw lastError || new Error('quota_exceeded_all');
}
