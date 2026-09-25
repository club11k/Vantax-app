import { prisma } from "@/lib/prisma";
import { VantageClientsTable } from "@/components/admin/VantageClientsTable";

export default async function AdminVantageClientsPage() {
  const accounts = await prisma.vantageIbAccount.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const rows = accounts.map((a) => {
    const activeLast30Days = a.lastTradeTime ? now - a.lastTradeTime.getTime() <= THIRTY_DAYS_MS : true;
    // "Activa" para el bloqueo de acceso: igual que src/lib/vantage-block.ts
    // (linked + operativa reciente, o forzada a mano).
    const effectiveActive =
      a.manualActiveOverride !== null ? a.manualActiveOverride : a.ibStatus === "LINKED" && activeLast30Days;
    return {
      id: a.id,
      userEmail: a.user.email,
      userName: a.user.name,
      accountNumber: a.accountNumber,
      accountType: a.accountType,
      platform: a.platform,
      lastCommission: a.lastCommission,
      vCoinEarned: a.vCoinEarned,
      lastTradeTime: a.lastTradeTime ? a.lastTradeTime.toISOString() : null,
      activeLast30Days: a.lastTradeTime ? now - a.lastTradeTime.getTime() <= THIRTY_DAYS_MS : false,
      ibStatus: a.ibStatus as "LINKED" | "UNLINKED",
      lastAllocationAt: a.lastAllocationAt ? a.lastAllocationAt.toISOString() : null,
      lastSyncedAt: a.lastSyncedAt ? a.lastSyncedAt.toISOString() : null,
      manualActiveOverride: a.manualActiveOverride,
      effectiveActive,
    };
  });

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Clientes de Vantage ({rows.length})</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6 }}>
        "V-COIN (lotaje MT5)" y "Última operación" salen directo de MT5 (vía el orquestador propio de la VPS), no de
        la comisión de Vantage — ver /completar-mt5, ahora obligatorio para todo el mundo. "Estado IB" sale del
        historial de entradas/salidas de Vantage (Allocation Data API): si la cuenta se desvincula de tu IB, se marca
        "Desvinculado" en el próximo sync (eso sí sigue viniendo de Vantage, es lo único que solo ella sabe).
      </p>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
        <strong>Bloqueo de acceso:</strong> un usuario pierde el acceso a toda la app en cuanto NINGUNA de sus
        cuentas de Vantage está "Activa" en la columna de abajo (desvinculada del IB, o vinculada pero sin operar en
        30 días). La columna "Acceso" te deja forzarlo a mano por cuenta sin esperar al próximo sync.
      </p>
      <VantageClientsTable rows={rows} />
    </div>
  );
}

