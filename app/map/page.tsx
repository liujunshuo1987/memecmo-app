// Public page: the public view of the MemeCMO business ontology map (因陀罗网).
// Open to everyone (founder, 2026-10-19); the map itself is served by /map/embed from the generated
// module lib/map/public-view.ts (memecmo-ontology/tools/build_map.py --app), so the page
// never reads files at runtime and never carries partner- or internal-level objects.

import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
import { MAP_VIEW } from '@/lib/map/public-view';

export const metadata: Metadata = {
  title: 'MemeCMO 业务地图 · 因陀罗网',
  description: 'MemeCMO 的业务本体地图：卖什么、靠什么测量、哪些闭环在跑、受哪些规则约束、跑在什么上面。每个节点映照其它节点。',
  alternates: { canonical: 'https://app.memecmo.ai/map' },
};

export default function MapPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Navbar />
      <main className="pt-28 pb-16 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <header className="space-y-3 mc-enter">
            <span className="text-[11px] uppercase tracking-[0.25em] text-brand">MemeCMO Map · 因陀罗网</span>
            <h1 className="text-3xl font-bold leading-tight">一张能点的业务地图</h1>
            <p className="text-sm text-dim leading-relaxed max-w-3xl">
              MemeCMO 卖什么、靠什么测量、哪些闭环在跑、受哪些规则约束、跑在什么上面。点一个节点，右栏列出它映照的一切：它被什么度量、产出什么、受哪条红线约束、经哪个渠道到你手上。这是公开视图，只含已在公开页面上的对象，不用登录。
            </p>
            <p className="text-sm text-dim leading-relaxed max-w-3xl">
              <span className="text-faint">EN · </span>What MemeCMO sells, how it measures, which loops run, which rules bind them and what everything runs on. Click a node and the panel lists everything it reflects. This is the public view: only objects already on public pages.
            </p>
            <p className="text-[12px] text-faint">
              版本 {MAP_VIEW.version} · 截至 {MAP_VIEW.as_of} · {MAP_VIEW.objects} 个对象 · {MAP_VIEW.links} 条链接 · 地图由 memecmo-ontology 的定义编译而来，随业务重建。
            </p>
          </header>

          <div className="mc-card overflow-hidden" style={{ height: 'min(82vh, 920px)', minHeight: 560 }}>
            <iframe src="/map/embed" title="MemeCMO 业务地图" className="w-full h-full border-0 block" />
          </div>

          <section className="text-[12px] text-dim leading-relaxed space-y-1">
            <p>心脏是「量 · 进 · 证」：测量 AI 在买家问题上说了谁，进入 AI 真正引用的信源，用登记的发布与前后读数证明变化。其它闭环都是它的一环。</p>
            <p>
              数据接口：<code className="mc-chip-inset rounded px-1">GET /api/map</code> 返回同一视图的 JSON，供你自己的工具读取；连接器里是 <code className="mc-chip-inset rounded px-1">get_map</code> 工具。
              <span className="mx-2 text-faint">·</span>
              <Link href="/guide" className="text-brand underline underline-offset-2">使用说明与算法白皮书 →</Link>
              <span className="mx-2 text-faint">·</span>
              <Link href="/connector" className="text-brand underline underline-offset-2">连接器 →</Link>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
