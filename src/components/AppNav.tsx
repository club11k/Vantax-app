import Link from "next/link";

// Barra de navegación común a toda la app: se usa en el dashboard, Centro de
// Mercado, Journaly, Calculadora de riesgo y el panel de admin, para que
// desde cualquier pantalla se pueda ir directamente a cualquier otra sin
// tener que volver antes al panel principal.
//
// V-COIN ya no tiene pantalla propia — vive dentro de Vantax Play (pestaña
// V-COIN de ahí), junto con la vinculación de cuenta MT5/Vantage, para no
// tener el mismo dato repartido en varios sitios.
//
// No incluye su propio <div className="btn-row">: cada página lo envuelve
// ella misma, así puede añadir botones extra (ej. "Gestionar suscripción")
// dentro de la misma fila.

const NAV_ITEMS = [
  { href: "/dashboard", label: "Análisis", key: "dashboard" },
  { href: "/mercado", label: "Centro de mercado", key: "mercado" },
  { href: "/journal", label: "Journaly", key: "journal" },
  { href: "/riesgo", label: "Calculadora de riesgo", key: "riesgo" },
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


