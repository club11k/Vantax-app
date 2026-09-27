"use client";

import { useEffect, useState } from "react";

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
  "VantageMarkets-Demo",
];

const OTHER = "__otro__";

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

// Campo de "Servidor MT5" reutilizable: si el broker es Vantage, muestra un
// desplegable con la lista real (evita el típico error de escribirlo a mano
// mal -- falta un espacio, mayúscula distinta -- que se queda colgado sin
// avisar). Para cualquier otro broker, o si el usuario elige "Otro", cae a
// un campo de texto libre como antes.
export function Mt5ServerField({ brokerName, value, onChange, disabled, className, style }: Props) {
  const isVantage = brokerName.trim().toLowerCase() === "vantage";
  const matchesKnown = VANTAGE_MT5_SERVERS.includes(value);
  const [manual, setManual] = useState(isVantage ? value !== "" && !matchesKnown : true);

  // Si cambian el broker a Vantage y el valor ya es uno conocido (por
  // ejemplo, al abrir "Editar" de una cuenta ya vinculada), usa el
  // desplegable directamente en vez del campo de texto.
  useEffect(() => {
    if (isVantage && matchesKnown) setManual(false);
    if (!isVantage) setManual(true);
  }, [isVantage, matchesKnown]);

  if (isVantage && !manual) {
    return (
      <select
        className={className}
        style={style}
        value={matchesKnown ? value : ""}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setManual(true);
            onChange("");
          } else {
            onChange(e.target.value);
          }
        }}
      >
        <option value="" disabled>
          Elige el servidor…
        </option>
        {VANTAGE_MT5_SERVERS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value={OTHER}>Otro / no está en la lista…</option>
      </select>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <input
        className={className}
        style={style}
        type="text"
        placeholder={isVantage ? "Ej: VantageMarkets-Live 14" : "Ej: ICMarketsSC-Demo"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {isVantage && (
        <button
          type="button"
          onClick={() => setManual(false)}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent, #7aa2ff)",
            cursor: "pointer",
            padding: 0,
            fontSize: 11,
            textAlign: "left",
            textDecoration: "underline",
          }}
        >
          ← volver a elegir de la lista
        </button>
      )}
    </div>
  );
}

