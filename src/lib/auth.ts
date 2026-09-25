import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getVantageBlockStatus } from "@/lib/vantage-block";
import { userHasMt5Account } from "@/lib/mt5-gate";

// Cada cuánto se revalida, para una sesión YA abierta, que el usuario
// siga sin estar suspendido/bloqueado — sin esto, alguien que se queda sin
// acceso (ej. deja de operar, o un admin lo suspende) seguiría entrando a
// todo hasta que su sesión expirara sola (hasta 30 días). Consultar la BD
// en cada request sería más inmediato pero innecesario para una app de
// este tamaño — cada 5 minutos es sobrado para que el bloqueo se note casi
// al momento sin machacar la base de datos.
const BLOCK_RECHECK_INTERVAL_MS = 5 * 60 * 1000;

async function computeBlockedCode(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { suspended: true } });
  if (!user) return "deleted";
  if (user.suspended) return "suspended";
  const vantageBlock = await getVantageBlockStatus(userId);
  if (vantageBlock.blocked) return vantageBlock.reason === "ib_unlinked" ? "blocked_ib" : "blocked_inactivity";
  return null;
}

// Aparte del bloqueo de arriba (que muestra un mensaje en /login y corta el
// paso del todo), esto decide si hay que mandar al usuario a
// /completar-mt5 antes de dejarle usar nada — no es un "bloqueo" en el
// mismo sentido (no pasa por authorize(), no da error al iniciar sesión):
// se deja entrar con normalidad y es el middleware quien lo redirige
// dentro de la propia app, porque es un paso de configuración pendiente,
// no una sanción. Los admins quedan exentos — no tiene sentido pedirles
// una cuenta de trading para gestionar el panel.
async function computeNeedsMt5Setup(userId: string, role: string): Promise<boolean> {
  if (role === "ADMIN") return false;
  return !(await userHasMt5Account(userId));
}

// NextAuth con proveedor de credenciales (email + contraseña) y sesiones JWT.
// No usamos un adapter de base de datos: con credenciales + JWT no hace
// falta (el adapter es para OAuth / sesiones en base de datos), y evita
// depender de un paquete extra que podría desincronizarse de versión con
// next-auth. Si más adelante se agrega login con Google/GitHub, ahí sí
// conviene sumar "@auth/prisma-adapter" y cambiar a sesiones de base de datos.
export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Contraseña correcta: ahora sí comprobamos si la cuenta está
        // suspendida (manual, admin) o bloqueada automáticamente (salida
        // del IB de Vantage / 30 días sin operar) — se hace después de
        // validar la contraseña a propósito, para no filtrar el estado de
        // la cuenta a quien solo esté probando contraseñas al azar.
        const blockedCode = await computeBlockedCode(user.id);
        if (blockedCode) {
          throw new Error(blockedCode);
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.blocked = null; // recién logueado: authorize() ya comprobó que no estaba bloqueado
        token.needsMt5Setup = await computeNeedsMt5Setup(token.id as string, token.role as string);
        token.blockCheckedAt = Date.now();
        return token;
      }
      // Sesión ya existente: revalida de vez en cuando (ver
      // BLOCK_RECHECK_INTERVAL_MS) que no se haya bloqueado mientras tanto,
      // o de inmediato si viene de un update() explícito del cliente (ver
      // src/components/CompletarMt5Form.tsx, que lo llama justo después de
      // vincular la cuenta — si no, needsMt5Setup seguiría en true hasta el
      // próximo refresco automático y el middleware devolvería para atrás).
      const forceRecheck = trigger === "update";
      const lastChecked = (token.blockCheckedAt as number) || 0;
      if (token.id && (forceRecheck || Date.now() - lastChecked > BLOCK_RECHECK_INTERVAL_MS)) {
        token.blocked = await computeBlockedCode(token.id as string);
        token.needsMt5Setup = await computeNeedsMt5Setup(token.id as string, token.role as string);
        token.blockCheckedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).blocked = token.blocked ?? null;
        (session.user as any).needsMt5Setup = token.needsMt5Setup ?? false;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
