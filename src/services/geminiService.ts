import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

export type Provider = 'gemini' | 'openrouter' | 'grok';

export async function summarizeUrl(
  url: string, 
  language: string = "Spanish", 
  userApiKey?: string, 
  length: 'short' | 'medium' | 'long' | 'child' = 'short',
  provider: Provider = 'gemini'
) {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey === "undefined") {
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

  if (provider === 'gemini') {
    const ai = new GoogleGenAI({ apiKey });
    const model = "gemini-3-flash-preview";
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
  } else {
    // For OpenRouter and Grok, we need to fetch the content first
    const fetchResponse = await fetch('/api/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!fetchResponse.ok) {
      throw new Error("Failed to fetch article content for this provider.");
    }

    const { text: articleContent } = await fetchResponse.json();

    const baseURL = provider === 'openrouter' 
      ? "https://openrouter.ai/api/v1" 
      : "https://api.x.ai/v1";
    
    const model = provider === 'openrouter' 
      ? "google/gemini-2.0-flash-001" 
      : "grok-2-latest";

    const openai = new OpenAI({
      apiKey,
      baseURL,
      dangerouslyAllowBrowser: true
    });

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: `Analyze this content from ${url}. 
          ${lengthInstruction}
          The response must be in ${language}.
          
          CONTENT:
          ${articleContent}` 
        }
      ],
    });

    return completion.choices[0].message.content || "No summary available.";
  }
}
