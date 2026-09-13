// Chat libre para el admin (Esther), separado del generador de análisis: a
// diferencia de generateAnalysis (que solo usa el snapshot de datos macro
// que se refresca por cron y por eso puede quedarse "atrasado" varios días),
// este chat tiene búsqueda web en tiempo real — pensado para preguntar por
// noticias de última hora del oro, o para probar/ajustar prompts antes de
// llevarlos al motor de análisis.
//
// El SDK instalado (@anthropic-ai/sdk 0.32.1) es de antes de que existiera
// la tool de búsqueda web del lado servidor, así que sus tipos de TS no la
// conocen — pero la API sí la soporta igual (es solo JSON sobre HTTP), por
// eso los `as any` en este archivo: no son un hack real, son solo para
// esquivar un typing desactualizado del SDK.

import { anthropic, ANALYSIS_MODEL } from "@/lib/anthropic";

export type ChatContentBlock = Record<string, any>;

export type ChatMessage = {
  role: "user" | "assistant";
  // Para "user": normalmente un string simple. Para "assistant": el array
  // de content blocks TAL CUAL lo devolvió Anthropic (incluye
  // server_tool_use, web_search_tool_result y los bloques de texto con sus
  // citations) — hay que reenviarlo sin tocar en el siguiente turno, si no
  // la API rechaza la conversación (ver docs de la web search tool).
  content: string | ChatContentBlock[];
};

const SYSTEM_PROMPT =
  "Eres el asistente de investigación de Esther, administradora de VANTAX (una plataforma de análisis de " +
  "XAUUSD/oro para su comunidad de trading, Club 11K). Tienes búsqueda web en tiempo real: úsala siempre que " +
  "te pregunte por noticias, eventos, datos o precios recientes — sobre todo cualquier cosa relacionada con " +
  "el oro, el dólar (DXY), la Reserva Federal o geopolítica que pueda mover el oro. No te limites a tu " +
  "conocimiento previo si la pregunta es sobre algo actual: busca primero. También la ayudas a diseñar y " +
  "probar prompts de sistema para el motor de análisis automático de la plataforma (razona con ella qué " +
  "instrucciones funcionarían mejor, dale ejemplos concretos). Sé directo y conciso, sin relleno innecesario. " +
  "Responde siempre en español de España, tuteo con \"tú\", nunca voseo (\"vos\"/\"podés\"/\"tenés\").";

export async function runAdminChat(messages: ChatMessage[]): Promise<ChatContentBlock[]> {
  const response = await anthropic.messages.create({
    model: ANALYSIS_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: messages as any,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        // Tope por mensaje para no disparar el coste (cada búsqueda se
        // factura aparte) — de sobra para un par de búsquedas por pregunta.
        max_uses: 5,
      },
    ],
  } as any);

  return (response as any).content as ChatContentBlock[];
}

// Saca el texto legible de la respuesta (concatena los bloques de tipo
// "text", ignorando server_tool_use/web_search_tool_result que no son texto
// para mostrar directamente).
export function extractChatText(content: ChatContentBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text as string)
    .join("\n");
}

// Junta las fuentes citadas (de las citations de cada bloque de texto),
// deduplicadas por URL, para mostrarlas debajo de la respuesta.
export function extractChatSources(content: ChatContentBlock[]): { url: string; title: string }[] {
  const seen = new Map<string, string>();
  for (const block of content) {
    if (block.type !== "text" || !Array.isArray(block.citations)) continue;
    for (const c of block.citations) {
      if (c?.type === "web_search_result_location" && c.url && !seen.has(c.url)) {
        seen.set(c.url, c.title || c.url);
      }
    }
  }
  return Array.from(seen.entries()).map(([url, title]) => ({ url, title }));
}
