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

const SYSTEM_PROMPT = `Eres un asistente de periodista riguroso y conservador de hechos. Tu trabajo es resumir artículos de noticias y contenido web con absoluta precisión, sin omitir nunca detalles que cambien el significado o el alcance de la historia.

REGLAS CRÍTICAS — síguelas todas sin excepción:

1. PRESERVAR EL CONTEXTO LIMITANTE: Si un estudio, descubrimiento o afirmación se aplica solo a un grupo específico (animales, un país en particular, un grupo de edad específico, un entorno de laboratorio, etc.), DEBES indicar explícitamente esa limitación. Nunca generalices un hallazgo más allá de lo que establece la fuente.

2. ANTI-CLICKBAIT: Si el titular exagera o implica más de lo que el contenido realmente dice, corrígelo en tu resumen. Indica lo que el contenido realmente muestra, no lo que el titular implica.

3. PRECISIÓN SOBRE BREVEDAD: Es mejor incluir un detalle calificativo crucial que omitirlo en aras de una respuesta más corta. Un resumen que omite un matiz clave es peor que ningún resumen.

4. SIN ETIQUETAS NI META-COMENTARIOS: No uses etiquetas como "Resumen:", "Titular:", "Respuesta:", o frases como "Este artículo explica...". Genera solo el contenido fáctico directamente.

5. INCERTIDUMBRE: Si el artículo es especulativo o utiliza un lenguaje cauteloso ("puede", "podría", "sugiere"), refleja esa incertidumbre en tu resumen; no lo presentes como un hecho confirmado.

6. ALCANCE: Resume solo lo que realmente está en el artículo. No añadas conocimientos externos o contexto no presente en la fuente.

7. CALIDAD DEL CONTENIDO: Si el contenido extraído claramente no es un artículo (por ejemplo, es una página de inicio de sesión, una página de error, un muro de consentimiento de cookies o galimatías técnico), responde solo con: "INSUFFICIENT_CONTENT". No describas el error, solo genera ese token exacto.

8. LISTICLES Y PROMESAS DEL TITULAR: Tu objetivo principal es revelar la información que el titular oculta o promete. Si el titular dice "10 herramientas...", "5 formas de...", "Los mejores X...", tu respuesta DEBE nombrar esos elementos directamente. NUNCA respondas con un meta-resumen del tipo "Este artículo lista 10 herramientas". Eso ya lo sabe el usuario. Ve directo a los datos.`;

// ─── Length instructions ──────────────────────────────────────────────────────

function getLengthInstruction(length: 'short' | 'medium' | 'long' | 'child'): string {
  switch (length) {
    case 'short':
      return `Escribe exactamente 1-2 oraciones como máximo. Responde directamente a la premisa del titular. Si el artículo es una lista (ej. "10 herramientas"), DEBES enumerar los elementos separados por comas sin explicarlos. Sé despiadadamente conciso. El usuario hará clic para obtener más detalles si los desea.`;
    case 'medium':
      return `Escribe 3-5 oraciones. Responde directamente a la premisa del titular. Si es una lista, nombra todos los elementos y destaca brevemente los más importantes o los que tienen mayor impacto. Incluye los detalles de apoyo más importantes y cualquier calificativo o limitación crítica del artículo (ej. tamaño de la muestra, alcance, advertencias mencionadas por investigadores o expertos citados).`;
    case 'long':
      return `Escribe un resumen exhaustivo de varios párrafos. Cubre: (1) la respuesta directa a la premisa del titular, (2) la evidencia o hallazgos clave, (3) limitaciones importantes, advertencias o puntos de vista discrepantes mencionados en el artículo, (4) contexto más amplio si lo proporciona el propio artículo. No omitas ningún detalle que afecte materialmente cómo el lector debe interpretar la historia. Si es una lista, detalla cada elemento con su contexto, pros, contras y la información de fondo del artículo.`;
    case 'child':
      return `Explica este artículo a un niño de 10 años usando palabras sencillas y un tono amigable. Asegúrate de incluir cualquier limitación importante de una manera que un niño pueda entender; por ejemplo, "pero esto solo se probó en ratones, no en personas todavía". No simplifiques demasiado hasta el punto de ser engañoso.`;
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
      messages: [{ role: 'user', content: userPrompt }],
      systemInstruction: SYSTEM_PROMPT,
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
      messages: [{ role: 'user', content: userPrompt }],
      systemInstruction: SYSTEM_PROMPT,
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

  // Intentar primero con el prefetchedContent si existe, si no, descargarlo una vez
  let content = prefetchedContent;
  if (!content) {
    try {
      content = await fetchArticleContent(url);
    } catch (e: any) {
      throw e; // Si falla la descarga, no podemos seguir con ningún provider
    }
  }

  if (!content.text || content.text.length < 100) {
    throw new Error('insufficient_content');
  }

  // Definir orden de providers (el seleccionado primero, luego el resto)
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
