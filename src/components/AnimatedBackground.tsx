"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

// Fondo animado de toda la web (rediseño visual pedido por Esther, 06/10/2026).
// - En todas las páginas: cuadrícula lila con casillas que se iluminan y haces
//   de luz que salen de un punto central y avanzan por las líneas.
// - En /play: escena arcade retro (estrellas, sol a rayas, suelo en
//   perspectiva) con naves que se disparan.
// En móviles (pantalla estrecha o táctil) se pinta una versión LIGERA: menos
// piezas animadas y sin el brillo difuminado, que es lo que más cuesta
// redibujar y hacía que la web fuera a tirones (06/10/2026). Por defecto se
// arranca en ligero y, si es un ordenador, se pasa a la versión completa.
// Es solo decoración: va fijo detrás de todo (z-index 0, aria-hidden, sin
// eventos de ratón). Los datos se generan con una semilla fija, así que el
// servidor y el navegador pintan exactamente lo mismo (sin errores de
// hidratación). Las animaciones viven en globals.css (bloque "vx-").

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 1920;
const H = 1080;

/* ---------------- Cuadrícula con haces ---------------- */

function GridScene({ lite }: { lite: boolean }) {
  const { tiles, beams } = useMemo(() => {
    const r = rng(7);
    const C = 40;
    const cx = 960;
    const cy = 560;
    const tilesColors = ["#7C3AED", "#A78BFA", "#C4B5FD"];
    const tiles = Array.from({ length: 70 }, () => ({
      x: Math.floor(r() * (W / C)) * C + 4,
      y: Math.floor(r() * (H / C)) * C + 4,
      fill: tilesColors[Math.floor(r() * 3)],
      dur: (6 + r() * 6).toFixed(1),
      delay: (r() * 10).toFixed(1),
    }));
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const beamColors = ["#A78BFA", "#C4B5FD", "#E9D5FF"];
    const beams = Array.from({ length: 26 }, (_, i) => {
      let x = cx;
      let y = cy;
      let d = dirs[i % 4];
      const pts: [number, number][] = [[x, y]];
      let L = 0;
      while (x >= 0 && x <= W && y >= 0 && y <= H && L < 4000) {
        const n = 2 + Math.floor(r() * 6);
        x += d[0] * n * C;
        y += d[1] * n * C;
        L += n * C;
        pts.push([x, y]);
        const turn = r();
        d = turn < 0.33 ? [d[1], d[0]] : turn < 0.66 ? [-d[1], -d[0]] : d;
      }
      const dur = L / 260;
      return {
        d: "M" + pts.map((p) => `${p[0]} ${p[1]}`).join(" L"),
        color: beamColors[Math.floor(r() * 3)],
        dur: dur.toFixed(1),
        delay: (r() * dur).toFixed(1),
      };
    });
    return lite ? { tiles: tiles.slice(0, 22), beams: beams.slice(0, 10) } : { tiles, beams };
  }, [lite]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges" className="vx-bg-svg" style={{ opacity: 0.55 }}>
      <defs>
        <pattern id="vxCell" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#2E2447" strokeWidth="2" />
        </pattern>
        <filter id="vxGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width={W} height={H} fill="url(#vxCell)" />
      {tiles.map((t, i) => (
        <rect key={`t${i}`} x={t.x} y={t.y} width={32} height={32} fill={t.fill} style={{ opacity: 0, animation: `vx-tile ${t.dur}s ${t.delay}s ease-in-out infinite` }} />
      ))}
      {beams.map((b, i) => (
        <path
          key={`b${i}`}
          d={b.d}
          pathLength={1000}
          fill="none"
          stroke={b.color}
          strokeWidth={3}
          strokeLinecap="square"
          strokeDasharray="70 1000"
          filter={lite ? undefined : "url(#vxGlow)"}
          style={{ strokeDashoffset: 70, animation: `vx-beam ${b.dur}s ${b.delay}s linear infinite` }}
        />
      ))}
      <rect x={952} y={552} width={16} height={16} fill="#C4B5FD" filter={lite ? undefined : "url(#vxGlow)"} style={{ animation: "vx-node 2s ease-in-out infinite" }} />
    </svg>
  );
}

/* ---------------- Escena arcade (Vantax Play) ---------------- */

type Pal = Record<string, string>;

function Sprite({ rows, pal, x, y, sc = 6, flicker }: { rows: string[]; pal: Pal; x: number; y: number; sc?: number; flicker?: string }) {
  const rects: JSX.Element[] = [];
  rows.forEach((row, j) =>
    row.split("").forEach((ch, i) => {
      if (pal[ch]) {
        rects.push(
          <rect key={`${i}-${j}`} x={i} y={j} width={1} height={1} fill={pal[ch]} style={flicker && ch === flicker ? { animation: "vx-flick .25s steps(2) infinite" } : undefined} />
        );
      }
    })
  );
  return <g transform={`translate(${x} ${y}) scale(${sc})`}>{rects}</g>;
}

const SHIP = [".....W.....", "....WVW....", "....VVV....", "...VVLVV...", ".V.VLLLV.V.", "VVVVLLLVVVV", "VVVVVVVVVVV", "V.PP...PP.V", "...P...P..."];
const SHIP_P: Pal = { W: "#FFFFFF", V: "#A78BFA", L: "#E9D5FF", P: "#F472B6" };
const ENEMY = ["..R.....R..", "...RRRRR...", "..RRERERR..", ".RRRRRRRRR.", "R.R.RRR.R.R", "R.R.....R.R", "...RR.RR..."];
const ENEMY_P: Pal = { R: "#F2EFF8", E: "#F472B6" };
const UFO = [".....MMMMMM.....", "...MMMMMMMMMM...", "..MMYMMYMMYMMM..", ".MMMMMMMMMMMMMM.", "..MMM..MM..MMM..", "...M........M..."];
const UFO_P: Pal = { M: "#F472B6", Y: "#FACC15" };
const BOOM = ["Y...Y...Y", ".Y..Y..Y.", "..Y.Y.Y..", "...WWW...", "YYYWWWYYY", "...WWW...", "..Y.Y.Y..", ".Y..Y..Y.", "Y...Y...Y"];
const BOOM_P: Pal = { Y: "#FACC15", W: "#FFFFFF" };

function ArcadeScene({ lite }: { lite: boolean }) {
  const HZ = 600;
  const CX = 960;
  const data = useMemo(() => {
    const r = rng(8);
    const starColors = ["#FFFFFF", "#E9D5FF", "#F0ABFC", "#FACC15"];
    const sizes = [4, 4, 6, 8];
    const stars = Array.from({ length: 70 }, () => ({
      x: Math.floor((r() * W) / 4) * 4,
      y: Math.floor((r() * (HZ - 40)) / 4) * 4,
      s: sizes[Math.floor(r() * 4)],
      fill: starColors[Math.floor(r() * 4)],
      dur: (1.4 + r() * 2).toFixed(1),
      delay: (r() * 3).toFixed(1),
    }));
    const vlines: { x0: number; xb: number }[] = [];
    const beams: { x0: number; xb: number; dur: string; delay: string }[] = [];
    for (let xb = -2400; xb <= W + 2400; xb += 200) {
      const x0 = CX + (xb - CX) * 0.04;
      vlines.push({ x0, xb });
      if (r() < 0.35 && xb > -200 && xb < W + 200) {
        beams.push({ x0, xb, dur: (1.6 + r() * 1.6).toFixed(1), delay: (r() * 4).toFixed(1) });
      }
    }
    const drops = [700, 804, 908, 1012, 1116, 1220].map((x) => ({ x, on: r() < 0.7, delay: (r() * 3).toFixed(1) }));
    return lite
      ? { stars: stars.slice(0, 30), vlines, beams: [] as typeof beams, drops: drops.map((d) => ({ ...d, on: false })) }
      : { stars, vlines, beams, drops };
  }, [lite]);

  // Duelos nave-enemigo: el láser sale de la nave, llega al enemigo, este
  // explota y reaparece. Mismo ciclo de 2,4 s para que todo cuadre.
  const allDuels = [
    { x: 420, delay: 0, yo: 0 },
    { x: 1500, delay: 1.2, yo: 0 },
    { x: 150, delay: 0.6, yo: 0 },
    { x: 1770, delay: 1.8, yo: 0 },
    { x: 260, delay: 1.5, yo: 120 },
    { x: 1660, delay: 0.3, yo: 120 },
  ];
  const duels = lite ? allDuels.slice(0, 2) : allDuels;
  const allDivers = [
    { x: 60, delay: 0, dur: 7 },
    { x: 1840, delay: 3.5, dur: 7 },
    { x: 330, delay: 2, dur: 9 },
    { x: 1590, delay: 5.5, dur: 9 },
  ];
  const divers = lite ? [] : allDivers;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="vx-bg-svg" style={{ opacity: 0.6 }}>
      <defs>
        <linearGradient id="vxSun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FACC15" />
          <stop offset="0.45" stopColor="#F472B6" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="vxFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A1450" />
          <stop offset="1" stopColor="#0E0A18" />
        </linearGradient>
        <filter id="vxArGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <mask id="vxSunMask">
          <rect x="0" y="0" width={W} height={H} fill="#FFFFFF" />
          {[[470, 6], [505, 9], [535, 12], [562, 15], [586, 14]].map(([y, h]) => (
            <rect key={y} x="0" y={y} width={W} height={h} fill="#000000" />
          ))}
          <rect x="0" y={HZ} width={W} height={H - HZ} fill="#000000" />
        </mask>
      </defs>

      {data.stars.map((s, i) => (
        <rect key={`s${i}`} x={s.x} y={s.y} width={s.s} height={s.s} fill={s.fill} shapeRendering="crispEdges" style={{ animation: `vx-twinkle ${s.dur}s ${s.delay}s steps(2) infinite` }} />
      ))}
      <circle cx={CX} cy={HZ - 40} r={230} fill="url(#vxSun)" mask="url(#vxSunMask)" />
      <rect x="0" y={HZ} width={W} height={H - HZ} fill="url(#vxFloor)" />
      <g>
        {data.vlines.map((l, i) => (
          <line key={`v${i}`} x1={l.x0} y1={HZ} x2={l.xb} y2={H} stroke="#A78BFA" strokeWidth={2.5} />
        ))}
        {Array.from({ length: lite ? 4 : 8 }, (_, k) => (
          <line key={`h${k}`} x1="0" y1={HZ} x2={W} y2={HZ} stroke="#A78BFA" strokeWidth={2.5} style={{ animation: `vx-floor 4s cubic-bezier(0.55, 0, 1, 0.45) ${-k * (lite ? 1 : 0.5)}s infinite` }} />
        ))}
        {data.beams.map((b, i) => (
          <line
            key={`fb${i}`}
            x1={b.x0}
            y1={HZ}
            x2={b.xb}
            y2={H}
            pathLength={1000}
            stroke="#F0ABFC"
            strokeWidth={5}
            strokeDasharray="140 1000"
            filter="url(#vxArGlow)"
            style={{ strokeDashoffset: 140, animation: `vx-arbeam ${b.dur}s ${b.delay}s ease-in infinite` }}
          />
        ))}
      </g>
      <line x1="0" y1={HZ} x2={W} y2={HZ} stroke="#F0ABFC" strokeWidth={4} filter={lite ? undefined : "url(#vxArGlow)"} />

      <g shapeRendering="crispEdges">
        {duels.map((d) => (
          <g key={`d${d.x}`}>
            <g style={{ animation: `vx-hit 2.4s ${d.delay}s steps(1) infinite` }}>
              <Sprite rows={ENEMY} pal={ENEMY_P} x={d.x - 33} y={100 + d.yo} />
            </g>
            <g style={{ opacity: 0, transformBox: "fill-box", transformOrigin: "center", animation: `vx-boom 2.4s ${d.delay}s infinite` }}>
              <Sprite rows={BOOM} pal={BOOM_P} x={d.x - 27} y={97 + d.yo} />
            </g>
            <rect x={d.x - 2} y={446 + d.yo} width={4} height={24} fill="#F0ABFC" style={{ opacity: 0, animation: `vx-laser 2.4s ${d.delay}s linear infinite` }} />
            <g style={{ animation: `vx-bob 1.6s ${d.delay}s ease-in-out infinite` }}>
              <Sprite rows={SHIP} pal={SHIP_P} x={d.x - 33} y={470 + d.yo} flicker="P" />
            </g>
          </g>
        ))}

        <g style={{ animation: "vx-drift 6s steps(12) infinite" }}>
          {data.drops.map((e) => (
            <g key={`f${e.x}`}>
              <Sprite rows={ENEMY} pal={ENEMY_P} x={e.x} y={190} />
              {e.on && <rect x={e.x + 31} y={236} width={4} height={16} fill="#F472B6" style={{ opacity: 0, animation: `vx-drop 1.8s ${e.delay}s linear infinite` }} />}
            </g>
          ))}
        </g>

        {!lite && <g style={{ animation: "vx-ufo 14s linear infinite" }}>
          <Sprite rows={UFO} pal={UFO_P} x={0} y={40} />
        </g>}

        {divers.map((d) => (
          <g key={`dv${d.x}`} style={{ opacity: 0, animation: `vx-dive ${d.dur}s ${d.delay}s linear infinite` }}>
            <Sprite rows={ENEMY} pal={ENEMY_P} x={d.x - 22} y={-60} sc={4} />
            <rect x={d.x - 2} y={-20} width={4} height={14} fill="#F472B6" style={{ animation: "vx-flick .5s steps(2) infinite" }} />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function AnimatedBackground() {
  const pathname = usePathname() || "";
  const arcade = pathname.startsWith("/play");
  // Ligero por defecto (también en el HTML del servidor); en ordenador se
  // activa la versión completa en cuanto carga la página.
  const [lite, setLite] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px), (pointer: coarse)");
    const update = () => setLite(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  // Pausa las animaciones cuando la pestaña no se ve (ahorra batería).
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return (
    <div aria-hidden="true" className={`vx-bg${hidden ? " vx-paused" : ""}`}>
      {arcade ? <ArcadeScene lite={lite} /> : <GridScene lite={lite} />}
    </div>
  );
}

