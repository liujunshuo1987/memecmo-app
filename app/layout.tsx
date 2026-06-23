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
  title: "观澜智库 | NeuronSpark Media-Tech",
  description: "打穿双引擎壁垒，重塑大模型时代的数字认知基建。生成式引擎优化（GEO）与文献级语料工程服务。",
  icons: {
    icon: "/logo.svg",
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
    <html lang="zh-CN" className={`${inter.variable} h-full antialiased`}>
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
