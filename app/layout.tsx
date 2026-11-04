import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";

// next/font lädt die Schriften beim Build und liefert sie selbst aus – keine Anfragen an Google zur Laufzeit.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-source-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: { default: "New Spice Trendradar", template: "%s · New Spice Trendradar" },
  description: "Trendradar für Sport, Hospitality und Live Entertainment",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${archivo.variable} ${sourceSans.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
