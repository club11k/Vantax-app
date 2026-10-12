import { createHash } from "crypto";

// Bunny Stream (vídeos de Formación). Variables en Render → Environment:
// - BUNNY_STREAM_LIBRARY_ID: ID de la biblioteca (Stream → biblioteca → API)
// - BUNNY_STREAM_API_KEY:   "API Key" de esa biblioteca (misma pantalla API)
// - BUNNY_STREAM_TOKEN_KEY: "Token authentication key" (pantalla Security)
// Las claves nunca salen del servidor: al navegador solo le llegan firmas
// que caducan.

const API = "https://video.bunnycdn.com";

export function bunnyConfig() {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  const apiKey = process.env.BUNNY_STREAM_API_KEY?.trim();
  const tokenKey = process.env.BUNNY_STREAM_TOKEN_KEY?.trim();
  return { libraryId, apiKey, tokenKey, uploadReady: !!(libraryId && apiKey) };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function bunnyCreateVideo(title: string): Promise<string> {
  const { libraryId, apiKey } = bunnyConfig();
  if (!libraryId || !apiKey) throw new Error("Bunny Stream no está configurado.");
  const res = await fetch(`${API}/library/${libraryId}/videos`, {
    method: "POST",
    headers: { AccessKey: apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ title: title.slice(0, 200) || "Vídeo de formación" }),
  });
  if (!res.ok) throw new Error(`Bunny respondió ${res.status} al crear el vídeo.`);
  const json = (await res.json()) as { guid?: string };
  if (!json.guid) throw new Error("Bunny no devolvió el ID del vídeo.");
  return json.guid;
}

export async function bunnyDeleteVideo(videoId: string | null | undefined) {
  const { libraryId, apiKey } = bunnyConfig();
  if (!videoId || !libraryId || !apiKey) return;
  try {
    await fetch(`${API}/library/${libraryId}/videos/${encodeURIComponent(videoId)}`, {
      method: "DELETE",
      headers: { AccessKey: apiKey, Accept: "application/json" },
    });
  } catch (err) {
    console.error("No se pudo borrar el vídeo de Bunny:", err);
  }
}

// Estado del vídeo en Bunny: 0-3 subiendo/procesando, 4 listo, 5-6 error.
export async function bunnyVideoStatus(videoId: string): Promise<{ status: number; progress: number } | null> {
  const { libraryId, apiKey } = bunnyConfig();
  if (!libraryId || !apiKey) return null;
  try {
    const res = await fetch(`${API}/library/${libraryId}/videos/${encodeURIComponent(videoId)}`, {
      headers: { AccessKey: apiKey, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { status?: number; encodeProgress?: number };
    return { status: j.status ?? 0, progress: j.encodeProgress ?? 0 };
  } catch {
    return null;
  }
}

// Firma para que el navegador suba el archivo directamente a Bunny (TUS),
// sin pasar por Render.
export function bunnyUploadSignature(videoId: string) {
  const { libraryId, apiKey } = bunnyConfig();
  if (!libraryId || !apiKey) throw new Error("Bunny Stream no está configurado.");
  const expire = Math.floor(Date.now() / 1000) + 6 * 60 * 60;
  return { libraryId, videoId, expire, signature: sha256(`${libraryId}${apiKey}${expire}${videoId}`) };
}

// Enlace del reproductor firmado (caduca en 6 h). Sin token key configurada
// se devuelve sin firmar (solo funciona si la biblioteca no exige token).
export function bunnyEmbedUrl(videoId: string): string | null {
  const { libraryId, tokenKey } = bunnyConfig();
  if (!libraryId) return null;
  const base = `https://player.mediadelivery.net/embed/${libraryId}/${videoId}`;
  const params = new URLSearchParams({ autoplay: "false", preload: "true", responsive: "true" });
  if (tokenKey) {
    const expires = Math.floor(Date.now() / 1000) + 6 * 60 * 60;
    params.set("token", sha256(`${tokenKey}${videoId}${expires}`));
    params.set("expires", String(expires));
  }
  return `${base}?${params.toString()}`;
}
