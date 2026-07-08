'use client';

// MemeCMO product footer. Brand-pure by design: the legacy Guanlan/NeuronSpark
// consulting chrome was removed (brand separation); the legal owner remains as
// a single © line. No links to pages that don't exist.

import Link from 'next/link';
import { Mail } from 'lucide-react';
import MemeCMOLogo from './memecmo-logo';

export default function Footer() {
  return (
    <footer className="bg-[#060e1a] border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <div className="space-y-4">
            <MemeCMOLogo height={32} className="opacity-90" showWordmark />
            <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
              面向东南亚市场的多智能体 GEO 平台 —— 测量并提升品牌在 ChatGPT、Gemini、Perplexity、Google AI Overview 中的可见度。
            </p>
            <p className="text-xs text-gray-500 leading-relaxed max-w-xs">
              Multi-agent GEO platform for brands entering Southeast Asia.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white tracking-wide">产品 Product</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#ai-baseline" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  AIGVR 扫描 · AI Visibility Scan
                </a>
              </li>
              <li>
                <Link href="/pricing" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  方案定价 · Pricing
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  工作台 · Dashboard
                </Link>
              </li>
              <li>
                <Link href="/waitlist" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  申请内测 · Join waitlist
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white tracking-wide">联系 Contact</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                <a href="mailto:liujunshuo1987@gmail.com" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  liujunshuo1987@gmail.com
                </a>
              </li>
            </ul>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-500 pt-2">
              <Link href="/privacy" className="hover:text-gray-300 transition-colors duration-200">隐私政策 Privacy</Link>
              <Link href="/terms" className="hover:text-gray-300 transition-colors duration-200">服务条款 Terms</Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-gray-600">
            &copy; 2026 MemeCMO.ai · NeuronSpark Media-Tech Limited. All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
