"use client";

import dynamic from "next/dynamic";

// KLineChart necesita el navegador: se carga solo en el cliente.
const ProChart = dynamic(() => import("./ProChart").then((m) => m.ProChart), {
  ssr: false,
  loading: () => <div className="pc-wrap pc-loading">Cargando gráfico…</div>,
});

export function ProChartLoader({ isAdmin }: { isAdmin: boolean }) {
  return <ProChart isAdmin={isAdmin} />;
}
