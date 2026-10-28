"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ChartsBoard } from "./ChartsBoard";

// CHARTS (28/10/2026): pestaña principal con el gráfico propio (precios del
// MT5 del bróker) y pestaña secundaria con el widget de TradingView.
const ProChart = dynamic(() => import("./ProChart").then((m) => m.ProChart), {
  ssr: false,
  loading: () => <div className="pc-wrap pc-loading">Cargando gráfico…</div>,
});

const TAB_KEY = "vantax.charts.tab";

export function ChartsTabs() {
  const [tab, setTab] = useState<"pro" | "tv">("pro");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TAB_KEY) === "tv") setTab("tv");
    } catch {
      /* ignorar */
    }
  }, []);

  function pick(t: "pro" | "tv") {
    setTab(t);
    try {
      window.localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignorar */
    }
  }

  return (
    <div className="ch-wrap">
      <div className="ch-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "pro"} className={`ch-tab${tab === "pro" ? " active" : ""}`} onClick={() => pick("pro")}>
          VANTAX · precios del bróker
        </button>
        <button type="button" role="tab" aria-selected={tab === "tv"} className={`ch-tab${tab === "tv" ? " active" : ""}`} onClick={() => pick("tv")}>
          TradingView
        </button>
      </div>
      {tab === "pro" ? <ProChart /> : <ChartsBoard />}
    </div>
  );
}
