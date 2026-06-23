'use client';

import Link from 'next/link';
import { MapPin, Mail, Phone, Building2, Shield, FileText } from 'lucide-react';
import CalligraphyLogo from './calligraphy-logo';
import { useLanguage } from '@/contexts/language-context';

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="bg-[#060e1a] border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          <div className="lg:col-span-1 space-y-5">
            <div className="flex flex-col gap-2">
              <CalligraphyLogo height={32} className="opacity-80" />
              <p className="text-xs tracking-[0.2em] text-gray-500 uppercase mt-1">
                NeuronSpark Media-Tech Limited
              </p>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
              {t('footer.tagline')}
            </p>
            <p className="text-xs text-gray-500 leading-relaxed max-w-xs border-l-2 border-blue-500/30 pl-3">
              {t('footer.brandBridge')}
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white tracking-wide">{t('footer.services')}</h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#ecosystem" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  {t('footer.businessConsulting')}
                </a>
              </li>
              <li>
                <a href="#ecosystem" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  {t('footer.dualEcosystem')}
                </a>
              </li>
              <li>
                <a href="#ai-baseline" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  {t('footer.aiBaseline')}
                </a>
              </li>
              <li>
                <a href="#geo-audit" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  {t('footer.geoStrategy')}
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white tracking-wide">{t('footer.company')}</h4>
            <ul className="space-y-2.5">
              <li>
                <Link href="/founder" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  {t('footer.aboutThinkTank')}
                </Link>
              </li>
              <li>
                <Link href="/founder" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  {t('footer.expertTeam')}
                </Link>
              </li>
              <li>
                <span className="text-sm text-gray-500 cursor-default">{t('footer.successCases')}</span>
                <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-900/40 text-blue-400 rounded">{t('footer.compiling')}</span>
              </li>
              <li>
                <span className="text-sm text-gray-500 cursor-default">{t('footer.geoWhitepaper')}</span>
                <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-blue-900/40 text-blue-400 rounded">{t('footer.upcoming')}</span>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-white tracking-wide">{t('footer.contactTitle')}</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                <span className="text-sm text-gray-400 leading-relaxed whitespace-pre-line">
                  {t('footer.address')}
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                <a href="mailto:liujunshuo1987@gmail.com" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  liujunshuo1987@gmail.com
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                <a href="tel:+85231026868" className="text-sm text-gray-400 hover:text-white transition-colors duration-200">
                  +852 3102-6868
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 pt-8 border-t border-white/5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gray-500" />
                <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('footer.legalInfo')}</h5>
              </div>
              <div className="space-y-1.5 text-xs text-gray-500 leading-relaxed">
                <p>{t('footer.legalName')}</p>
                <p>{t('footer.businessReg')}</p>
                <p>{t('footer.registered')}</p>
                <p>
                  {t('footer.chiefArchitect')}
                  <Link href="/founder" className="text-gray-400 hover:text-white transition-colors duration-200 underline underline-offset-2 decoration-gray-600 hover:decoration-gray-400">
                    {t('footer.chiefArchitectName')}
                  </Link>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-500" />
                <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('footer.complianceTitle')}</h5>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-gray-500">
                <Link href="/privacy" className="inline-flex items-center gap-1.5 hover:text-gray-300 transition-colors duration-200">
                  <FileText className="w-3 h-3" />
                  {t('footer.privacy')}
                </Link>
                <Link href="/terms" className="inline-flex items-center gap-1.5 hover:text-gray-300 transition-colors duration-200">
                  <FileText className="w-3 h-3" />
                  {t('footer.terms')}
                </Link>
                <a href="#" className="hover:text-gray-300 transition-colors duration-200">{t('footer.compliance')}</a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-xs text-gray-600">
            &copy; 2026 NeuronSpark Media-Tech Limited ({t('footer.brandAlias')}) {t('footer.rights')}
          </p>
        </div>
      </div>
    </footer>
  );
}
