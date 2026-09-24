"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

// Mensajes específicos para cuenta bloqueada, en vez del genérico "Email o
// contraseña incorrectos" — así el usuario sabe qué pasó y no piensa que se
// equivocó de contraseña. Los códigos vienen de dos sitios:
//  - authorize() en src/lib/auth.ts, cuando intenta iniciar sesión con una
//    cuenta ya bloqueada (llega como res.error del signIn de abajo).
//  - src/middleware.ts, cuando una sesión YA abierta se detecta bloqueada
//    al visitar cualquier página protegida (llega como ?blocked= en la URL).
const BLOCKED_MESSAGES: Record<string, string> = {
  suspended: "Tu cuenta ha sido suspendida. Contacta con nosotros si crees que es un error.",
  blocked_ib:
    "Tu cuenta se ha bloqueado: tu cuenta de Vantage ya no está vinculada a nuestro IB. Contacta con nosotros si crees que es un error.",
  blocked_inactivity:
    "Tu cuenta se ha bloqueado por inactividad (más de 30 días sin operar). En cuanto vuelvas a operar se desbloqueará sola.",
};

function blockedMessage(code: string | null): string | null {
  if (!code) return null;
  return BLOCKED_MESSAGES[code] ?? null;
}

// useSearchParams() (para leer ?blocked= que manda src/middleware.ts)
// exige un límite <Suspense> alrededor en el App Router de Next.js, si no
// falla el build — de ahí el envoltorio de abajo.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Si llega desde el middleware (sesión ya abierta que se detectó
  // bloqueada al intentar entrar a una página), mostrar el motivo desde ya,
  // sin esperar a que intente iniciar sesión de nuevo.
  useEffect(() => {
    const fromMiddleware = blockedMessage(searchParams.get("blocked"));
    if (fromMiddleware) setError(fromMiddleware);
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.ok) {
      router.push("/dashboard");
    } else {
      setError(blockedMessage(res?.error ?? null) ?? "Email o contraseña incorrectos.");
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: 80 }}>
      <h1 style={{ fontSize: 26 }}>Iniciar sesión</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
        ¿No tienes cuenta? <Link href="/signup">Crea una</Link>
      </p>
      <form onSubmit={handleSubmit} className="panel" style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}

