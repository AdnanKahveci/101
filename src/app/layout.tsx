import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/toaster";

const nunito = Nunito({ subsets: ["latin", "latin-ext"], variable: "--font-nunito", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Online 101 Okey", template: "%s · Online 101 Okey" },
  description: "Arkadaşlarınla gerçek zamanlı, eşli veya eşsiz 101 Okey oyna.",
};

export const viewport: Viewport = {
  themeColor: "#04241a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={nunito.variable}>
      <body className="min-h-screen font-sans antialiased">
        <Nav />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
