import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { userHasMt5Account } from "@/lib/mt5-gate";
import { CompletarMt5Form } from "@/components/CompletarMt5Form";

export default async function CompletarMt5Page() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = (session.user as any).id as string;
  if (await userHasMt5Account(userId)) redirect("/dashboard");

  return (
    <div className="container" style={{ paddingTop: 40, maxWidth: 640 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.14em",
          color: "var(--gold-bright)",
          textTransform: "uppercase",
        }}
      >
        VANTAX · Último paso
      </div>
      <h1 style={{ fontSize: 24, margin: "4px 0 16px" }}>Vincula tu cuenta de MT5</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginBottom: 20, lineHeight: 1.5 }}>
        Antes de entrar, necesitamos los datos de tu cuenta de trading en MT5, en modo solo lectura (con tu
        contraseña de inversor, nunca la de operar). Con esto, todo lo que veas en Vantax — actividad, lotaje,
        V-COIN — sale directo de tu cuenta real, sin depender de otras fuentes. Se guarda cifrada y nunca se usa para
        operar por ti.
      </p>
      <CompletarMt5Form />
    </div>
  );
}

