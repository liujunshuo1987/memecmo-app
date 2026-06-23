import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { LanguageProvider } from "@/contexts/language-context";
import { AuthProvider } from "@/contexts/auth-context";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.memecmo.ai"),
  title: {
    default: "MemeCMO.ai — Make your brand the answer in AI",
    template: "%s | MemeCMO.ai",
  },
  description: "Generative Engine Optimization (GEO) platform for Southeast Asia. Multi-agent monitoring across ChatGPT, Perplexity, Gemini, Claude — for Vietnam, Indonesia, Thailand, Philippines, Singapore, Malaysia.",
  applicationName: "MemeCMO.ai",
  authors: [{ name: "MemeCMO.ai", url: "https://memecmo.ai" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    type: "website",
    url: "https://app.memecmo.ai",
    siteName: "MemeCMO.ai",
    title: "MemeCMO.ai — Make your brand the answer in AI",
    description: "GEO multi-agent platform for SE Asia.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MemeCMO.ai",
    description: "GEO multi-agent platform for SE Asia.",
  },
  other: {
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:; style-src 'self' 'unsafe-inline' https: http:; img-src 'self' data: blob: https: http:; font-src 'self' data: https: http:; connect-src 'self' https: http: wss: ws:; frame-src 'self' https: http:; object-src 'none';",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#0a1628] text-white">
        <LanguageProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
