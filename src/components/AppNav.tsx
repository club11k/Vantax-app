import Link from "next/link";

// Barra de navegación común a toda la app: se usa en el dashboard, Centro de
// Mercado, Journaly, Calculadora de riesgo, V-COIN y el panel de admin, para
// que desde cualquier pantalla se pueda ir directamente a cualquier otra sin
// tener que volver antes al panel principal.
//
// No incluye su propio <div className="btn-row">: cada página lo envuelve
// ella misma, así puede añadir botones extra (ej. "Gestionar suscripción")
// dentro de la misma fila.

const NAV_ITEMS = [
  { href: "/dashboard", label: "Mi panel", key: "dashboard" },
  { href: "/mercado", label: "Centro de mercado", key: "mercado" },
  { href: "/journal", label: "Journaly", key: "journal" },
  { href: "/riesgo", label: "Calculadora de riesgo", key: "riesgo" },
  { href: "/vcoin", label: "V-COIN", key: "vcoin" },
  { href: "/play", label: "Vantax Play", key: "play" },
] as const;

export function AppNav({ isAdmin, active }: { isAdmin?: boolean; active?: string }) {
  return (
    <>
      {isAdmin && (
        <Link href="/admin" className="btn" style={active === "admin" ? { borderColor: "var(--gold-bright)" } : undefined}>
          Panel de admin
        </Link>
      )}
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className="btn"
          style={active === item.key ? { borderColor: "var(--violet)" } : undefined}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}

