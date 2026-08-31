"use client";

// Mapa del mundo con las relaciones de flujo entre plazas financieras
// (oro, política monetaria, aversión al riesgo). Es el mismo mapa
// conceptual del prototipo original (artifact), portado a React: la
// textura de continentes se dibuja en un <canvas>, las ciudades y los
// arcos animados van en SVG nativo (SMIL), sin librerías externas.
//
// Importante: como dice el pie del mapa, es un diagrama conceptual de las
// relaciones descritas en la arquitectura del motor — NO representa
// magnitudes de flujo en tiempo real (esos números reales ya están en el
// Bias Score y en el mapa de fuentes, más abajo en esta misma página).

import { useEffect, useRef, useState } from "react";

// Polígonos aproximados de los continentes, solo para la textura de puntos de fondo.
const CONTINENTS: [number, number][][] = [
  [[-165,68],[-140,70],[-100,73],[-80,68],[-65,58],[-55,48],[-52,46],[-58,42],
    [-75,35],[-81,25],[-97,18],[-92,14],[-84,8],[-79,8],[-83,10],[-96,16],
    [-106,23],[-110,24],[-115,30],[-117,33],[-124,41],[-125,49],[-135,58],[-165,68]],
  [[-77,8],[-71,11],[-60,10],[-51,1],[-35,-5],[-35,-10],[-38,-13],[-40,-23],
    [-48,-25],[-58,-34],[-62,-40],[-68,-55],[-70,-52],[-71,-40],[-70,-30],
    [-71,-18],[-75,-5],[-77,2],[-77,8]],
  [[-9,43],[-9,51],[-5,58],[5,62],[12,66],[20,70],[30,70],[40,66],[45,60],
    [40,54],[45,50],[55,50],[50,45],[40,45],[30,41],[28,36],[23,39],[19,40],
    [13,38],[9,41],[3,43],[-9,43]],
  [[-17,21],[-16,14],[-10,6],[3,6],[9,4],[9,-5],[12,-18],[14,-22],[18,-34],
    [26,-34],[32,-26],[35,-20],[40,-15],[40,-2],[43,5],[43,11],[43,15],
    [38,18],[35,22],[34,27],[32,31],[25,31],[15,32],[10,37],[-2,35],[-6,35],
    [-9,32],[-17,21]],
  [[30,41],[35,37],[35,30],[40,30],[48,29],[52,24],[56,25],[60,25],[62,24],
    [68,24],[70,20],[73,17],[77,8],[80,8],[83,17],[90,20],[92,15],[95,5],
    [100,5],[103,1],[104,11],[106,10],[109,10],[109,21],[104,23],[98,25],
    [95,28],[97,30],[105,35],[112,32],[122,30],[121,31],[122,37],[130,35],
    [130,42],[142,45],[142,35],[140,45],[142,55],[135,60],[130,72],[100,78],
    [70,75],[55,68],[45,50],[30,41]],
  [[113,-22],[122,-18],[130,-12],[137,-12],[142,-11],[145,-16],[147,-19],
    [153,-28],[150,-33],[150,-37],[143,-39],[140,-38],[136,-35],[131,-32],
    [122,-34],[115,-34],[113,-26],[113,-22]],
];

function pointInPolygon(x: number, y: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function project(lat: number, lon: number) {
  const x = ((lon + 180) / 360) * 1000;
  const y = ((90 - lat) / 180) * 500;
  return [x, y] as const;
}

const CITIES: Record<string, { name: string; lat: number; lon: number }> = {
  nyc: { name: "Nueva York (Fed/COMEX)", lat: 40.7, lon: -74.0 },
  dc: { name: "Washington (Fed)", lat: 38.9, lon: -77.0 },
  london: { name: "Londres (LBMA)", lat: 51.5, lon: -0.1 },
  zurich: { name: "Zúrich", lat: 47.4, lon: 8.5 },
  frankfurt: { name: "Fráncfort (BCE)", lat: 50.1, lon: 8.7 },
  istanbul: { name: "Estambul", lat: 41.0, lon: 28.9 },
  dubai: { name: "Dubái", lat: 25.2, lon: 55.3 },
  mumbai: { name: "Bombay (RBI)", lat: 19.1, lon: 72.9 },
  shanghai: { name: "Shanghái (SGE)", lat: 31.2, lon: 121.5 },
  beijing: { name: "Pekín (PBoC)", lat: 39.9, lon: 116.4 },
  tokyo: { name: "Tokio (BoJ)", lat: 35.7, lon: 139.7 },
  sydney: { name: "Sídney", lat: -33.9, lon: 151.2 },
};

type FlowKind = "oro" | "politica" | "riesgo";

const FLOWS: { from: string; to: string; kind: FlowKind; dur: number }[] = [
  { from: "beijing", to: "zurich", kind: "oro", dur: 6 },
  { from: "mumbai", to: "dubai", kind: "oro", dur: 5 },
  { from: "istanbul", to: "zurich", kind: "oro", dur: 5.5 },
  { from: "dc", to: "london", kind: "politica", dur: 4.5 },
  { from: "frankfurt", to: "dc", kind: "politica", dur: 4.8 },
  { from: "tokyo", to: "sydney", kind: "riesgo", dur: 4 },
  { from: "shanghai", to: "london", kind: "oro", dur: 6.4 },
  { from: "nyc", to: "tokyo", kind: "politica", dur: 7 },
];

const FLOW_COLOR: Record<FlowKind, string> = {
  oro: "var(--gold-bright)",
  politica: "var(--violet)",
  riesgo: "var(--down)",
};

function arcPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 - Math.abs(a.x - b.x) * 0.18 - 30;
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
}

