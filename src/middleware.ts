import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Protege /dashboard, /journal, /play, /riesgo, /mercado y /completar-mt5
// (cualquier usuario logueado) y /admin (solo rol ADMIN). También corta el
// paso a TODAS estas rutas si el token dice que la cuenta está bloqueada
// (suspendida a mano, o bloqueada sola por salir del IB de Vantage / 30
// días sin operar — ver src/lib/auth.ts y src/lib/vantage-block.ts):
// redirige a /login con el motivo, en vez de dejar pasar a nada.
//
// Aparte de eso, si el usuario todavía no tiene NINGUNA cuenta MT5
// vinculada (needsMt5Setup, ver src/lib/mt5-gate.ts — afecta a cuentas
// nuevas Y a las que ya existían antes de este cambio), se le manda a
// /completar-mt5 en vez de a login: no es una sanción, es un paso de
// configuración pendiente, así que no lleva mensaje de "bloqueado".
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token as any;
    if (token?.blocked) {
      const url = new URL("/login", req.url);
      url.searchParams.set("blocked", token.blocked);
      return NextResponse.redirect(url);
    }
    const isCompletarMt5 = req.nextUrl.pathname.startsWith("/completar-mt5");
    if (token?.needsMt5Setup && !isCompletarMt5) {
      return NextResponse.redirect(new URL("/completar-mt5", req.url));
    }
    if (req.nextUrl.pathname.startsWith("/admin") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/mercado/:path*",
    "/journal/:path*",
    "/play/:path*",
    "/riesgo/:path*",
    "/completar-mt5/:path*",
  ],
};
