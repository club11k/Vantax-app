import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Protege /dashboard, /journal, /play, /riesgo y /mercado (cualquier
// usuario logueado) y /admin (solo rol ADMIN). También corta el paso a
// TODAS estas rutas si el token dice que la cuenta está bloqueada
// (suspendida a mano, o bloqueada sola por salir del IB de Vantage / 30
// días sin operar — ver src/lib/auth.ts y src/lib/vantage-block.ts):
// redirige a /login con el motivo, en vez de dejar pasar a nada.
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token as any;
    if (token?.blocked) {
      const url = new URL("/login", req.url);
      url.searchParams.set("blocked", token.blocked);
      return NextResponse.redirect(url);
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
  ],
};
