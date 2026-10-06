import type { GoldNewsHeadline, NewsCategory } from "@/lib/telegram-news";

// Tarjeta de noticia con imagen (rediseño 06/10/2026: "que tengan imágenes,
// para que se vea más dinámica y no tanta letra"). Si el mensaje de Telegram
// trae foto, se usa esa; si no, se pinta una ilustración temática según la
// categoría de la noticia (Fed, inflación, geopolítica, petróleo...).

const THEME: Record<NewsCategory, { label: string; icon: string; from: string; to: string }> = {
  fed: { label: "Bancos centrales", icon: "🏛️", from: "#4C1D95", to: "#1E1B4B" },
  inflacion: { label: "Inflación", icon: "🔥", from: "#9D174D", to: "#3B0764" },
  empleo: { label: "Empleo", icon: "👷", from: "#0F766E", to: "#1E1B4B" },
  geopolitica: { label: "Geopolítica", icon: "🌍", from: "#7F1D1D", to: "#312E81" },
  petroleo: { label: "Petróleo", icon: "🛢️", from: "#1F2937", to: "#4C1D95" },
  oro: { label: "Oro", icon: "🪙", from: "#A16207", to: "#4C1D95" },
  dolar: { label: "Dólar", icon: "💵", from: "#065F46", to: "#312E81" },
  bolsa: { label: "Bolsa", icon: "📈", from: "#1D4ED8", to: "#3B0764" },
  general: { label: "Mercados", icon: "📰", from: "#5B21B6", to: "#17122A" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function NewsImage({ news, height = 160 }: { news: GoldNewsHeadline; height?: number }) {
  const th = THEME[news.category] ?? THEME.general;
  if (news.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={news.photoUrl} alt="" loading="lazy" className="nw-img" style={{ height }} />
    );
  }
  return (
    <div className="nw-img nw-illu" style={{ height, background: `linear-gradient(135deg, ${th.from}, ${th.to})` }} aria-hidden="true">
      <span className="nw-illu-grid" />
      <span className="nw-illu-icon">{th.icon}</span>
    </div>
  );
}

export function NewsCard({ news, featured = false }: { news: GoldNewsHeadline; featured?: boolean }) {
  const th = THEME[news.category] ?? THEME.general;
  return (
    <a href={news.url} target="_blank" rel="noopener noreferrer" className={`nw-card${featured ? " nw-featured" : ""}`}>
      <div className="nw-media">
        <NewsImage news={news} height={featured ? 260 : 160} />
        <span className="nw-tag">{th.label}</span>
      </div>
      <div className="nw-body">
        <span className="nw-date">{fmtDate(news.dateIso)}</span>
        <span className="nw-title">{news.title}</span>
        {news.body && <span className="nw-text">{news.body}</span>}
        <span className="nw-more">Leer en Telegram ↗</span>
      </div>
    </a>
  );
}
