// Titulares del canal público de Telegram de noticias de oro de Esther
// (@club11k_news, del proyecto separado "gold-news-telegram-bot"), para
// mostrarlos en el "Feed de Titulares" de Centro de Mercado.
//
// Primer intento (ya descartado): incrustar https://t.me/s/club11k_news en
// un <iframe>. Falló en producción — Telegram bloquea que esa página se
// muestre dentro de un marco (protección estándar anti-framing de
// navegador, ni siquiera es un error nuestro). La alternativa que SÍ
// funciona: el propio SERVIDOR de Vantax descarga esa misma página pública
// (eso no tiene restricción de framing, solo aplica a navegadores
// mostrando un <iframe>), la parsea, y renderizamos los titulares como
// HTML normal nuestro — ya no es un iframe de Telegram, así que el bloqueo
// no aplica.
//
// t.me/s/<canal> es la página de vista previa pública que sirve Telegram
// para que buscadores y navegadores sin sesión puedan ver el contenido de
// un canal público — no es una API oficial, pero su estructura HTML
// (clases "tgme_widget_message_*") lleva años estable y la usan
// habitualmente herramientas de scraping de canales públicos. Igual que el
// resto de fetchers de este proyecto: si el formato cambia y el parseo
// falla, esto devuelve una lista vacía en vez de romper la página — nunca
// se ha podido probar contra el canal real de Esther desde este entorno
// (sin acceso de navegación con sesión), así que puede necesitar un ajuste
// tras el primer despliegue, como pasó con el Excel de SPDR.

const CHANNEL = "club11k_news";
const PREVIEW_URL = `https://t.me/s/${CHANNEL}`;

export type GoldNewsHeadline = {
  text: string;
  url: string;
  dateIso: string | null;
  photoUrl: string | null;
  // Rediseño 06/10/2026: título (primera línea del mensaje) y resto del
  // texto por separado, y la categoría para elegir una ilustración cuando
  // el mensaje no trae foto.
  title: string;
  body: string;
  category: NewsCategory;
};

export type NewsCategory = "fed" | "inflacion" | "empleo" | "geopolitica" | "petroleo" | "oro" | "dolar" | "bolsa" | "general";

// Clasifica la noticia por palabras clave para ponerle una imagen temática
// cuando el canal no adjunta foto.
export function categorizeNews(text: string): NewsCategory {
  const t = text.toLowerCase();
  if (/\bfed\b|fomc|powell|tipos de inter|bancos? centrales?|bce\b|lagarde|boj\b|reserva federal/.test(t)) return "fed";
  if (/ipc|inflaci|ipp|\bcpi\b|\bpce\b|precios al consumo/.test(t)) return "inflacion";
  if (/empleo|desempleo|n[óo]minas|paro\b|nfp|jolts|adp/.test(t)) return "empleo";
  if (/guerra|ataque|misil|ir[áa]n|israel|rusia|ucrania|china|taiw[áa]n|aranceles|sanciones|otan|militar|trump|elecci/.test(t)) return "geopolitica";
  if (/petr[óo]leo|crudo|brent|wti|opep|opec|gas natural/.test(t)) return "petroleo";
  if (/\boro\b|xau|gold|metales? preciosos?|plata/.test(t)) return "oro";
  if (/d[óo]lar|dxy|divisa|euro\b|yen\b/.test(t)) return "dolar";
  if (/bolsa|nasdaq|s&p|dow jones|acciones|wall street|nvidia|ia\b|tecnol/.test(t)) return "bolsa";
  return "general";
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "") // quita el resto de etiquetas (negrita, enlaces, spans de emoji, etc.)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .trim();
}

export async function fetchGoldNewsHeadlines(limit = 8): Promise<GoldNewsHeadline[]> {
  try {
    const res = await fetch(PREVIEW_URL, {
      next: { revalidate: 600 }, // 10 min -- el bot publica varias veces al día, no hace falta más frecuencia
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VantaxBot/1.0)" },
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Cada mensaje vive en un bloque con data-post="canal/ID" -- lo usamos
    // como delimitador para trocear el HTML en un bloque por mensaje.
    const postRegex = /data-post="([^"]+)"/g;
    const posts: { id: string; start: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = postRegex.exec(html))) {
      posts.push({ id: m[1], start: m.index });
    }
    if (posts.length === 0) return [];

    const headlines: GoldNewsHeadline[] = [];
    for (let i = posts.length - 1; i >= 0 && headlines.length < limit; i--) {
      // El feed público viene en orden cronológico ascendente (los más
      // nuevos al final) -- recorremos de atrás hacia delante para coger
      // primero los titulares más recientes.
      const start = posts[i].start;
      const end = i + 1 < posts.length ? posts[i + 1].start : html.length;
      const block = html.slice(start, end);

      const textMatch = /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(block);
      if (!textMatch) continue; // mensajes solo-imagen sin texto, o formato inesperado -- se saltan
      const text = decodeHtmlEntities(textMatch[1]);
      if (!text) continue;

      const timeMatch = /<time[^>]*datetime="([^"]+)"/.exec(block);
      // Imagen: foto del mensaje, miniatura de vídeo o imagen de la vista
      // previa del enlace (lo que haya, en ese orden).
      const photoMatch =
        /tgme_widget_message_photo_wrap[^"]*"[^>]*background-image:url\('([^']+)'\)/.exec(block) ||
        /tgme_widget_message_video_thumb[^"]*"[^>]*background-image:url\('([^']+)'\)/.exec(block) ||
        /link_preview_(?:right_)?image[^"]*"[^>]*background-image:url\('([^']+)'\)/.exec(block);

      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const title = (lines[0] ?? "").replace(/^[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u200D\s]+/u, "") || lines[0] || "";
      const bodyFull = lines.slice(1).join(" ");
      headlines.push({
        title,
        body: bodyFull.length > 220 ? bodyFull.slice(0, 220).trimEnd() + "…" : bodyFull,
        category: categorizeNews(text),
        text: text.length > 280 ? text.slice(0, 280).trimEnd() + "…" : text,
        url: `https://t.me/${posts[i].id}`,
        dateIso: timeMatch ? timeMatch[1] : null,
        photoUrl: photoMatch ? photoMatch[1] : null,
      });
    }

    return headlines;
  } catch {
    return [];
  }
}
