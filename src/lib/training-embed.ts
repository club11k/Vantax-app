// Enlaces de vídeo/PDF de Formación → algo incrustable. Sin dependencias de
// servidor, para poder usarlo también en el admin (cliente).

export type VideoEmbed = { kind: "iframe" | "video"; src: string } | null;

// Convierte el enlace de un vídeo (YouTube, Vimeo, Google Drive, Loom, Bunny
// o un .mp4 directo) en algo que se pueda incrustar en la página.
export function toVideoEmbed(raw: string | null | undefined): VideoEmbed {
  const url = (raw ?? "").trim();
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");

  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { kind: "video", src: url };

  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` } : null;
  }
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    let id = u.searchParams.get("v");
    const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/?#]+)/);
    if (!id && m) id = m[2];
    return id ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = u.pathname.split("/").filter(Boolean).filter((p) => p !== "video");
    const id = parts.find((p) => /^\d+$/.test(p));
    if (!id) return null;
    const idx = parts.indexOf(id);
    const hash = u.searchParams.get("h") ?? (parts[idx + 1] && /^[a-f0-9]+$/i.test(parts[idx + 1]) ? parts[idx + 1] : null);
    return { kind: "iframe", src: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ""}` };
  }
  if (host === "drive.google.com") {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    const id = m?.[1] ?? u.searchParams.get("id");
    return id ? { kind: "iframe", src: `https://drive.google.com/file/d/${id}/preview` } : null;
  }
  if (host === "loom.com") {
    const m = u.pathname.match(/\/(share|embed)\/([^/?#]+)/);
    return m ? { kind: "iframe", src: `https://www.loom.com/embed/${m[2]}` } : null;
  }
  if (host === "iframe.mediadelivery.net" || host === "player.mediadelivery.net") {
    return { kind: "iframe", src: url.replace("/play/", "/embed/") };
  }
  return { kind: "iframe", src: url };
}

// Enlace de PDF externo listo para verse dentro de la página (Google Drive
// necesita su modo "preview").
export function toPdfViewUrl(raw: string | null | undefined): string | null {
  const url = (raw ?? "").trim();
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "drive.google.com") {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = m?.[1] ?? u.searchParams.get("id");
      if (id) return `https://drive.google.com/file/d/${id}/preview`;
    }
    return url;
  } catch {
    return null;
  }
}
