'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Globe, Menu, X } from 'lucide-react';
import MemeCMOLogo from './memecmo-logo';
import { useLanguage } from '@/contexts/language-context';
import { useAuth } from '@/contexts/auth-context';

// The marketing homepage lives on https://memecmo.ai; this navbar serves the
// product pages (pricing/waitlist/terms/…) on app.memecmo.ai.
const navLinks = [
  { label: '首页', href: 'https://memecmo.ai' },
  { label: '方案定价', href: '/pricing' },
  { label: '工作台', href: '/dashboard' },
];

const langLabels: Record<string, string> = {
  'zh-TW': '繁',
  'zh-CN': '简',
  en: 'EN',
};

const langCycle: Record<string, 'zh-TW' | 'zh-CN' | 'en'> = {
  'zh-TW': 'zh-CN',
  'zh-CN': 'en',
  en: 'zh-TW',
};

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { language, setLanguage } = useLanguage();
  const { user, loading: authLoading } = useAuth();

  const handleLangToggle = () => {
    setLanguage(langCycle[language]);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a1628]/95 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <a href="https://memecmo.ai" className="flex items-center gap-3 group">
              <MemeCMOLogo height={30} className="opacity-90 group-hover:opacity-100 transition-opacity duration-300" showWordmark />
            </a>
          </div>

          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              link.href.startsWith('/') ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors duration-200"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors duration-200"
                >
                  {link.label}
                </a>
              )
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLangToggle}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <Globe className="w-4 h-4" />
              <span>{langLabels[language]}</span>
            </button>
            {!authLoading ? (
              <>
                {user ? (
                  <>
                    <Link
                      href="/sea-command-center"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-200"
                    >
                      SEA 指挥中心
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="hidden sm:block text-sm text-gray-300 hover:text-white transition-colors px-3 py-1.5"
                    >
                      登录
                    </Link>
                    <Link
                      href="/waitlist"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-200"
                    >
                      加入名单
                    </Link>
                  </>
                )}
              </>
            ) : null}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 text-gray-400 hover:text-white"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-[#0a1628]/98 backdrop-blur-md border-t border-white/5">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              link.href.startsWith('/') ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="block px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              )
            ))}
            <div className="pt-2 border-t border-white/10 flex items-center gap-3">
              <button
                onClick={handleLangToggle}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                <Globe className="w-4 h-4" />
                <span>{langLabels[language]}</span>
              </button>
              {!user && (
                <Link
                  href="/login"
                  className="text-sm text-gray-300 hover:text-white px-3 py-2"
                  onClick={() => setMobileOpen(false)}
                >
                  登录
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
