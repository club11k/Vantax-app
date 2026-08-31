export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--line)",
        marginTop: 60,
        padding: "24px 20px",
      }}
    >
      <div
        className="container"
        style={{
          padding: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)" }}>
          © {new Date().getFullYear()} Vantax Project LTD · Malta
        </div>
        <div style={{ display: "flex", gap: 18, fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
          <a href="/legal/politica-de-privacidad.pdf" target="_blank" rel="noreferrer" style={{ color: "var(--text-muted)" }}>
            Política de Privacidad
          </a>
          <a href="/legal/terminos-y-condiciones.pdf" target="_blank" rel="noreferrer" style={{ color: "var(--text-muted)" }}>
            Términos y Condiciones
          </a>
          <a href="mailto:vantaxproject@gmail.com" style={{ color: "var(--text-muted)" }}>
            vantaxproject@gmail.com
          </a>
        </div>
      </div>
    </footer>
  );
}
