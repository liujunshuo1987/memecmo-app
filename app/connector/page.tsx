// Public page: what the MemeCMO Connector is, how to connect, what it exposes,
// and the lines it never crosses. Also the reference for directory submissions.

import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';

export const metadata: Metadata = {
  title: 'MemeCMO Connector (MCP) — measurement, deliverables and the action ledger in your own AI environment',
  description:
    'A remote MCP server for Claude, Cursor, Claude Code, Zapier and other agent environments: read a brand\'s AI visibility scorecard, gaps and cited sources, pull publish-ready deliverables, and log what you published so the next scan attributes it.',
  alternates: { canonical: 'https://app.memecmo.ai/connector' },
};

const URL = 'https://app.memecmo.ai/api/mcp';

const TOOLS: [string, string, string][] = [
  ['list_projects', '本密钥可见的项目(品牌 × 市场)与最近一次可比扫描', 'Projects this key can see, with the latest comparable scan'],
  ['get_scorecard', '最新评分卡:指数、五个维度、分引擎出现率(带分子分母)、竞品基准、样本量', 'Latest scorecard: index, five dimensions, per-engine presence with fractions, benchmark, sample sizes'],
  ['get_gaps', '高意图缺口:AI 点了竞品、没点你的买家问题', 'High-intent gaps: buyer questions where engines name competitors but not the brand'],
  ['get_sources', 'AI 引用的信源排行(跨扫描聚合)', 'Sources the engines cite, aggregated across scans'],
  ['get_deliverables', '最新交付物:内容稿、分发包、官网改造、百科草稿、报告、标准答案、品牌档案;含人工修改', 'Latest deliverables with the client\'s edits applied'],
  ['get_actions', '行动台账:已登记的发布、核验状态与前后对比', 'The action ledger with verification and before/after outcomes'],
  ['log_action', '登记一条已发布的行动(URL、日期、针对的问题)——发布后调用', 'Log a published action (URL, date, targeted questions) — call it after publishing'],
  ['get_map', 'MemeCMO 业务本体地图(公开视图):卖什么、靠什么测量、哪些闭环、哪些规则;可按对象 id 看它牵动什么', 'The MemeCMO business ontology map (public view): offerings, instruments, loops, rules; ask by object id what it touches'],
];

