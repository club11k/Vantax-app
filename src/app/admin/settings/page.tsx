import { prisma } from "@/lib/prisma";
import { SettingForm } from "@/components/admin/SettingForm";
import { AccessGateToggle } from "@/components/admin/AccessGateToggle";
import { VantageSyncPanel } from "@/components/admin/VantageSyncPanel";

function extractValue(setting: { value: unknown } | null, fallback: string): string {
  if (!setting) return fallback;
  const v = setting.value as any;
  if (v && typeof v === "object" && "value" in v) return String(v.value);
  return fallback;
}

export default async function AdminSettingsPage() {
  const keys = [
    "analysis.system_prompt",
    "analysis.refresh_cron",
    "branding.support_email",
    "access.public_signup_locked",
    "vcoin.commission_percent",
    "play.vcoin_rate_per_lot",
    "play.cent_factor",
  ];
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

      <div className="panel" style={{ fontSize: 13, color: "var(--text-muted)" }}>
        <strong>V-COIN — cuentas de Vantage (IB)</strong>
        <p style={{ margin: "6px 0 0" }}>
          RETIRADO: el V-COIN de estas cuentas se calculaba antes a partir de la comisión que reportaba la API de
          Vantage, por porcentaje (el campo de abajo). Desde que MT5 es obligatorio para todo el mundo, se sustituyó
          del todo por lotaje real leído directo de MT5 (más preciso, y no depende de que Vantage tenga la comisión
          al día) — ver la configuración de tramos de V-COIN por lotaje más abajo, que es la que manda ahora para
          todas las cuentas. El campo de abajo ya no tiene ningún efecto; se deja visible por si hiciera falta
          consultarlo, no hace falta tocarlo.
        </p>
      </div>
      <SettingForm
        settingKey="vcoin.commission_percent"
        label="(Retirado) Porcentaje de la comisión nueva que se reparte como V-COIN"
        initialValue={extractValue(byKey.get("vcoin.commission_percent") ?? null, "50")}
      />
      <VantageSyncPanel />

      <div className="panel" style={{ fontSize: 13, color: "var(--text-muted)" }}>
        <strong>V-COIN — cuentas MT5 propias (otros brokers)</strong>
        <p style={{ margin: "6px 0 0" }}>
          Para cuentas que no son de Vantage, el V-COIN se calcula por lotaje de XAUUSD operado (a diferencia de
          Vantage, que se calcula por comisión). "V-COIN por lote" es la tasa para cuentas normales; en cuentas Cent
          se multiplica por el factor de abajo (ej. 0,01 = 1 lote en Cent equivale a 0,01 lote normal). El lotaje se
          sincroniza solo cada ciclo desde el orquestador MT5 propio en la VPS — no hace falta lanzarlo a mano.
        </p>
      </div>
      <SettingForm
        settingKey="play.vcoin_rate_per_lot"
        label="V-COIN por lote de XAUUSD (cuenta normal)"
        initialValue={extractValue(byKey.get("play.vcoin_rate_per_lot") ?? null, "10")}
      />
      <SettingForm
        settingKey="play.cent_factor"
        label="Factor de conversión para cuentas Cent"
        initialValue={extractValue(byKey.get("play.cent_factor") ?? null, "0.01")}
      />
    </div>
  );
}


