"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      let data: { error?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        // La respuesta no era JSON (por ejemplo, un error 500 sin cuerpo) —
        // seguimos con data en null y mostramos un mensaje genérico abajo.
      }

      if (!res.ok) {
        setError(data?.error ?? "Algo salió mal creando la cuenta. Inténtalo de nuevo.");
        return;
      }

      const signInRes = await signIn("credentials", { email, password, redirect: false });
      if (signInRes?.ok) {
        router.push("/dashboard");
      } else {
        // La cuenta sí se creó — mandamos a login por si el inicio de sesión
        // automático falló por cualquier motivo.
        router.push("/login");
      }
    } catch {
      setError(
        "La cuenta puede haberse creado, pero no se pudo iniciar sesión automáticamente. Prueba a iniciar sesión con tu email y contraseña."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: 80 }}>
      <h1 style={{ fontSize: 26 }}>Crea tu cuenta</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
        ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
      </p>
      <form onSubmit={handleSubmit} className="panel" style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label htmlFor="name">Nombre (opcional)</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "Creando cuenta…" : "Crear cuenta"}
        </button>
      </form>
    </div>
  );
}


