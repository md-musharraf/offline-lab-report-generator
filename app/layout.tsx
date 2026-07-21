import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "JharLab — Laboratory Information System",
  description: "Production-ready Pathology Laboratory Information System for India. NABL-compliant, offline-capable.",
};

import { LicenseProvider } from "@/components/LicenseProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <LicenseProvider>
          {children}
        </LicenseProvider>
      </body>
    </html>
  );
}
