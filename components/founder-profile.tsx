'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

export default function FounderProfile() {
  return (
    <section id="founder" className="py-24 bg-gradient-to-b from-slate-950 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-start"
        >
          <div className="lg:col-span-2 flex justify-center lg:justify-start">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur opacity-25"></div>
              <div className="relative bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-2">
                <Image
                  src="/founder_potrait.jpeg"
                  alt="劉峻鑠博士"
                  width={400}
                  height={500}
                  className="rounded-xl object-cover"
                  priority
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-8">
            <div className="space-y-3">
              <p className="text-sm font-medium text-cyan-400 tracking-wider uppercase">
                首席數據架構師 / 創始人
              </p>
              <h2 className="text-4xl font-bold text-white">
                劉峻鑠 <span className="text-slate-400 text-2xl font-normal ml-2">(Liu Junshuo)</span>
              </h2>
            </div>

            <div className="space-y-6 text-slate-300 leading-relaxed">
              <p className="text-base">
                劉峻鑠博士是MemeCMO.ai的創始人兼首席數據架構師。作為早期的模型化學習探索者，他曾致力於通過機器學習與大語言模型（LLM）實現自然語言的生成，並深度參與了早期底層語料庫的搭建與句法結構化標注工作。
              </p>

              <p className="text-base">
                面對早期人文學界對結構化語言及計算語言學的認知壁壘，他轉向深耕傳統學術，獲得中山大學古典文獻學博士學位，其間專注於古琴文獻的深度考據。這段看似抽離的學術經歷，反而在大模型時代為他賦予了極其稀缺的核心能力：將古典文獻考據學的嚴苛標準，精準降維應用於現代人工智能的語料清洗與結構化編碼之中。
              </p>

              <p className="text-base">
                在學術研究之外，他擁有跨越多行業的商業實戰履歷，曾出任資深公關專家、媒體人及品牌架構師。作為持續追蹤大語言模型演進的深度研究者，他在大數據與生成式 AI 時代找到了跨界融合的終極解法——生成式引擎優化（GEO）與計算公關。
              </p>

              <p className="text-base">
                如今，他推崇「Vibe Coding」與第一性原理，其系統架構哲學融合了控制論（Cybernetics）、斯多葛學派以及王夫之「知行合一」的思想，致力於帶領MemeCMO.ai為企業重構具備高防禦性的數字機器認知底座。
              </p>
            </div>

            <div className="pt-6 border-t border-slate-700/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">學術背景</p>
                  <p className="text-sm text-slate-300">中山大學古典文獻學博士</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">核心領域</p>
                  <p className="text-sm text-slate-300">GEO、計算公關、多智能體架構</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
