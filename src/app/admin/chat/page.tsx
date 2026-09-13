import { AdminChatPanel } from "@/components/admin/AdminChatPanel";

export default function AdminChatPage() {
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Chat IA</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: -6, marginBottom: 16 }}>
        Este chat es independiente del generador de análisis de /dashboard — no consume cuota de ningún plan y no
        guarda nada en el historial de análisis de los usuarios. Es solo para ti, como herramienta de trabajo.
      </p>
      <AdminChatPanel />
    </div>
  );
}

