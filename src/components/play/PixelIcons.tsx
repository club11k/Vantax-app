// Iconos pixel art de Vantax Play (rediseño 06/10/2026). Cada icono es una
// cuadrícula de letras: cada letra es un color, el punto es transparente.

type Pal = Record<string, string>;

function Pixel({ rows, pal, size, className, label }: { rows: string[]; pal: Pal; size: number; className?: string; label?: string }) {
  const w = rows[0].length;
  const h = rows.length;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={Math.round((size * h) / w)}
      shapeRendering="crispEdges"
      className={className}
      style={{ flex: "0 0 auto" }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) => (pal[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={pal[ch]} /> : null))
      )}
    </svg>
  );
}

const COIN = ["..YYYY..", ".YWYYYD.", "YWYDDYYD", "YYYDYYYD", "YYYDYYYD", "YYYDDYYD", ".YYYYYD.", "..DDDD.."];
const TROPHY = ["Y.YYYY.Y", "YYYYYYYY", ".YWYYYY.", "..YYYY..", "...YY...", "...YY...", "..DDDD..", ".DDDDDD."];
const SHIELD = ["PPPPPPPP", "PLLLLLLP", "PLWLLLLP", "PLLLLLLP", ".PLLLLP.", ".PLLLLP.", "..PLLP..", "...PP..."];
const MONITOR = ["AAAAAAAA", "ABBBBBBA", "ABBBBGBA", "ABGBGBBA", "ABBGBBBA", "AAAAAAAA", "...AA...", "..AAAA.."];
const LOCK = ["..AAA..", ".A...A.", ".A...A.", "YYYYYYY", "YYYDYYY", "YYYDYYY", "YYYYYYY"];
const CROWN = ["Y..Y..Y", "YY.Y.YY", "YYYYYYY", "YRYYYRY", "YYYYYYY"];

export const CoinIcon = ({ size = 28, className }: { size?: number; className?: string }) => (
  <Pixel rows={COIN} pal={{ Y: "#FACC15", W: "#FEF9C3", D: "#CA8A04" }} size={size} className={className} />
);
export const TrophyIcon = ({ size = 28 }: { size?: number }) => <Pixel rows={TROPHY} pal={{ Y: "#FACC15", W: "#FEF9C3", D: "#A16207" }} size={size} />;
export const ShieldIcon = ({ size = 28 }: { size?: number }) => <Pixel rows={SHIELD} pal={{ P: "#FDBA74", L: "#F97316", W: "#FED7AA" }} size={size} />;
export const MonitorIcon = ({ size = 28 }: { size?: number }) => <Pixel rows={MONITOR} pal={{ A: "#C4B5FD", B: "#1B1530", G: "#A78BFA" }} size={size} />;
export const LockIcon = ({ size = 14 }: { size?: number }) => <Pixel rows={LOCK} pal={{ A: "#A39DB3", Y: "#FACC15", D: "#854D0E" }} size={size} />;
export const CrownIcon = ({ size = 28, className }: { size?: number; className?: string }) => (
  <Pixel rows={CROWN} pal={{ Y: "#FACC15", R: "#F472B6" }} size={size} className={className} />
);