export function MarketFlowMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    const canvas = canvasRef.current;
    if (!canvas) return;

    function draw() {
      const el = canvasRef.current;
      if (!el) return;
      const box = el.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      el.width = box.width * dpr;
      el.height = box.height * dpr;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      const W = box.width;
      const H = box.height;

      const stepLon = 1.8;
      const stepLat = 1.8;
      for (let lat = 74; lat >= -58; lat -= stepLat) {
        for (let lon = -180; lon <= 180; lon += stepLon) {
          let land = false;
          for (const poly of CONTINENTS) {
            if (pointInPolygon(lon, lat, poly)) {
              land = true;
              break;
            }
          }
          if (!land) continue;
          const x = ((lon + 180) / 360) * W;
          const y = ((90 - lat) / 180) * H;
          const jitter = (Math.random() - 0.5) * 0.6;
          const r = 0.55 + Math.random() * 0.35;
          const alpha = 0.16 + Math.random() * 0.14;
          ctx.beginPath();
          ctx.arc(x + jitter, y + jitter, r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(160,150,220,${alpha})`;
          ctx.fill();
        }
      }
    }

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);

  const cityPoints = Object.fromEntries(
    Object.entries(CITIES).map(([key, c]) => {
      const [x, y] = project(c.lat, c.lon);
      return [key, { ...c, x, y }];
    })
  );

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Mapa de Relaciones de Flujo — Oro, Política, Riesgo</span>
        <span className="panel-sub">{FLOWS.length} relaciones</span>
      </div>
      <div style={{ position: "relative", width: "100%", aspectRatio: "2 / 1.05", borderRadius: 5, overflow: "hidden", background: "var(--bg-panel-raised)" }}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        <svg viewBox="0 0 1000 500" width="100%" height="100%" style={{ display: "block", position: "relative" }}>
          <g stroke="#1C1530" strokeWidth={1}>
            <line x1={0} y1={125} x2={1000} y2={125} />
            <line x1={0} y1={250} x2={1000} y2={250} />
            <line x1={0} y1={375} x2={1000} y2={375} />
            <line x1={166} y1={0} x2={166} y2={500} />
            <line x1={333} y1={0} x2={333} y2={500} />
            <line x1={500} y1={0} x2={500} y2={500} />
            <line x1={666} y1={0} x2={666} y2={500} />
            <line x1={833} y1={0} x2={833} y2={500} />
          </g>
          <g>
            {FLOWS.map((f, i) => {
              const a = cityPoints[f.from];
              const b = cityPoints[f.to];
              const d = arcPath(a, b);
              const col = FLOW_COLOR[f.kind];
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke={col} strokeWidth={1} opacity={0.28} />
                  {animate && (
                    <circle r={2.4} fill={col}>
                      <animateMotion dur={`${f.dur}s`} repeatCount="indefinite" path={d} begin={`${i * 0.6}s`} />
                      <animate
                        attributeName="opacity"
                        values="0;1;1;0"
                        keyTimes="0;0.05;0.9;1"
                        dur={`${f.dur}s`}
                        repeatCount="indefinite"
                        begin={`${i * 0.6}s`}
                      />
                    </circle>
                  )}
                </g>
              );
            })}
          </g>
          <g>
            {Object.entries(cityPoints).map(([key, c]) => (
              <g key={key}>
                <circle cx={c.x} cy={c.y} r={2.6} fill="#8A9099" />
                {animate && (
                  <circle cx={c.x} cy={c.y} r={2.6} fill="none" stroke="var(--violet-bright)" strokeWidth={1} opacity={0.5}>
                    <animate attributeName="r" values="2.6;9;2.6" dur="3.4s" repeatCount="indefinite" begin={`${Math.random() * 3}s`} />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="3.4s" repeatCount="indefinite" begin={`${Math.random() * 3}s`} />
                  </circle>
                )}
                <text x={c.x + 6} y={c.y - 6} fontFamily="var(--font-mono)" fontSize={8.5} fill="#8A85A0">
                  {c.name}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap", fontSize: 11, color: "var(--text-muted)" }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--gold-bright)", marginRight: 6 }} />Compras oficiales de oro (bancos centrales)</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--violet)", marginRight: 6 }} />Transmisión de política monetaria</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--down)", marginRight: 6 }} />Aversión al riesgo / refugio</span>
      </div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-dim)", marginTop: 10, lineHeight: 1.6 }}>
        Diagrama conceptual de las relaciones entre plazas financieras — no representa magnitudes de flujo en tiempo real
        (los datos reales de flujo están en el Bias Score y el mapa de fuentes más abajo).
      </p>
    </div>
  );
}
