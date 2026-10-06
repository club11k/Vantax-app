"use client";

import { useEffect, useState } from "react";
import styles from "@/components/play/arcade.module.css";
import { CrownIcon, LockIcon } from "@/components/play/PixelIcons";

// Pestaña "RANKING" — calcada del mockup original que envió Esther: 4
// ligas (una por tramo del Progreso del Trader) con los jugadores de esa
// liga ordenados por V-COIN ganado este mes. A diferencia del mockup
// (donde las ligas eran por saldo de cuenta), aquí cada liga es tu tramo
// actual — mismo dato que ya usan la barra de progreso y los cofres, para
// no tener que mantener dos sistemas de tramos distintos.

type LeaguePlayer = { publicId: string; vcoin: number; isMe: boolean };
type League = { tier: string; tierLabel: string; leagueLabel: string; players: LeaguePlayer[] };

export function RankingBoard() {
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Liga que se está viendo: por defecto la del propio jugador (rediseño
  // 06/10/2026 — antes se veían las 4 ligas apiladas, casi siempre vacías).
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/play/ranking")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.leagues) setLeagues(data.leagues);
        else setError(data.error ?? "No se pudo cargar el ranking.");
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar el ranking.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h3 className={styles.sectionTitle}>RANKING MENSUAL POR LIGAS · V-COIN GANADOS</h3>
      <p style={{ fontSize: 15, color: "var(--textDim)", marginTop: -6, marginBottom: 16 }}>
        Cada liga es tu tramo actual dentro de Progreso del Trader. Se reinicia cada mes. Los 5 primeros de cada liga
        (🏆) optan al cofre de premio.
      </p>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {!leagues && !error && (
        <div className={styles.card}>
          <p style={{ color: "var(--textDim)" }}>Cargando…</p>
        </div>
      )}

      {leagues && leagues.length > 0 && (() => {
        const mine = leagues.find((l) => l.players.some((p) => p.isMe));
        const current = leagues.find((l) => l.tier === selected) ?? mine ?? leagues[0];
        const top = current.players.slice(0, 3);
        // Orden visual del podio: 2.º, 1.º, 3.º
        const podium = [
          { place: 2, player: top[1], height: 90, color: "#CBD5E1", bg: "#241C3B", border: "#4A4160" },
          { place: 1, player: top[0], height: 130, color: "#FACC15", bg: "#3B2A78", border: "#A78BFA" },
          { place: 3, player: top[2], height: 64, color: "#FDBA74", bg: "#241C3B", border: "#4A4160" },
        ];
        return (
          <div className={styles.card}>
            <div className={styles.leagueTabs} role="tablist" aria-label="Ligas">
              {leagues.map((l) => (
                <button
                  key={l.tier}
                  type="button"
                  role="tab"
                  aria-selected={l.tier === current.tier}
                  className={`${styles.leagueBtn} ${l.tier === current.tier ? styles.active : ""}`}
                  onClick={() => setSelected(l.tier)}
                >
                  <b>{l.leagueLabel}</b>
                  <span>
                    {l === mine ? "Tu liga" : `${l.players.length} jugador${l.players.length === 1 ? "" : "es"}`}
                  </span>
                </button>
              ))}
            </div>

            {current.players.length === 0 ? (
              <div className={styles.emptyLeague}>
                <LockIcon size={28} />
                <span className={styles.pixel} style={{ fontSize: 16, color: "#C4B5FD" }}>
                  Liga vacía
                </span>
                <span style={{ fontSize: 13, color: "var(--textDim)" }}>
                  Todavía no hay jugadores en esta liga. ¡Sube de tramo y estrénala!
                </span>
              </div>
            ) : (
              <>
                <div className={styles.podium}>
                  {podium.map((p) => (
                    <div key={p.place} className={styles.podiumCol}>
                      {p.place === 1 && p.player && <CrownIcon className={styles.crown} />}
                      {p.player ? (
                        <span className={styles.podiumName}>{p.player.publicId}</span>
                      ) : (
                        <span className={styles.podiumEmpty}>¿Tú?</span>
                      )}
                      <div
                        className={styles.podiumBlock}
                        style={{ height: p.height, background: p.bg, border: `2px solid ${p.border}`, color: p.color, fontSize: p.place === 1 ? 34 : 26 }}
                      >
                        {p.place}
                      </div>
                    </div>
                  ))}
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Jugador</th>
                      <th style={{ textAlign: "right" }}>V-COIN este mes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.players.map((p, i) => (
                      <tr key={p.publicId} className={p.isMe ? styles.me : ""}>
                        <td className={styles.pos}>
                          {i < 5 ? "🏆 " : ""}
                          {i + 1}
                        </td>
                        <td>
                          {p.publicId}
                          {p.isMe && <span className={styles.meTag}>TÚ</span>}
                        </td>
                        <td style={{ textAlign: "right" }}>{p.vcoin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        );
      })()}
    </>
  );
}
