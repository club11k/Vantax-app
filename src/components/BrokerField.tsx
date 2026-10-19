"use client";

import { useState } from "react";

// Selector de bróker al añadir una cuenta MT5 (19/10/2026): los dos brokers
// con IB (Vantage y VT Markets) salen en la lista para que se escriban
// siempre igual — así la cuenta se enlaza sola con el IB correspondiente.
// "Otro" deja escribir cualquier otro bróker a mano.
const KNOWN = ["Vantage", "VT Markets"];
const OTHER = "__otro__";

export function BrokerField({
  value,
  onChange,
  disabled,
  className,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const known = KNOWN.find((k) => k.toLowerCase() === value.trim().toLowerCase());
  const [manual, setManual] = useState(!known && value.trim() !== "");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <select
        className={className}
        style={style}
        value={manual ? OTHER : known ?? ""}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setManual(true);
            onChange("");
          } else {
            setManual(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="" disabled>
          Elige tu bróker…
        </option>
        {KNOWN.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
        <option value={OTHER}>Otro bróker…</option>
      </select>
      {manual && (
        <input
          className={className}
          style={style}
          type="text"
          placeholder="Nombre del bróker"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
    </div>
  );
}
