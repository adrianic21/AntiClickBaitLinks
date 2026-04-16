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
  const status = error?.status || error?.statusCode || 0;
  if (status === 429) return true;
  return (
    msg.includes('resource_exhausted') ||
    msg.includes('quota_exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('rate_limit_exceeded') ||
    msg.includes('rate limit exceeded') ||
    msg.includes('rate_limit') ||
    msg.includes('daily limit') ||
    msg.includes('user quota')
  );
}

export function isAuthError(error: any): boolean {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  const status = error?.status || error?.statusCode || 0;
  if (status === 401 || status === 403) return true;
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
    msg.includes('401') ||
    msg.includes('403')
  );
}

function isTransientError(error: any): boolean {
  const msg = (error?.message || error?.toString() || '').toLowerCase();
  const status = error?.status || error?.statusCode || 0;
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch error') ||
    msg.includes('aborted') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    (msg.includes('500') && !msg.includes('pdf_no_text') && !msg.includes('failed to process pdf'))
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryTransientOperation<T>(
  operation: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 600
): Promise<T> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (isAuthError(error)) throw error;
      if (error.message === 'insufficient_content') throw error;
      if (isTransientError(error) && attempt < attempts) {
        await sleep(baseDelayMs * attempt);
        continue;
      }
      if (isQuotaError(error)) throw error;
      if (attempt === attempts) throw error;
      await sleep(baseDelayMs);
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

4. LISTICLES: Si hay un número en el título, tu respuesta DEBE ser la lista de esos elementos. En modo 'short', solo nombres separados por comas seguidos de UNA frase con el criterio de selección o la idea clave que los une.
5. ANTI-HYPE: Si el titular exagera, da la versión real y sobria en la primera frase.
6. SIN ETIQUETAS: No uses "Resumen:", "Respuesta:", ni negritas al principio.
7. CALIDAD: Si el contenido es basura, acceso bloqueado, o error 403/paywall, responde SOLO: "INSUFFICIENT_CONTENT".
8. COMPLETITUD: Aunque sea una respuesta corta, SIEMPRE incluye el dato/resultado central que el titular promete. Nunca dejes al usuario sin la respuesta principal.`;

let customPrompts: Record<string, string> = {};

export function setCustomPrompts(prompts: Record<string, string>) {
  customPrompts = prompts;
}

export function getCustomPrompts(): Record<string, string> {
  return { ...customPrompts };
}

function getLengthInstruction(length: 'short' | 'medium' | 'long' | 'child'): string {
  if (customPrompts[length]) {
    return customPrompts[length];
  }
  switch (length) {
    case 'short':
      return `RESPUESTA CORTA Y DIRECTA (máximo 3-4 oraciones o 1 lista + 1 oración de contexto).
- Si el titular es una pregunta: respóndela directamente en la primera oración.
- Si el titular es una lista (ej. "10 herramientas"): nombra TODOS los elementos separados por comas, luego añade UNA oración con la idea clave que los une.
- Si el titular anuncia un resultado/descubrimiento: da el resultado concreto y su alcance real (ej. "solo en ratones", "en un estudio pequeño").
- NUNCA dejes al usuario sin la respuesta al titular. Si no tienes suficiente contenido, da lo que hay.`;
    case 'medium':
      return `Escribe 4-6 oraciones. Responde directamente a la promesa del titular sin rodeos descriptivos. Si es una lista, NOMBRA TODOS LOS ELEMENTOS y añade una brevísima explicación de 3-5 palabras para los más importantes. Incluye cualquier limitación crítica (ej. "solo para Windows", "en fase beta", "solo en EEUU").`;
    case 'long':
      return `Resumen exhaustivo de varios párrafos. Estructura: (1) Respuesta directa y completa a la promesa del titular, (2) Lista detallada de todos los puntos o herramientas con sus pros y contras según el texto, (3) Evidencia, limitaciones y advertencias importantes. No omitas ningún detalle técnico o matiz que el artículo proporcione.`;
    case 'child':
      return `Explica el núcleo del artículo a un niño de 10 años. Usa un lenguaje muy sencilla pero mantén la precisión sobre las limitaciones (ej. "esto aún es un experimento"). Si es una lista, explica brevemente qué son esas cosas y para qué sirven de forma divertida.`;
  }
}

export const DEFAULT_PROMPTS = {
  short: getLengthInstruction('short'),
  medium: getLengthInstruction('medium'),
  long: getLengthInstruction('long'),
  child: getLengthInstruction('child'),
};

function getResponseLengthInstruction(length: 'short' | 'medium' | 'long' | 'child'): string {
  switch (length) {
    case 'short':
      return `Longitud: entre 280 y 520 caracteres. Suficiente para que el usuario NO tenga que abrir el enlace para saber de qué trata.`;
    case 'medium':
      return `Longitud aproximada: entre 450 y 900 caracteres.`;
    case 'long':
      return `Longitud aproximada: entre 900 y 1700 caracteres.`;
    case 'child':
      return `Longitud aproximada: entre 260 y 520 caracteres.`;
  }
}

function normalizeContentForSpeed(
  content: string,
  length: 'short' | 'medium' | 'long' | 'child'
): string {
  const maxCharsByLength: Record<typeof length, number> = {
    short: 12000,
    medium: 18000,
    long: 28000,
    child: 14000,
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
    /you won['']t believe|te dejara|te dejará|explota|destroza|humilla|arrasa|caos/i,
    /\b\d+\s+(trucos|secrets|formas|ways|errores|mistakes)\b/i,
  ];
  const punctuationBoost = (title.match(/[!?]/g) || []).length * 6;
  const capsBoost = (title.match(/\b[A-ZÁÉÍÓÚÜÑ]{4,}\b/g) || []).length * 7;
  const hypeBoost = hypePatterns.reduce((acc, pattern) => acc + (pattern.test(title) ? 16 : 0), 0);
  const rawScore = (mismatchRatio * 62) + punctuationBoost + capsBoost + hypeBoost;
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

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

export async function fetchArticleContent(url: string): Promise<{ text: string; title: string; type: string }> {
  const contentType = detectContentType(url);
  const endpoint = contentType === 'youtube' ? '/api/youtube' : '/api/fetch-url';

  const fetchWithRetry = async () => {
    const fetchResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!fetchResponse.ok) {
      const err = await fetchResponse.json().catch(() => ({}));
      const errorMsg = err.error || "Failed to fetch content.";
      if (fetchResponse.status >= 400 && fetchResponse.status < 500 && fetchResponse.status !== 429) {
        throw Object.assign(new Error(errorMsg), { status: fetchResponse.status, noRetry: true });
      }
      throw Object.assign(new Error(errorMsg), { status: fetchResponse.status });
    }
    const data = await fetchResponse.json();
    if (!data.text || data.text.length < 80) {
      throw Object.assign(new Error('empty_response'), { noRetry: false });
    }
    return data;
  };

  let lastError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const data = await fetchWithRetry();
      return { text: data.text || '', title: data.title || deriveTitleFromUrl(url), type: data.type || contentType };
    } catch (err: any) {
      lastError = err;
      if (err.noRetry || attempt === 3) break;
      await sleep(800 * (attempt - 1) || 0);
    }
  }
  throw lastError || new Error("Failed to fetch content.");
}

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
          model: "gemini-1.5-flash",
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
          model: "google/gemini-flash-1.5",
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
          const errorText = await response.text().catch(() => response.statusText);
          const error = new Error(errorText || 'Mistral validation failed');
          if (response.status === 401 || response.status === 403 || isAuthError(error)) {
            return false;
          }
          return true;
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
          return true;
        }
        return true;
      }
    }
  } catch (error: any) {
    if (isAuthError(error)) return false;
    if (isQuotaError(error)) return true;
    if (isTransientError(error)) return true;
    return false;
  }
}

function buildSummaryPrompt(
  url: string,
  language: string,
  lengthInstruction: string,
  length: 'short' | 'medium' | 'long' | 'child',
  articleContent: string,
  type: string
): string {
  const sourceLabel = type === 'youtube' ? 'video transcript' : type === 'pdf' ? 'PDF document' : 'article';
  const optimizedContent = normalizeContentForSpeed(articleContent, length);
  const sourceRef = url.startsWith('pdf:') ? `PDF: ${url.replace('pdf:', '')}` : url;

  return `${SYSTEM_PROMPT}

Analyze this ${sourceLabel} content from ${sourceRef} and provide an accurate summary.

${lengthInstruction}

IMPORTANT: If the content describes a study or discovery that only applies to animals, a specific country, a limited group, or preliminary lab results — you MUST state that clearly. Never omit scope or limitations.

The response must be written in ${language}.

CONTENT:
${optimizedContent}`;
}

// ─── Provider call helpers ────────────────────────────────────────────────────

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastErr: any = null;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({ model, contents: prompt });
      const result = response.text || '';
      if (result.trim() === 'INSUFFICIENT_CONTENT') throw new Error('insufficient_content');
      return result || "No summary available.";
    } catch (err: any) {
      lastErr = err;
      if (isAuthError(err)) throw err;
      if (err.message === 'insufficient_content') throw err;
      if (isQuotaError(err) && model !== modelsToTry[modelsToTry.length - 1]) {
        await sleep(300);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─── Streaming Gemini call ────────────────────────────────────────────────────
async function* callGeminiStream(apiKey: string, prompt: string): AsyncGenerator<string> {
  const ai = new GoogleGenAI({ apiKey });
  const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastErr: any = null;

  for (const model of modelsToTry) {
    try {
      const stream = await ai.models.generateContentStream({ model, contents: prompt });
      let fullText = '';
      for await (const chunk of stream) {
        const text = chunk.text || '';
        if (text) {
          fullText += text;
          yield text;
        }
      }
      if (fullText.trim() === 'INSUFFICIENT_CONTENT') {
        throw new Error('insufficient_content');
      }
      return;
    } catch (err: any) {
      lastErr = err;
      if (isAuthError(err)) throw err;
      if (err.message === 'insufficient_content') throw err;
      if (isQuotaError(err) && model !== modelsToTry[modelsToTry.length - 1]) {
        await sleep(300);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function callOpenRouter(apiKey: string, prompt: string): Promise<string> {
  const openai = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    dangerouslyAllowBrowser: true
  });
  const modelsToTry = [
    'google/gemini-2.5-flash',
    'google/gemini-flash-1.5',
    'mistralai/mistral-small',
  ];
  let lastErr: any = null;
  for (const model of modelsToTry) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
      });
      const result = completion.choices[0].message.content || '';
      if (result.trim() === 'INSUFFICIENT_CONTENT') throw new Error('insufficient_content');
      return result || "No summary available.";
    } catch (err: any) {
      lastErr = err;
      if (isAuthError(err)) throw err;
      if (err.message === 'insufficient_content') throw err;
      if (isQuotaError(err) && model !== modelsToTry[modelsToTry.length - 1]) {
        await sleep(300);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ─── Streaming OpenRouter call ────────────────────────────────────────────────
async function* callOpenRouterStream(apiKey: string, prompt: string): AsyncGenerator<string> {
  const openai = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    dangerouslyAllowBrowser: true
  });
  const modelsToTry = [
    'google/gemini-2.5-flash',
    'google/gemini-flash-1.5',
    'mistralai/mistral-small',
  ];
  let lastErr: any = null;

  for (const model of modelsToTry) {
    try {
      const stream = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        stream: true,
      });

      let fullText = '';
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          fullText += text;
          yield text;
        }
      }
      if (fullText.trim() === 'INSUFFICIENT_CONTENT') {
        throw new Error('insufficient_content');
      }
      return;
    } catch (err: any) {
      lastErr = err;
      if (isAuthError(err)) throw err;
      if (err.message === 'insufficient_content') throw err;
      if (isQuotaError(err) && model !== modelsToTry[modelsToTry.length - 1]) {
        await sleep(300);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function callMistral(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch('/api/mistral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw Object.assign(new Error(err.error || 'Mistral request failed'), { status: response.status });
  }
  const data = await response.json();
  const result = data.choices?.[0]?.message?.content || '';
  if (result.trim() === 'INSUFFICIENT_CONTENT') throw new Error('insufficient_content');
  return result || 'No summary available.';
}

// ─── Streaming Mistral via SSE proxy ─────────────────────────────────────────
async function* callMistralStream(apiKey: string, prompt: string): AsyncGenerator<string> {
  const response = await fetch('/api/mistral-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    // Fall back to non-streaming
    const result = await callMistral(apiKey, prompt);
    yield result;
    return;
  }

  if (!response.body) {
    const result = await callMistral(apiKey, prompt);
    yield result;
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices?.[0]?.delta?.content || '';
          if (text) {
            fullText += text;
            yield text;
          }
        } catch { /* skip malformed */ }
      }
    }
  }

  if (fullText.trim() === 'INSUFFICIENT_CONTENT') {
    throw new Error('insufficient_content');
  }
}

async function callDeepSeek(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch('/api/deepseek', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw Object.assign(new Error(err.error || 'DeepSeek request failed'), { status: response.status });
  }
  const data = await response.json();
  const result = data.choices?.[0]?.message?.content || '';
  if (result.trim() === 'INSUFFICIENT_CONTENT') throw new Error('insufficient_content');
  return result || 'No summary available.';
}

// ─── Streaming DeepSeek via SSE proxy ────────────────────────────────────────
async function* callDeepSeekStream(apiKey: string, prompt: string): AsyncGenerator<string> {
  const response = await fetch('/api/deepseek-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey,
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    const result = await callDeepSeek(apiKey, prompt);
    yield result;
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices?.[0]?.delta?.content || '';
          if (text) {
            fullText += text;
            yield text;
          }
        } catch { /* skip malformed */ }
      }
    }
  }

  if (fullText.trim() === 'INSUFFICIENT_CONTENT') {
    throw new Error('insufficient_content');
  }
}

async function callProviderWithPrompt(
  provider: Provider,
  apiKey: string,
  prompt: string
): Promise<string> {
  switch (provider) {
    case 'gemini': return callGemini(apiKey, prompt);
    case 'openrouter': return callOpenRouter(apiKey, prompt);
    case 'mistral': return callMistral(apiKey, prompt);
    case 'deepseek': return callDeepSeek(apiKey, prompt);
  }
}

// ─── Streaming provider selector ─────────────────────────────────────────────
function getProviderStream(provider: Provider, apiKey: string, prompt: string): AsyncGenerator<string> {
  switch (provider) {
    case 'gemini': return callGeminiStream(apiKey, prompt);
    case 'openrouter': return callOpenRouterStream(apiKey, prompt);
    case 'mistral': return callMistralStream(apiKey, prompt);
    case 'deepseek': return callDeepSeekStream(apiKey, prompt);
  }
}

// ─── Main streaming summarizeUrl ─────────────────────────────────────────────
export interface StreamingSummaryResult {
  title: string;
  articleLength: number;
  providerUsed: Provider;
  attemptedProviders: Provider[];
}

export async function* summarizeUrlStream(
  url: string,
  apiKeys: ApiKeys,
  provider: Provider,
  language: string,
  length: 'short' | 'medium' | 'long' | 'child' = 'medium',
  prefetchedContent?: { text: string; title: string; type: string },
  providerPriority?: Provider[],
  onMeta?: (meta: StreamingSummaryResult) => void
): AsyncGenerator<string> {
  const lengthInstruction = `${getLengthInstruction(length)} ${getResponseLengthInstruction(length)}`;

  let content = prefetchedContent;
  if (!content) {
    content = await fetchArticleContent(url);
  }

  if (!content.text || content.text.length < 30) {
    throw new Error('insufficient_content');
  }

  const prompt = buildSummaryPrompt(url, language, lengthInstruction, length, content.text, content.type || 'web');

  const allProviders: Provider[] = ['gemini', 'openrouter', 'mistral', 'deepseek'];
  const orderedProviders = providerPriority?.length
    ? providerPriority
    : [provider, ...allProviders.filter(p => p !== provider)];
  const providersToTry = orderedProviders.filter((v, i, a) => a.indexOf(v) === i);
  const attemptedProviders: Provider[] = [];

  let lastError: any = null;
  let hadQuotaError = false;

  for (const p of providersToTry) {
    const key = apiKeys[p as keyof ApiKeys];
    if (!key) continue;
    attemptedProviders.push(p);

    try {
      const stream = getProviderStream(p, key, prompt);
      let yieldedAny = false;

      for await (const chunk of stream) {
        if (!yieldedAny) {
          // Emit metadata on first chunk so caller knows which provider is being used
          onMeta?.({
            title: content.title || '',
            articleLength: content.text.length,
            providerUsed: p,
            attemptedProviders,
          });
          yieldedAny = true;
        }
        yield chunk;
      }

      if (yieldedAny) return; // Success
      throw new Error('empty_stream');

    } catch (error: any) {
      lastError = error;
      if (isAuthError(error)) throw error;
      if (error.message === 'insufficient_content') throw error;
      if (isQuotaError(error)) {
        hadQuotaError = true;
        console.warn(`Provider ${p} quota exceeded, trying next provider...`);
        await sleep(400);
        continue;
      }
      if (isTransientError(error)) {
        console.warn(`Provider ${p} transient error, trying next provider...`);
        await sleep(700);
        continue;
      }
      console.warn(`Provider ${p} error, trying next provider...`, error.message);
      continue;
    }
  }

  if (isTransientError(lastError)) {
    throw new Error('provider_temporary_failure');
  }
  if (isQuotaError(lastError) && hadQuotaError) {
    throw new Error('quota_exceeded_all');
  }
  throw lastError || new Error('provider_failed');
}

// ─── Non-streaming fallback (kept for investigations, text content, etc.) ─────
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
    content = await fetchArticleContent(url);
  }

  if (!content.text || content.text.length < 30) {
    throw new Error('insufficient_content');
  }

  const prompt = buildSummaryPrompt(url, language, lengthInstruction, length, content.text, content.type || 'web');

  const allProviders: Provider[] = ['gemini', 'openrouter', 'mistral', 'deepseek'];
  const orderedProviders = providerPriority?.length
    ? providerPriority
    : [provider, ...allProviders.filter(p => p !== provider)];
  const providersToTry = orderedProviders.filter((v, i, a) => a.indexOf(v) === i);
  const attemptedProviders: Provider[] = [];

  let lastError: any = null;
  let hadQuotaError = false;

  for (const p of providersToTry) {
    const key = apiKeys[p as keyof ApiKeys];
    if (!key) continue;
    attemptedProviders.push(p);

    try {
      let summary: string;
      const callFn = () => {
        switch (p) {
          case 'gemini': return callGemini(key, prompt);
          case 'openrouter': return callOpenRouter(key, prompt);
          case 'mistral': return callMistral(key, prompt);
          case 'deepseek': return callDeepSeek(key, prompt);
        }
      };

      summary = await retryTransientOperation(callFn, 2, 600);

      return {
        summary,
        title: content.title || '',
        articleLength: content.text.length,
        providerUsed: p,
        attemptedProviders,
      };

    } catch (error: any) {
      lastError = error;
      if (isAuthError(error)) throw error;
      if (error.message === 'insufficient_content') throw error;
      if (isQuotaError(error)) {
        hadQuotaError = true;
        console.warn(`Provider ${p} quota exceeded, trying next...`);
        await sleep(400);
        continue;
      }
      if (isTransientError(error)) {
        console.warn(`Provider ${p} transient error, trying next...`);
        await sleep(700);
        continue;
      }
      console.warn(`Provider ${p} unknown error, trying next...`, error.message);
      continue;
    }
  }

  if (isTransientError(lastError)) {
    throw new Error('provider_temporary_failure');
  }
  if (isQuotaError(lastError) && hadQuotaError) {
    throw new Error('quota_exceeded_all');
  }
  throw lastError || new Error('provider_failed');
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
${relatedSources.map((s, i) => `${i + 1}. ${s.source} | ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet}`).join('\n\n')}

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
      findings: relatedSources.slice(0, 3).map(s => `${s.source}: ${s.title}`),
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
  const providersToTry = orderedProviders.filter((v, i, a) => a.indexOf(v) === i);
  const attemptedProviders: Provider[] = [];
  let lastError: any = null;
  let hadQuotaError = false;

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
      if (isQuotaError(error)) {
        hadQuotaError = true;
        continue;
      }
      if (isTransientError(error)) continue;
      continue;
    }
  }

  if (isTransientError(lastError)) {
    throw new Error('provider_temporary_failure');
  }
  if (isQuotaError(lastError) && hadQuotaError) {
    throw new Error('quota_exceeded_all');
  }
  throw lastError || new Error('provider_failed');
}
