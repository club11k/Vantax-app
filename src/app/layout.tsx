import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VANTAX — Análisis de XAU/USD y DXY",
  description: "Análisis diarios de oro y dólar generados con IA sobre datos macro reales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
