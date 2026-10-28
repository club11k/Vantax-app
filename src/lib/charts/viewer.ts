import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// CHARTS está abierto a cualquier usuario con sesión iniciada.
export async function getChartsUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user ? ((session.user as any).id as string) : null;
}
