import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "@/components/Footer";
import { InactivityWarningBanner } from "@/components/InactivityWarningBanner";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "VANTAX — Análisis de XAU/USD y DXY",
  description: "Análisis diarios de oro y dólar generados con IA sobre datos macro reales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Providers>
          {/* Aparece solo, en cualquier página, mientras el usuario tenga un
              aviso de inactividad pendiente — ver el propio componente. */}
          <InactivityWarningBanner />
          <div style={{ flex: 1 }}>{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
