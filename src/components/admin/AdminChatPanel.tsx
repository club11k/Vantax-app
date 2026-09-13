"use client";

import { useState } from "react";

type ChatContentBlock = Record<string, any>;
type Source = { url: string; title: string };

type DisplayMessage = {
  role: "user" | "assistant";
  content: string | ChatContentBlock[]; // lo que se manda de vuelta a la API tal cual
  text: string; // lo que se muestra en pantalla
  sources?: Source[];
  searched?: boolean;
};

function extractText(content: ChatContentBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text as string)
    .join("\n");
}

function extractSources(content: ChatContentBlock[]): Source[] {
  const seen = new Map<string, string>();
  for (const block of content) {
    if (block.type !== "text" || !Array.isArray(block.citations)) continue;
    for (const c of block.citations) {
      if (c?.type === "web_search_result_location" && c.url && !seen.has(c.url)) {
        seen.set(c.url, c.title || c.url);
      }
    }
  }
  return Array.from(seen.entries()).map(([url, title]) => ({ url, title }));
}

export function AdminChatPanel() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");

    const userMessage: DisplayMessage = { role: "user", content: text, text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Se manda el historial completo con el content tal cual se guardó
        // (los bloques de la IA sin tocar) — necesario para que las
        // citations de búsqueda web sigan funcionando en turnos siguientes.
        body: JSON.stringify({ messages: nextMessages.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo obtener respuesta.");
        return;
      }
      const content = data.content as ChatContentBlock[];
      const assistantMessage: DisplayMessage = {
        role: "assistant",
        content,
        text: extractText(content) || "(sin respuesta de texto)",
        sources: extractSources(content),
        searched: content.some((b) => b.type === "server_tool_use" && b.name === "web_search"),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setError("No se pudo conectar con el servidor. Prueba de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setMessages([]);
    setError(null);
    setInput("");
  }

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="panel-title">Chat con búsqueda web</div>
          <div className="panel-sub" style={{ textTransform: "none", letterSpacing: 0 }}>
            A diferencia del generador de análisis (que solo usa el snapshot de datos que se refresca por cron),
            este chat busca en internet en tiempo real. Úsalo para preguntar por noticias de última hora del oro,
            o para probar y ajustar el prompt del sistema antes de pegarlo en Configuración.
          </div>
        </div>
        {messages.length > 0 && (
          <button className="btn" onClick={handleReset} disabled={loading}>
            Nueva conversación
          </button>
        )}
      </div>

      {messages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 520, overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: m.role === "user" ? "var(--violet-bright)" : "var(--gold-bright)",
                }}
              >
                {m.role === "user" ? "Tú" : m.searched ? "IA · buscó en la web" : "IA"}
              </div>
              <div
                className={m.role === "assistant" ? "panel" : undefined}
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 13.5,
                  lineHeight: 1.55,
                  background: m.role === "assistant" ? "var(--bg-panel-raised)" : undefined,
                }}
              >
                {m.text}
              </div>
              {m.sources && m.sources.length > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--text-dim)", display: "flex", flexDirection: "column", gap: 2 }}>
                  <span>Fuentes:</span>
                  {m.sources.map((s) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-dim)" }}>
                      {s.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Pensando…</div>}
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <textarea
          placeholder="Ej: busca las últimas noticias que puedan mover el oro hoy"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          style={{ flex: 1, minWidth: 240, resize: "vertical" }}
          disabled={loading}
        />
        <button className="btn btn-primary" onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

