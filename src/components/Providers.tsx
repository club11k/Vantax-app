"use client";

import { SessionProvider } from "next-auth/react";

// Envuelve la app en el contexto de sesión de next-auth del lado cliente.
// Antes no hacía falta (login/signup usan signIn() directo, que no lo
// necesita), pero /completar-mt5 sí necesita useSession()/update() para
// forzar el refresco del token nada más vincular la cuenta MT5 — ver
// src/components/CompletarMt5Form.tsx. No cambia nada para el resto de la
// app: sin refetchInterval configurado, no añade tráfico de red extra.
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

