// Se ve al instante al pulsar "Noticias y calendario" en el menú, mientras
// llegan los titulares (28/10/2026).
export default function LoadingNoticias() {
  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--violet)", textTransform: "uppercase" }}>
        VANTAX
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 20px" }}>Noticias y calendario</h1>
      <div className="nw-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="nw-card" style={{ minHeight: 260, opacity: 0.5 }}>
            <div className="nw-img" style={{ height: 160, background: "var(--bg-panel-raised)" }} />
            <div className="nw-body">
              <span style={{ height: 14, width: "40%", background: "var(--bg-panel-raised)", borderRadius: 6 }} />
              <span style={{ height: 18, width: "90%", background: "var(--bg-panel-raised)", borderRadius: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
