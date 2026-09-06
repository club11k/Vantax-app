// Lectura del resultado diario de trading a partir de una foto, usando el
// modelo con visión de Anthropic. Mismo patrón multimodal que
// analysis-engine.ts (captura de gráfico para el análisis de admin).
//
// Principio de diseño no negociable: la IA nunca "adivina" una cifra. Si no
// puede leer con confianza un resultado numérico claro en la imagen, debe
// decir explícitamente que no puede — nunca inventa un número. Además, lo
// que devuelve esta función es solo una PROPUESTA: el resultado leído se le
// muestra al usuario para que lo confirme o lo corrija antes de guardarse
// como entrada real del diario (eso lo hace el endpoint que llama a esta
// función, no esta función).

import { anthropic, ANALYSIS_MODEL } from "@/lib/anthropic";

export type JournalVisionInput = {
  mediaType: string;
  base64Data: string;
};

export type JournalVisionResult =
  | { ok: true; amount: number; confidence: "alta" | "media"; note: string }
  | { ok: false; reason: string };

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const SYSTEM_PROMPT =
  "Eres un lector de capturas de pantalla de resultados de trading (terminales como MT4/MT5, apps de brokers, o " +
  "resúmenes de una plataforma). Tu única tarea es encontrar el resultado (P/L) del día que se ve en la imagen y " +
  "devolverlo. NUNCA inventes ni estimes una cifra que no puedas leer con claridad en la imagen. Si la imagen no " +
  "muestra un resultado numérico claro de un día (por ejemplo, si es un gráfico de precios sin cifra de cierre, " +
  "algo borroso o cortado, o no hay ninguna cifra de ganancia/pérdida visible), debes decir que no puedes leerlo " +
  "con confianza en vez de adivinar. Responde ÚNICAMENTE con un objeto JSON, sin texto antes ni después, sin " +
  "bloque de código, con esta forma exacta:\n" +
  '{"found": true, "amount": <número, positivo si es ganancia, negativo si es pérdida, sin símbolos de moneda ni separadores de miles>, "confidence": "alta" o "media", "note": "<qué viste, en una frase corta>"}\n' +
  "o, si no puedes leerlo con confianza:\n" +
  '{"found": false, "reason": "<motivo breve>"}';

export async function readDailyResultFromImage(input: JournalVisionInput): Promise<JournalVisionResult> {
  if (!ALLOWED_IMAGE_TYPES.has(input.mediaType)) {
    return { ok: false, reason: "Formato de imagen no soportado. Usa PNG, JPG, GIF o WEBP." };
  }

  let text = "";
  try {
    const message = await anthropic.messages.create({
      model: ANALYSIS_MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
                data: input.base64Data,
              },
            },
            {
              type: "text",
              text: "Lee el resultado del día en esta captura y responde solo con el JSON indicado.",
            },
          ],
        },
      ],
    });

    text = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n")
      .trim();
  } catch {
    return { ok: false, reason: "No se pudo contactar al servicio de lectura de imágenes. Inténtalo de nuevo en unos segundos." };
  }

  try {
    // Por si el modelo envuelve el JSON en un bloque de código pese a la instrucción.
    const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    if (parsed && parsed.found === true && typeof parsed.amount === "number" && Number.isFinite(parsed.amount)) {
      return {
        ok: true,
        amount: parsed.amount,
        confidence: parsed.confidence === "alta" ? "alta" : "media",
        note: typeof parsed.note === "string" ? parsed.note : "",
      };
    }

    return {
      ok: false,
      reason: typeof parsed?.reason === "string" ? parsed.reason : "No se pudo leer un resultado claro en la imagen.",
    };
  } catch {
    return {
      ok: false,
      reason: "No se pudo interpretar la respuesta de la IA. Intenta con otra foto o ingresa el resultado a mano.",
    };
  }
}
