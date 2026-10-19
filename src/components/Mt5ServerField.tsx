"use client";

import { useEffect } from "react";

// Lista real de servidores MT5 de Vantage (pasada a mano por Esther desde la
// app de MT5 -> "Servidor" al dar de alta una cuenta nueva -- no es una
// lista inventada). Si Vantage añade un servidor nuevo que no está aquí,
// la opción "Otro" de abajo sigue permitiendo escribirlo a mano sin
// bloquear a nadie.
//
// Ojo: NINGUNO de estos lleva sufijo "- Hedge" ni "- Netting" -- eso que se
// ve en el título de la ventana de MT5 es el tipo de contabilidad de la
// cuenta, no parte del nombre del servidor (confirmado con esta lista
// oficial, después de una sesión entera de depuración en la que se llegó a
// sospechar lo contrario).
export const VANTAGE_MT5_SERVERS = [
  "VantageMarkets-Live",
  "VantageMarkets-Live 2",
  "VantageMarkets-Live 3",
  "VantageMarkets-Live 4",
  "VantageMarkets-Live 5",
  "VantageMarkets-Live 6",
  "VantageMarkets-Live 7",
  "VantageMarkets-Live 8",
  "VantageMarkets-Live 9",
  "VantageMarkets-Live 10",
  "VantageMarkets-Live 11",
  "VantageMarkets-Live 12",
  "VantageMarkets-Live 13",
  "VantageMarkets-Live 14",
  "VantageMarkets-Live 15",
  "VantageMarkets-Live 17",
  "VantageMarkets-Live 19",
  "VantageMarkets-Live 21",
];

// Servidores reales de VT Markets (captura de MT5 que pasó Esther el
// 19/10/2026; sin el de Demo, que no cuenta para nada en Vantax).
export const VTMARKETS_MT5_SERVERS = [
  "VTMarkets-Live",
  "VTMarkets-Live 2",
  "VTMarkets-Live 3",
  "VTMarkets-Live 5",
  "VTMarkets-Live 6",
  "VTMarkets-Live 7",
  "VTMarkets-Live 8",
  "VTMarkets-Live 9",
];

// Lista cerrada de servidores para los brokers con IB; null = texto libre.
export function serverListForBroker(brokerName: string): string[] | null {
  const n = brokerName.trim().toLowerCase().replace(/[\s._-]+/g, "");
  if (n === "vantage" || n === "vantagemarkets") return VANTAGE_MT5_SERVERS;
  if (n === "vtmarkets" || n === "vtmarket" || n === "vt") return VTMARKETS_MT5_SERVERS;
  return null;
}

type Props = {
  brokerName: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  // Estilo del <select>/<input>: pasa lo mismo que ya usa cada formulario
  // (className para los que usan CSS modules, style para los que usan
  // objetos inline) para que encaje visualmente sin tocar nada más.
  className?: string;
  style?: React.CSSProperties;
};

// Campo de "Servidor MT5": para Vantage y VT Markets es un desplegable con
// su lista real y nada más (19/10/2026: sin opción "Otro", para que nadie
// lo escriba mal). Para cualquier otro bróker, campo de texto libre.
export function Mt5ServerField({ brokerName, value, onChange, disabled, className, style }: Props) {
  const list = serverListForBroker(brokerName);

  // Si cambian de bróker y el servidor elegido no es de la lista nueva, se
  // vacía para obligar a elegir uno válido.
  useEffect(() => {
    if (list && value && !list.includes(value)) onChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerName]);

  if (list) {
    return (
      <select className={className} style={style} value={list.includes(value) ? value : ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Elige el servidor…
        </option>
        {list.map((srv) => (
          <option key={srv} value={srv}>
            {srv}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className={className}
      style={style}
      type="text"
      placeholder="Ej: ICMarketsSC-Live"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}
