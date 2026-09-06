import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JournalDashboard } from "@/components/journal/JournalDashboard";

// Journaly no depende de marketAccess ni de subscriptionStatus/plan: es una
// herramienta de seguimiento personal disponible para cualquier usuario con
// sesión iniciada, sin importar qué acceso tenga a Análisis o al Centro de
// Mercado. Un usuario puede llevar varias cuentas de trading a la vez (ej.
// una principal y otra de una prop firm), así que aquí se traen todas sus
// cuentas junto con las entradas de cada una.
export default async function JournalPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  const userId = (session.user as any).id as string;

  const accounts = await prisma.journalAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  const entriesByAccount = await Promise.all(
    accounts.map((a) => prisma.journalEntry.findMany({ where: { accountId: a.id }, orderBy: { date: "asc" } }))
  );

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="header-row" style={{ marginBottom: 8 }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              color: "var(--violet)",
              textTransform: "uppercase",
            }}
          >
            VANTAX
          </div>
          <h1 style={{ fontSize: 26, margin: "4px 0 0" }}>Journaly</h1>
        </div>
        <div className="btn-row">
          <Link href="/dashboard" className="btn">
            Volver a mi panel
          </Link>
        </div>
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginBottom: 24, maxWidth: 640 }}>
        Tu diario de trading personal: lleva una o varias cuentas, registra el resultado de cada día a mano o
        subiendo una foto, y sigue el progreso de cada una desde su saldo inicial.
      </p>

      <JournalDashboard
        initialAccounts={accounts.map((account, i) => ({
          id: account.id,
          accountUid: account.accountUid,
          currency: account.currency as "EUR" | "USD" | "CENT",
          initialBalance: account.initialBalance,
          entries: entriesByAccount[i].map((e) => ({
            id: e.id,
            date: e.date.toISOString().slice(0, 10),
            resultAmount: e.resultAmount,
            source: e.source as "MANUAL" | "AI_PHOTO",
            imageNote: e.imageNote,
          })),
        }))}
      />
    </div>
  );
}

