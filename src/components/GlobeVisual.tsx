// Visual del globo terráqueo de la landing, hecho enteramente en SVG (sin
// depender de ninguna imagen externa que se pueda romper o tardar en
// cargar). Marca las 4 ciudades de las sesiones de mercado que se ven en
// vivo en /mercado.
const CITIES = [
  { name: "Sydney", x: 335, y: 255 },
  { name: "Tokio", x: 300, y: 150 },
  { name: "Londres", x: 185, y: 105 },
  { name: "Nueva York", x: 95, y: 145 },
];

export function GlobeVisual() {
  return (
    <svg viewBox="0 0 400 320" width="100%" height="100%" role="img" aria-label="Sesiones de mercado en el mundo">
      <defs>
        <radialGradient id="globeGlow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--violet-dim)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="160" r="150" fill="url(#globeGlow)" />
      <circle cx="200" cy="160" r="110" fill="none" stroke="var(--line-bright)" strokeWidth="1" />
      <ellipse cx="200" cy="160" rx="110" ry="38" fill="none" stroke="var(--line)" strokeWidth="1" />
      <ellipse cx="200" cy="160" rx="110" ry="80" fill="none" stroke="var(--line)" strokeWidth="1" />
      <ellipse cx="200" cy="160" rx="38" ry="110" fill="none" stroke="var(--line)" strokeWidth="1" />
      <ellipse cx="200" cy="160" rx="80" ry="110" fill="none" stroke="var(--line)" strokeWidth="1" />
      <line x1="90" y1="160" x2="310" y2="160" stroke="var(--line)" strokeWidth="1" />
      <line x1="200" y1="50" x2="200" y2="270" stroke="var(--line)" strokeWidth="1" />
      {CITIES.map((c) => (
        <g key={c.name}>
          <circle cx={c.x} cy={c.y} r="9" fill="var(--gold-bright)" opacity="0.16">
            <animate attributeName="r" values="6;14;6" dur="2.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.3;0;0.3" dur="2.6s" repeatCount="indefinite" />
          </circle>
          <circle cx={c.x} cy={c.y} r="3.5" fill="var(--gold-bright)" />
          <text
            x={c.x}
            y={c.y - 14}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="10"
            letterSpacing="0.04em"
            fill="var(--text-muted)"
          >
            {c.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
