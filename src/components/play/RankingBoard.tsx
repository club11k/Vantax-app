"use client";

import { useEffect, useState } from "react";
import styles from "@/components/play/arcade.module.css";

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

      {leagues &&
        leagues.map((league) => (
          <div key={league.tier} className={styles.card}>
            <h3 className={styles.sectionTitle} style={{ fontSize: 13 }}>
              LIGA {league.leagueLabel.toUpperCase()}
            </h3>
            {league.players.length === 0 ? (
              <p style={{ color: "var(--textDim)", fontSize: 14 }}>Todavía no hay jugadores en esta liga.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Usuario</th>
                    <th>V-COIN este mes</th>
                  </tr>
                </thead>
                <tbody>
                  {league.players.map((p, i) => (
                    <tr key={p.publicId} className={p.isMe ? styles.me : ""}>
                      <td className={styles.pos}>
                        {i < 5 ? "🏆 " : ""}
                        {i + 1}
                      </td>
                      <td>{p.publicId}</td>
                      <td>{p.vcoin} V-COIN</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
    </>
  );
}
