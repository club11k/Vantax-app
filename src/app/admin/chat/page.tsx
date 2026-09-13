import { redirect } from "next/navigation";

// El Chat IA se movió a /dashboard (dentro de Análisis, junto al
// generador) para que viva en el mismo sitio donde se usa de verdad —
// esta ruta se deja como redirect por si alguien la tenía guardada.
export default function AdminChatPage() {
  redirect("/dashboard");
}

