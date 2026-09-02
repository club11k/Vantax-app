import { prisma } from "@/lib/prisma";
import { SettingForm } from "@/components/admin/SettingForm";
import { AccessGateToggle } from "@/components/admin/AccessGateToggle";

function extractValue(setting: { value: unknown } | null, fallback: string): string {
  if (!setting) return fallback;
  const v = setting.value as any;
  if (v && typeof v === "object" && "value" in v) return String(v.value);
  return fallback;
}

export default async function AdminSettingsPage() {
  const keys = ["analysis.system_prompt", "analysis.refresh_cron", "branding.support_email", "access.public_signup_locked"];
  const settings = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(settings.map((s) => [s.key, s]));

  // Por defecto (si nunca se tocó este ajuste) el candado está activado: no
  // se ofrece pago público hasta que un admin lo desactive explícitamente.
  const accessLockedValue = extractValue(byKey.get("access.public_signup_locked") ?? null, "true");
  const accessLocked = accessLockedValue !== "false";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="panel" style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Esta configuración se guarda en la base de datos y se usa en el momento de generar cada análisis
        (no hace falta redeployar para que un cambio tome efecto).
      </div>
      <AccessGateToggle settingKey="access.public_signup_locked" initialLocked={accessLocked} />
      <SettingForm
        settingKey="analysis.system_prompt"
        label="Prompt de sistema del motor de análisis"
        initialValue={extractValue(byKey.get("analysis.system_prompt") ?? null, "")}
        multiline
      />
      <SettingForm
        settingKey="analysis.refresh_cron"
        label="Cron de referencia para el refresco de datos (informativo)"
        initialValue={extractValue(byKey.get("analysis.refresh_cron") ?? null, "0 7 * * 1-5")}
      />
      <SettingForm
        settingKey="branding.support_email"
        label="Email de soporte mostrado a los usuarios"
        initialValue={extractValue(byKey.get("branding.support_email") ?? null, "")}
      />
    </div>
  );
}