export default function ConnectorPage() {
  const cc = `claude mcp add --transport http memecmo ${URL} --header "Authorization: Bearer mc_<your-key>"`;
  const json = JSON.stringify({ mcpServers: { memecmo: { url: URL, headers: { Authorization: 'Bearer mc_<your-key>' } } } }, null, 2);
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Navbar />
      <main className="pt-28 pb-20 px-4">
        <div className="max-w-3xl mx-auto space-y-12">
          <header className="space-y-3 mc-enter">
            <span className="text-[11px] uppercase tracking-[0.25em] text-brand">MemeCMO Connector · MCP</span>
            <h1 className="text-3xl font-bold leading-tight">把测量、交付物和行动台账,接进你自己的 AI 环境</h1>
            <p className="text-sm text-dim leading-relaxed">
              MemeCMO 不替你发布,也不保管你的社媒令牌。你在 Claude、Cursor、Zapier 或任何支持 MCP 的环境里读取品牌的 AI 可见度数据和可发布的稿件,在自己的渠道发布,然后用一条 <code className="mc-chip-inset rounded px-1">log_action</code> 登记。平台抓取核验,下一次扫描按问题、按引擎归因。
            </p>
            <p className="text-sm text-dim leading-relaxed">
              <span className="text-faint">EN · </span>MemeCMO never publishes for you and never holds your social tokens. Read the scorecard, gaps, cited sources and publish-ready deliverables from Claude, Cursor, Zapier or any MCP client, publish in your own channels, then log the action. The platform verifies the page and the next scan attributes what moved.
            </p>
          </header>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold border-b border-edge pb-2">接入 · Connect</h2>
            <ol className="text-[13px] text-dim leading-relaxed list-decimal ml-5 space-y-1">
              <li>组织管理员在工作台点「连接器」生成密钥(只显示一次;可选只读)。 <span className="text-faint">An organization admin creates a key in the dashboard; it is shown once.</span></li>
              <li>把密钥作为 Bearer 头交给你的客户端。 <span className="text-faint">Pass it as a Bearer header.</span></li>
            </ol>
            <div className="mc-card-soft p-4 space-y-1">
              <div className="text-[11px] text-ink font-medium">Claude Code</div>
              <pre className="text-[11px] whitespace-pre-wrap break-all text-dim">{cc}</pre>
            </div>
            <div className="mc-card-soft p-4 space-y-1">
              <div className="text-[11px] text-ink font-medium">Cursor · Claude Desktop(经 mcp-remote)· 其他支持 HTTP 头的客户端</div>
              <pre className="text-[11px] whitespace-pre-wrap break-all text-dim">{json}</pre>
            </div>
            <div className="mc-card-soft p-4 space-y-1">
              <div className="text-[11px] text-ink font-medium">Claude.ai · ChatGPT · 其他支持 OAuth 的客户端 — 不需要密钥</div>
              <p className="text-[12px] text-dim leading-relaxed">在客户端里"添加自定义连接器 / MCP 服务器",填 <code className="mc-chip-inset rounded px-1">{URL}</code>,客户端会自动注册并跳到 MemeCMO 登录与授权页;你选择授权哪个组织,登记行动需要该组织的 editor 或 admin 角色。令牌 24 小时有效、自动刷新,可随时在授权页撤销。 <span className="text-faint">Add it as a custom connector; the client discovers OAuth, you sign in and choose an organization.</span></p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold border-b border-edge pb-2">工具 · Tools</h2>
            <div className="mc-card overflow-hidden">
              <table className="w-full text-[12px]">
                <tbody>
                  {TOOLS.map(([n, zh, en]) => (
                    <tr key={n} className="border-t border-edge first:border-0 align-top">
                      <td className="px-3 py-2 font-mono text-ink whitespace-nowrap">{n}</td>
                      <td className="px-3 py-2 text-dim">{zh}<div className="text-faint">{en}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-dim leading-relaxed">每条返回都带 <code className="mc-chip-inset rounded px-1">source</code>、<code className="mc-chip-inset rounded px-1">workspace</code> 链接与测量口径说明;数字按冻结提示词面板测量,比率附分子分母。 <span className="text-faint">Every answer carries attribution, the workspace link and the measurement note.</span></p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold border-b border-edge pb-2">Zapier · 在客户自己的发布环境里闭环</h2>
            <p className="text-[13px] text-dim leading-relaxed">MemeCMO 的 Zapier 集成用同一套 OAuth 登录。触发器:<b>New Scan</b>(扫描完成:指数、出现率、缺口数)、<b>New Deliverable</b>(内容稿 / 分发包 / 官网改造 / 百科 / 报告就绪,含人工修改);动作:<b>Log Published Action</b>(登记已发布的 URL);搜索:最新交付物、当前缺口。一个 Zap 就能把内容稿发到 Facebook 主页或 LinkedIn 公司页,再把帖子 URL 回写成行动。 <span className="text-faint">Same OAuth; triggers New Scan and New Deliverable, action Log Published Action, searches for the latest deliverable and current gaps. Publish with Zapier's Facebook Pages / LinkedIn actions, then log the post URL.</span></p>
            <p className="text-[12px] text-faint">集成以私有邀请方式提供,联系 samchan@memecmo.ai 获取邀请链接。 <span>Private integration; ask for the invite link.</span></p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold border-b border-edge pb-2">REST · 同一套凭证的 HTTP 接口</h2>
            <div className="mc-card overflow-hidden">
              <table className="w-full text-[12px]">
                <tbody>
                  {[
                    ['GET /api/connector/v1/me', '凭证对应的组织与权限 · who this credential is'],
                    ['GET /api/connector/v1/projects', '项目列表 · projects'],
                    ['GET /api/connector/v1/projects/{slug}/scorecard · /gaps · /sources', '评分卡、缺口、信源 · scorecard, gaps, sources'],
                    ['GET /api/connector/v1/projects/{slug}/deliverables[?type=]', '交付物列表或某一类的全文 · deliverables'],
                    ['GET|POST /api/connector/v1/projects/{slug}/actions', '行动台账;POST 登记行动 · the action ledger; POST logs one'],
                    ['GET /api/connector/v1/events/scans · /events/deliverables', '跨项目的最新扫描与交付物,供轮询 · polling feeds'],
                    ['GET /api/connector/v1/map[?id=&depth=&world=&type=]', '业务本体地图(公开视图),与 /api/map 相同 · the business map (public view), same as /api/map'],
                  ].map(([path, desc]) => (
                    <tr key={path} className="border-t border-edge first:border-0 align-top"><td className="px-3 py-2 font-mono text-ink text-[11px]">{path}</td><td className="px-3 py-2 text-dim">{desc}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-faint">Bearer 为连接器密钥或 OAuth 访问令牌;每分钟 120 次。 <span>Bearer = connector key or OAuth access token; 120 calls per minute.</span></p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold border-b border-edge pb-2">典型流程 · A typical loop</h2>
            <ol className="text-[13px] text-dim leading-relaxed list-decimal ml-5 space-y-1">
              <li><code className="mc-chip-inset rounded px-1">get_gaps</code> 看哪些买家问题 AI 点了竞品没点你。</li>
              <li><code className="mc-chip-inset rounded px-1">get_deliverables</code> 取对应的内容稿或分发包(数字只来自你公开的品牌事实)。</li>
              <li>在你自己的环境里发布:Zapier 的 Facebook 主页 / LinkedIn 公司页动作、你的 CMS、或投稿给媒体。</li>
              <li><code className="mc-chip-inset rounded px-1">log_action</code> 登记上线的 URL、日期和针对的问题。同一 URL 重复登记只返回已有记录。</li>
              <li>平台几分钟内抓取核验;下一次定期扫描后,<code className="mc-chip-inset rounded px-1">get_actions</code> 给出前后对比。</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold border-b border-edge pb-2">边界 · Lines we keep</h2>
            <ul className="text-[13px] text-dim leading-relaxed list-disc ml-5 space-y-1">
              <li>一把密钥只能看自己组织(及其直属客户组织)的品牌。 <span className="text-faint">A key sees its own organization only.</span></li>
              <li>测量结果是客观审计,连接器只读,不提供任何修改分数的工具。 <span className="text-faint">Scores are read-only; there is no tool to adjust them.</span></li>
              <li>MemeCMO 不发布内容、不保管渠道令牌;发布由你在自己的环境完成。 <span className="text-faint">Publishing happens in your environment.</span></li>
              <li>读取不另计费(在套餐内);触发扫描将按 credit 计量。每次调用记入组织的使用日志。 <span className="text-faint">Reads are included in the plan; scans will be metered in credits; every call is logged.</span></li>
              <li>每分钟 120 次调用;密钥可随时撤销。 <span className="text-faint">120 calls per minute per key; revoke any time.</span></li>
            </ul>
          </section>

          <div className="text-[12px] text-dim">
            <Link href="/pricing" className="text-brand underline underline-offset-2">套餐与 credit →</Link>
            <span className="mx-2 text-faint">·</span>
            <Link href="/guide" className="text-brand underline underline-offset-2">使用说明与算法白皮书 →</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
