'use client';

// MemeCMO product footer. Brand-pure by design: the legacy Guanlan/NeuronSpark
// consulting chrome was removed (brand separation); the legal owner remains as
// a single © line. No links to pages that don't exist.

import Link from 'next/link';
import { Mail } from 'lucide-react';
import MemeCMOLogo from './memecmo-logo';

export default function Footer() {
  return (
    <footer className="bg-canvas border-t border-edge">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="space-y-4">
            <MemeCMOLogo height={32} className="opacity-90" showWordmark />
            <p className="text-sm text-dim leading-relaxed max-w-xs">
              面向东南亚市场的多智能体 GEO 平台 —— 测量并提升品牌在 ChatGPT、Gemini、Perplexity、Google AI Overview 中的可见度。
            </p>
            <p className="text-xs text-faint leading-relaxed max-w-xs">
              Multi-agent GEO platform for brands entering Southeast Asia.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-ink tracking-wide">产品 Product</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="https://memecmo.ai" className="text-sm text-dim hover:text-ink transition-colors duration-200">
                  首页 · Home
                </a>
              </li>
              <li>
                <Link href="/pricing" className="text-sm text-dim hover:text-ink transition-colors duration-200">
                  方案定价 · Pricing
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-sm text-dim hover:text-ink transition-colors duration-200">
                  工作台 · Dashboard
                </Link>
              </li>
              <li>
                <Link href="/waitlist" className="text-sm text-dim hover:text-ink transition-colors duration-200">
                  申请内测 · Join waitlist
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-sm text-dim hover:text-ink transition-colors duration-200">
                  关于我们 · About us
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-ink tracking-wide">联系 Contact</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-faint shrink-0" />
                <a href="mailto:liujunshuo1987@gmail.com" className="text-sm text-dim hover:text-ink transition-colors duration-200">
                  liujunshuo1987@gmail.com
                </a>
              </li>
            </ul>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-faint pt-2">
              <Link href="/privacy" className="hover:text-dim transition-colors duration-200">隐私政策 Privacy</Link>
              <Link href="/terms" className="hover:text-dim transition-colors duration-200">服务条款 Terms</Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-edge text-center space-y-1.5">
          <p className="text-xs text-faint">
            &copy; 2026 MemeCMO Tech Limited. All Rights Reserved. ·{' '}
            <Link href="/about" className="hover:text-dim transition-colors duration-200 underline underline-offset-2 decoration-gray-700">
              關於我們 About
            </Link>
          </p>
          <p className="text-[11px] text-faint">
            Hong Kong CR No. 80218619 · Room C03, 9/F, Kato Factory Building, 2 Cheung Yue Street, Lai Chi Kok, Kowloon, Hong Kong
          </p>
        </div>
      </div>
    </footer>
  );
}
