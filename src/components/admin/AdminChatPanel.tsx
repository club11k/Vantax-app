"use client";

import { useState } from "react";

type ChatContentBlock = Record<string, any>;
type Source = { url: string; title: string };
type SaveFormat = "MENSAJE" | "TECNICO";

type DisplayMessage = {
  role: "user" | "assistant";
  content: string | ChatContentBlock[]; // lo que se manda de vuelta a la API tal cual
  text: string; // lo que se muestra en pantalla
  sources?: Source[];
  searched?: boolean;
  imageLabels?: string[]; // solo para mostrar qué capturas se adjuntaron en ese turno
  savedAs?: SaveFormat | null;
  saving?: boolean;
  saveError?: string | null;
};

type Attachment = {
  id: string;
  label: string;
  file: File;
  preview: string;
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

function fileToBase64(file: File): Promise<{ mediaType: string; base64Data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(",");
      const mediaType = result.substring(5, result.indexOf(";")); // "image/png"
      const base64Data = result.substring(commaIdx + 1);
      resolve({ mediaType, base64Data });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let attachmentIdCounter = 0;

export function AdminChatPanel() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addAttachments(files: FileList | null) {
    if (!files) return;
    const newOnes: Attachment[] = Array.from(files)
      .slice(0, 6 - attachments.length)
      .map((file) => {
        attachmentIdCounter += 1;
        return { id: `att-${attachmentIdCounter}`, label: "", file, preview: URL.createObjectURL(file) };
      });
    setAttachments((prev) => [...prev, ...newOnes]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function updateAttachmentLabel(id: string, label: string) {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, label } : a)));
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || loading) return;
    setError(null);
    setInput("");
    const pendingAttachments = attachments;
    setAttachments([]);

    let userContent: string | ChatContentBlock[] = text;
    let imageLabels: string[] | undefined;

    if (pendingAttachments.length > 0) {
      const blocks: ChatContentBlock[] = [];
      if (text) blocks.push({ type: "text", text });
      blocks.push({
        type: "text",
        text:
          `Te adjunto ${pendingAttachments.length} captura(s) de gráfico, solo como contexto visual de ` +
          "estructura y tendencia — los precios y niveles que uses deben salir siempre de los datos numéricos, " +
          "nunca de una lectura del precio en la imagen.",
      });
      const converted = await Promise.all(
        pendingAttachments.map(async (a, i) => {
          const { mediaType, base64Data } = await fileToBase64(a.file);
          return { label: a.label.trim() || `Gráfico ${i + 1}`, mediaType, base64Data };
        })
      );
      for (const img of converted) {
        blocks.push({ type: "text", text: `Temporalidad/etiqueta: ${img.label}` });
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: img.mediaType, data: img.base64Data },
        });
      }
      userContent = blocks;
      imageLabels = converted.map((c) => c.label);
    }

    const userMessage: DisplayMessage = {
      role: "user",
      content: userContent,
      text: text || "(sin texto, solo capturas adjuntas)",
      imageLabels,
    };
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
        setLoading(false);
        return;
      }
      const content = data.content as ChatContentBlock[];
      const assistantMessage: DisplayMessage = {
        role: "assistant",
        content,
        text: extractText(content) || "(sin respuesta de texto)",
        sources: extractSources(content),
        searched: content.some((b) => b.type === "server_tool_use" && b.name === "web_search"),
        savedAs: null,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setError("No se pudo conectar con el servidor. Prueba de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAsAnalysis(index: number, format: SaveFormat) {
    const msg = messages[index];
    if (!msg || msg.role !== "assistant") return;

    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, saving: true, saveError: null } : m)));

    try {
      const res = await fetch("/api/admin/chat/save-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msg.text, format }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m, i) => (i === index ? { ...m, saving: false, saveError: data.error ?? "No se pudo guardar." } : m))
        );
        return;
      }
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, saving: false, savedAs: format } : m)));
    } catch {
      setMessages((prev) =>
        prev.map((m, i) => (i === index ? { ...m, saving: false, saveError: "No se pudo guardar. Prueba de nuevo." } : m))
      );
    }
  }

  function handleReset() {
    setMessages([]);
    setError(null);
    setInput("");
    setAttachments([]);
  }

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="panel-title">Análisis con IA (agente)</div>
          <div className="panel-sub" style={{ textTransform: "none", letterSpacing: 0 }}>
            Habla con la IA como si fuera tu analista: pídele el análisis completo de la situación actual, pídele
            que razone contigo el porqué y el cómo, adjunta capturas de gráfico, y pídele que busque en internet
            para contrastar con noticias recientes. Está anclado a los datos reales de mercado en cada turno — los
            precios y niveles nunca se los inventa. Cuando una respuesta te convenza, guárdala como análisis para
            que quede en tu Historial.
          </div>
        </div>
        {messages.length > 0 && (
          <button className="btn" onClick={handleReset} disabled={loading}>
            Nueva conversación
          </button>
        )}
      </div>

      {messages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 560, overflowY: "auto" }}>
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
              {m.imageLabels && m.imageLabels.length > 0 && (
                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  📎 {m.imageLabels.join(", ")}
                </div>
              )}
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
              {m.role === "assistant" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
                  {m.savedAs ? (
                    <span style={{ fontSize: 12, color: "var(--up)" }}>
                      Guardado en tu Historial como {m.savedAs === "MENSAJE" ? "Mensaje" : "Técnico"} ✓
                    </span>
                  ) : (
                    <>
                      <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Guardar como análisis:</span>
                      <button
                        className="btn"
                        style={{ padding: "3px 9px", fontSize: 11.5 }}
                        onClick={() => handleSaveAsAnalysis(i, "MENSAJE")}
                        disabled={m.saving}
                      >
                        {m.saving ? "Guardando…" : "Mensaje"}
                      </button>
                      <button
                        className="btn"
                        style={{ padding: "3px 9px", fontSize: 11.5 }}
                        onClick={() => handleSaveAsAnalysis(i, "TECNICO")}
                        disabled={m.saving}
                      >
                        {m.saving ? "Guardando…" : "Técnico"}
                      </button>
                    </>
                  )}
                  {m.saveError && <span className="error-msg" style={{ fontSize: 11.5 }}>{m.saveError}</span>}
                </div>
              )}
            </div>
          ))}
          {loading && <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Pensando…</div>}
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}

      {attachments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {attachments.map((a, i) => (
            <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <img src={a.preview} alt="" style={{ height: 28, borderRadius: 4, border: "1px solid var(--line)" }} />
              <input
                type="text"
                placeholder={`Etiqueta, ej: 4H (gráfico ${i + 1})`}
                value={a.label}
                onChange={(e) => updateAttachmentLabel(a.id, e.target.value)}
                style={{
                  fontSize: 12.5,
                  padding: "5px 8px",
                  background: "var(--bg-panel-raised)",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  color: "var(--text)",
                  minWidth: 160,
                }}
              />
              <button className="btn" style={{ padding: "3px 9px", fontSize: 11.5 }} onClick={() => removeAttachment(a.id)}>
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <textarea
          placeholder="Ej: hazme el análisis completo de hoy en formato mensaje, y explícame por qué lees así el mercado"
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
        <label className="btn" style={{ cursor: attachments.length >= 6 ? "not-allowed" : "pointer", opacity: attachments.length >= 6 ? 0.5 : 1 }}>
          📎 Adjuntar
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              addAttachments(e.target.files);
              e.target.value = "";
            }}
            disabled={attachments.length >= 6}
            style={{ display: "none" }}
          />
        </label>
        <button className="btn btn-primary" onClick={handleSend} disabled={loading || (!input.trim() && attachments.length === 0)}>
          {loading ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

