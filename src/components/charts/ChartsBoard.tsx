"use client";

import { useEffect, useRef, useState } from "react";

// CHARTS (28/10/2026): gráfico avanzado de TradingView incrustado (gratis),
// con todos sus símbolos, indicadores, herramientas de dibujo y
// temporalidades. Los botones de arriba son atajos; dentro del gráfico se
// puede buscar cualquier símbolo de TradingView. El último atajo elegido se
// recuerda en este navegador.
const PRESETS = [
  { label: "XAUUSD", symbol: "OANDA:XAUUSD" },
  { label: "DXY", symbol: "CAPITALCOM:DXY" },
  { label: "US100", symbol: "CAPITALCOM:US100" },
  { label: "US500", symbol: "CAPITALCOM:US500" },
  { label: "EURUSD", symbol: "OANDA:EURUSD" },
  { label: "GBPUSD", symbol: "OANDA:GBPUSD" },
  { label: "USOIL", symbol: "TVC:USOIL" },
  { label: "BTCUSD", symbol: "BITSTAMP:BTCUSD" },
];
const STORAGE_KEY = "vantax.charts.symbol";

export function ChartsBoard() {
  const container = useRef<HTMLDivElement>(null);
  const [symbol, setSymbol] = useState(PRESETS[0].symbol);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setSymbol(saved);
    } catch {
      /* sin almacenamiento: XAUUSD por defecto */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, symbol);
    } catch {
      /* ignorar */
    }
    const el = container.current;
    if (!el) return;
    el.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    el.appendChild(widget);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "15",
      timezone: "Europe/Madrid",
      theme: "dark",
      style: "1",
      locale: "es",
      backgroundColor: "#0A0714",
      gridColor: "rgba(139, 127, 217, 0.08)",
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: true,
      details: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(script);
    return () => {
      el.innerHTML = "";
    };
  }, [symbol, ready]);

  return (
    <div className="ch-wrap">
      <div className="ch-presets" role="tablist" aria-label="Símbolos rápidos">
        {PRESETS.map((p) => (
          <button
            key={p.symbol}
            type="button"
            role="tab"
            aria-selected={symbol === p.symbol}
            className={`ch-preset${symbol === p.symbol ? " active" : ""}`}
            onClick={() => setSymbol(p.symbol)}
          >
            {p.label}
          </button>
        ))}
        <span className="ch-hint">o busca cualquier símbolo dentro del gráfico 🔍</span>
      </div>
      <div className="ch-chart panel">
        <div ref={container} className="tradingview-widget-container" style={{ height: "100%", width: "100%" }} />
      </div>
    </div>
  );
}
