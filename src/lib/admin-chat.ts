// Agente de análisis conversacional para el admin (Esther) — unifica en un
// solo sitio lo que antes estaba repartido entre el generador de análisis de
// botón fijo y un chat de investigación aparte: aquí puede razonar con la
// IA, pedirle el análisis completo de la situación actual en el tono que
// quiera (con explicación del porqué y el cómo, no solo el resultado),
// adjuntar capturas de gráfico, y guardar cualquier respuesta como un
// análisis real del historial cuando le convenza.
//
// A diferencia del chat original, esto SÍ está anclado a los datos reales:
// en cada turno se reconstruye el snapshot de mercado (el mismo que usa
// generateAnalysis) y se inyecta fresco en el system prompt, así que
// cualquier precio o nivel que dé la IA sigue saliendo de datos reales y
// nunca de lo que "recuerde" de turnos anteriores. Además tiene búsqueda web
// en tiempo real para contrastar con noticias y eventos recientes.
//
// El SDK instalado (@anthropic-ai/sdk 0.32.1) es de antes de que existiera
// la tool de búsqueda web del lado servidor, así que sus tipos de TS no la
// conocen — pero la API sí la soporta igual (es solo JSON sobre HTTP), por
// eso los `as any` en este archivo: no son un hack real, son solo para
// esquivar un typing desactualizado del SDK.

import { anthropic, ANALYSIS_MODEL } from "@/lib/anthropic";
import { buildMarketSnapshot } from "@/lib/vantax-data";
import { getSystemPrompt, formatSnapshotForPrompt, WEB_SEARCH_POLICY } from "@/lib/analysis-engine";

export type ChatContentBlock = Record<string, any>;

export type ChatMessage = {
  role: "user" | "assistant";
  // Para "user": un string simple, o un array de bloques (texto + imágenes
  // adjuntas de gráficos). Para "assistant": el array de content blocks TAL
  // CUAL lo devolvió Anthropic (incluye server_tool_use,
  // web_search_tool_result y los bloques de texto con sus citations) — hay
  // que reenviarlo sin tocar en el siguiente turno, si no la API rechaza la
  // conversación (ver docs de la web search tool).
  content: string | ChatContentBlock[];
};

const AGENT_MODE_ADDENDUM =
  "MODO CONVERSACIÓN CON LA ADMINISTRADORA: aquí no le estás escribiendo directamente al canal, estás hablando " +
  "con Esther, la administradora de VANTAX, para razonar juntos el análisis de la situación actual antes de que " +
  "lo use o lo publique. Puedes y debes explicar tu razonamiento — el porqué y el cómo llegas a una lectura, " +
  "qué dato pesa más ahora mismo y por qué, qué lo contradice, qué te haría cambiar de idea — con una " +
  "personalidad cercana, natural y con matices, como si el análisis lo estuviera escribiendo ella misma: nada " +
  "de tono de informe corporativo. Puedes mantener una conversación de varios turnos con normalidad: si te pide " +
  "que profundices en algo, que contrastes con otra fuente, que le des otro enfoque o que ajustes el tono, " +
  "hazlo. Cuando te pida el análisis final listo para publicar (formato mensaje o técnico), escríbelo siguiendo " +
  "exactamente la estructura y reglas que ya tienes definidas para ese formato — el resto de la conversación " +
  "puede ser más libre y explicativa, pero el análisis en sí, y cualquier precio o cifra que menciones en " +
  "cualquier momento de la conversación, nunca sale de tu memoria ni de lo que encuentres buscando: siempre del " +
  "snapshot de datos de mercado que se te da a continuación, actualizado en cada uno de tus turnos.";

async function buildAgentSystemPrompt(): Promise<string> {
  const [basePrompt, snapshot] = await Promise.all([getSystemPrompt(), buildMarketSnapshot()]);
  const snapshotText = formatSnapshotForPrompt(snapshot);
  return (
    `${basePrompt}\n\n${WEB_SEARCH_POLICY}\n\n${AGENT_MODE_ADDENDUM}\n\n` +
    `DATOS DE MERCADO ACTUALES (recién calculados, úsalos para cualquier precio, nivel o cifra que menciones ` +
    `en esta respuesta):\n\n${snapshotText}`
  );
}

export async function runAdminChat(messages: ChatMessage[]): Promise<ChatContentBlock[]> {
  const system = await buildAgentSystemPrompt();

  const response = await anthropic.messages.create({
    model: ANALYSIS_MODEL,
    // Conversación + razonamiento explicado puede ser más largo que un
    // análisis final suelto (era 2000).
    max_tokens: 3000,
    system,
    messages: messages as any,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        // Tope por mensaje para no disparar el coste (cada búsqueda se
        // factura aparte) — de sobra para contrastar varias fuentes.
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
