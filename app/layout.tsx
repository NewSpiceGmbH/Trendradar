import type { Metadata } from "next";
import { Archivo, DM_Sans } from "next/font/google";
import "./globals.css";

// next/font lädt die Schriften beim Build und liefert sie selbst aus – keine Anfragen an Google zur Laufzeit.
const archivo = Archivo({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-archivo" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: { default: "New Spice Trendradar", template: "%s · New Spice Trendradar" },
  description: "Trendradar für Sport, Hospitality und Live Entertainment",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${archivo.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
