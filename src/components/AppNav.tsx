"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Barra de navegación común a toda la app: se usa en el dashboard, Centro de
// Mercado, Journaly, Calculadora de riesgo y el panel de admin, para que
// desde cualquier pantalla se pueda ir directamente a cualquier otra sin
// tener que volver antes al panel principal.
//
// V-COIN ya no tiene pantalla propia — vive dentro de Vantax Play (pestaña
// V-COIN de ahí), junto con la vinculación de cuenta MT5/Vantage, para no
// tener el mismo dato repartido en varios sitios.
//
// Rediseño visual (pedido por Esther, 06/10/2026 — "que todos los botones
// esten en el desplegable"): antes esto era una fila de botones sueltos
// (uno por página + el de admin), que en el panel de admin se sumaba
// ADEMÁS a una segunda fila fija de 9 enlaces propios, y en el dashboard a
// un botón más ("Gestionar suscripción") al lado. Ahora todo eso —
// exactamente los mismos destinos, ni uno más ni uno menos— vive dentro de
// un único menú desplegable: los enlaces de admin.layout.tsx ya no están en
// una <nav> aparte (se pasan aquí como `adminExtra`) y el botón de
// suscripción del dashboard se pasa como `children` para que también caiga
// dentro del mismo desplegable. No se ha añadido ningún destino nuevo.
//
// No incluye su propio <div className="btn-row">: cada página lo envuelve
// ella misma (se mantiene por compatibilidad con el resto del layout).

const NAV_ITEMS = [
  { href: "/dashboard", label: "Análisis", key: "dashboard", icon: "📊", desc: "informes IA del oro" },
  { href: "/mercado", label: "Centro de mercado", key: "mercado", icon: "📈", desc: "bias score, sesiones" },
  { href: "/noticias", label: "Noticias y calendario", key: "noticias", icon: "📰", desc: "titulares del oro, agenda macro" },
  { href: "/journal", label: "Journaly", key: "journal", icon: "📓", desc: "diario de operativa" },
  { href: "/riesgo", label: "Calculadora de riesgo", key: "riesgo", icon: "🧮", desc: "tamaño de posición" },
  { href: "/play", label: "Vantax Play", key: "play", icon: "🎮", desc: "V-COIN, cofres, ranking" },
  { href: "/formacion", label: "Formación", key: "formacion", icon: "🎓", desc: "cursos por módulos" },
] as const;

// Mismos 9 enlaces que antes vivían en la segunda fila fija del panel de
// admin (admin/layout.tsx) — solo se muestran ahí, dentro de este mismo
// desplegable, en la sección "Admin".
export const ADMIN_SUB_ITEMS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/vantage-clients", label: "Clientes Vantage" },
  { href: "/admin/vantage-inactivity", label: "Avisos de inactividad" },
  { href: "/admin/players", label: "Jugadores (Play)" },
  { href: "/admin/play-config", label: "Vantax Play · Config" },
  { href: "/admin/play-inventory", label: "Inventario de cofres" },
  { href: "/admin/formacion", label: "Formación" },
  { href: "/admin/plans", label: "Planes" },
  { href: "/admin/settings", label: "Configuración" },
] as const;

export function AppNav({
  isAdmin,
  active,
  showAdminLinks = false,
  children,
}: {
  isAdmin?: boolean;
  active?: string;
  // Solo el panel de admin pasa esto a true, para no duplicar los 9
  // enlaces de administración en el resto de páginas.
  showAdminLinks?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="nav-cluster">
      {isAdmin && <AdminBell />}
    <div className="menu-wrap" ref={wrapRef}>
      <button type="button" className="menu-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Menú
        <svg className="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className={`menu-dropdown${open ? " open" : ""}`} role="menu">
        <div className="menu-section-label">Navegación</div>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`menu-item${active === item.key ? " active" : ""}`}
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <div className="ico">{item.icon}</div>
            <div>
              <div className="label">{item.label}</div>
              <div className="desc">{item.desc}</div>
            </div>
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="menu-sep" />
            <div className="menu-section-label">Admin</div>
            <Link
              href="/admin"
              className={`menu-item${active === "admin" ? " active" : ""}`}
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <div className="ico">⚙️</div>
              <div>
                <div className="label">Panel de admin</div>
                <div className="desc">gestión general</div>
              </div>
            </Link>
            {showAdminLinks &&
              ADMIN_SUB_ITEMS.map((item) => (
                <Link key={item.href} href={item.href} className="menu-item menu-item-sub" role="menuitem" onClick={() => setOpen(false)}>
                  <div className="label">{item.label}</div>
                </Link>
              ))}
          </>
        )}

        {children && (
          <>
            <div className="menu-sep" />
            <div className="menu-section-label">Tu cuenta</div>
            <div className="menu-item-slot" onClick={() => setOpen(false)}>
              {children}
            </div>
          </>
        )}
      </div>
    </div>
    </div>
  );
}


// Campanita de avisos del admin (07/10/2026): al lado del Menú, con el número
// de cosas pendientes de atender (pagos, pedidos, usuarios nuevos). Se
// actualiza sola cada minuto y al volver a la pestaña.
type BellItem = { key: string; icon: string; label: string; count: number; href: string };

function AdminBell() {
  const [data, setData] = useState<{ total: number; items: BellItem[] } | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (alive) setData(json);
      } catch {
        /* sin red: se reintenta en el siguiente ciclo */
      }
    }
    load();
    const t = setInterval(load, 60_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("admin-notifications-refresh", load);
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("admin-notifications-refresh", load);
      document.removeEventListener("mousedown", onDocClick);
    };
  }, []);

  const total = data?.total ?? 0;

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className={`bell-btn${total > 0 ? " has-alerts" : ""}`}
        aria-expanded={open}
        aria-label={total > 0 ? `${total} avisos pendientes` : "Sin avisos pendientes"}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {total > 0 && <span className="bell-badge">{total > 99 ? "99+" : total}</span>}
      </button>
      <div className={`menu-dropdown${open ? " open" : ""}`} role="menu">
        <div className="menu-section-label">Avisos pendientes</div>
        {data && data.items.length > 0 ? (
          data.items.map((item) => (
            <Link key={item.key} href={item.href} className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <div className="ico">{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div className="label">{item.label}</div>
              </div>
              <span className="bell-count">{item.count}</span>
            </Link>
          ))
        ) : (
          <div style={{ padding: "10px 12px 14px", fontSize: 13, color: "var(--text-dim)" }}>
            {data ? "Todo al día. No hay nada pendiente. ✅" : "Cargando…"}
          </div>
        )}
      </div>
    </div>
  );
}
