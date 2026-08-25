"use client";

import { useState, useTransition } from "react";
import { updateSetting } from "@/app/admin/actions";

export function SettingForm({ settingKey, label, initialValue, multiline }: { settingKey: string; label: string; initialValue: string; multiline?: boolean }) {
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await updateSetting(settingKey, value);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label>{label}</label>
      {multiline ? (
        <textarea rows={5} value={value} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar"}
        </button>
        {saved && <span style={{ color: "var(--up)", fontSize: 12, fontFamily: "var(--font-mono)" }}>Guardado ✓</span>}
      </div>
    </form>
  );
}
