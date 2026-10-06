"use client";

import { useState } from "react";

// Mapa de Fuentes con filtros por categoría (rediseño 06/10/2026). Recibe
// exactamente los mismos grupos y datos que calculaba la página antes;
// aquí solo se elige qué categoría se ve.

export type SourceItem = { label: string; value: string; date: string; source: string };
export type SourceGroup = { key: string; title: string; items: SourceItem[] };

const ACCENT: Record<string, string> = {
  precios: "#E8B84A",
  tasas: "#A78BFA",
  inflacion: "#F472B6",
  liquidez: "#7DD3FC",
  empleo: "#6EE7B7",
  riesgo: "#FCD34D",
  flujos: "#C4B5FD",
};

function fmtDateEs(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return raw;
  const [, year, month, day] = m;
  return `${day}/${month}/${year}`;
}

export function SourceGroups({ groups }: { groups: SourceGroup[] }) {
  const [active, setActive] = useState<string>("todos");
  const visible = active === "todos" ? groups : groups.filter((g) => g.key === active);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="mk-chips" role="tablist" aria-label="Categorías">
        <button type="button" role="tab" aria-selected={active === "todos"} className={`mk-chip${active === "todos" ? " active" : ""}`} onClick={() => setActive("todos")}>
          Todos
        </button>
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            role="tab"
            aria-selected={active === g.key}
            className={`mk-chip${active === g.key ? " active" : ""}`}
            onClick={() => setActive(g.key)}
          >
            <span className="mk-dot" style={{ background: ACCENT[g.key] ?? "#A78BFA" }} />
            {g.title}
          </button>
        ))}
      </div>

      {visible.map((group) => (
        <div key={group.key}>
          <div className="source-group-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="mk-dot" style={{ background: ACCENT[group.key] ?? "#A78BFA" }} />
            {group.title}
          </div>
          <div className="mk-tiles">
            {group.items.map((s, i) => (
              <div key={i} className="mk-tile">
                <span className="mk-tile-label">{s.label}</span>
                <span className="mk-tile-value">{s.value}</span>
                <span className="mk-tile-meta">
                  {fmtDateEs(s.date)} · {s.source}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
