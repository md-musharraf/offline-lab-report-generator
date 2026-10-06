import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LicenseProvider } from "@/components/LicenseProvider";

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
  description: "Pathology Laboratory Information System for India. NABL-compliant, offline-capable.",
};

// Before first paint: apply the saved theme (no white flash), and end the previous sign-in when the app
// was closed, so on a shared lab PC each launch starts at the sign-in screen.
const themeScript = `try{if(localStorage.getItem('jharlab_theme')==='dark')document.documentElement.classList.add('dark');if(!sessionStorage.getItem('jharlab_launched')){sessionStorage.setItem('jharlab_launched','1');localStorage.removeItem('pathology_lab_current_user')}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <LicenseProvider>
          {children}
        </LicenseProvider>
      </body>
    </html>
  );
}
