// Delivery-flow diagrams for the Partner Playbook — inline SVG on design
// tokens (var(--brand)/--gold/--sage/--edge/--ink/--dim/--surface) so they
// follow the day/night theme. Labels are English + shared codes (P1/WP1…)
// across every language edition; captions localize per language.

const INK = 'var(--ink)';
const DIM = 'var(--dim)';
const BRAND = 'var(--brand)';
const GOLD = 'var(--gold)';
const SAGE = 'var(--sage)';
const EDGE = 'var(--edge-strong)';
const SURFACE = 'var(--surface)';

const F = { fontFamily: 'var(--font-sans), system-ui, sans-serif' } as const;

function Box({ x, y, w, h, fill, fillOpacity, stroke }: { x: number; y: number; w: number; h: number; fill: string; fillOpacity?: number; stroke: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={10} fill={fill} fillOpacity={fillOpacity ?? 1} stroke={stroke} strokeWidth={1.5} />;
}
function Txt({ x, y, s, size = 13, fill = INK, bold = false, spacing }: { x: number; y: number; s: string; size?: number; fill?: string; bold?: boolean; spacing?: number }) {
  return <text x={x} y={y} style={F} fontSize={size} fontWeight={bold ? 700 : 400} fill={fill} textAnchor="middle" letterSpacing={spacing}>{s}</text>;
}
function Arrow({ x1, y1, x2, y2, id }: { x1: number; y1: number; x2: number; y2: number; id: string }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={BRAND} strokeWidth={2.5} markerEnd={`url(#${id})`} />;
}
function Head({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto">
        <polygon points="0 0, 9 3.5, 0 7" fill={BRAND} />
      </marker>
    </defs>
  );
}

export function LoopDiagram() {
  return (
    <svg viewBox="0 0 1560 560" className="w-full h-auto" role="img" aria-label="P1 assess / P2 modify continuous loop">
      <Head id="ah1" />
      <Box x={70} y={60} w={330} h={120} fill={BRAND} fillOpacity={0.1} stroke={BRAND} />
      <Txt x={235} y={95} s="P1 · ASSESS" size={17} fill={BRAND} bold />
      <Txt x={235} y={120} s="memecmo.ai scans" size={12.5} />
      <Txt x={235} y={140} s="Day-0 baseline · locked panel" size={11.5} fill={DIM} />
      <Txt x={235} y={158} s="weekly + monthly reports" size={11.5} fill={DIM} />
      <Box x={615} y={60} w={330} h={120} fill={SURFACE} stroke={EDGE} />
      <Txt x={780} y={100} s="DEVIATION LIST" size={15} bold />
      <Txt x={780} y={124} s="missing / wrong / rival-favored" size={11.5} fill={DIM} />
      <Txt x={780} y={142} s="answers in AI systems" size={11.5} fill={DIM} />
      <Box x={1160} y={60} w={330} h={120} fill={GOLD} fillOpacity={0.12} stroke={GOLD} />
      <Txt x={1325} y={95} s="P2 · MODIFY" size={17} fill={GOLD} bold />
      <Txt x={1325} y={120} s="WP1–WP5 work packages" size={12.5} />
      <Txt x={1325} y={140} s="publish authoritative corpus" size={11.5} fill={DIM} />
      <Txt x={1325} y={158} s="into every source channel" size={11.5} fill={DIM} />
      <Box x={1160} y={380} w={330} h={110} fill={SURFACE} stroke={EDGE} />
      <Txt x={1325} y={415} s="AI ENGINES DIGEST" size={14.5} bold />
      <Txt x={1325} y={438} s="retrieval: 2–6 weeks" size={11.5} fill={SAGE} />
      <Txt x={1325} y={456} s="model training: months" size={11.5} fill={DIM} />
      <Box x={615} y={380} w={330} h={110} fill={BRAND} fillOpacity={0.1} stroke={BRAND} />
      <Txt x={780} y={415} s="NEXT SCAN VERIFIES" size={14.5} fill={BRAND} bold />
      <Txt x={780} y={438} s="attribution table: action → metric" size={11.5} />
      <Txt x={780} y={456} s="pass = beyond ±3 noise band" size={11.5} fill={DIM} />
      <Box x={70} y={380} w={330} h={110} fill={SURFACE} stroke={EDGE} />
      <Txt x={235} y={415} s="CLIENT SEES PROOF" size={14.5} bold />
      <Txt x={235} y={438} s="scan-ID traceable numbers" size={11.5} fill={DIM} />
      <Txt x={235} y={456} s="renewal = the loop itself" size={11.5} fill={SAGE} />
      <Arrow x1={400} y1={120} x2={610} y2={120} id="ah1" />
      <Arrow x1={945} y1={120} x2={1155} y2={120} id="ah1" />
      <Arrow x1={1325} y1={180} x2={1325} y2={375} id="ah1" />
      <Arrow x1={1155} y1={435} x2={950} y2={435} id="ah1" />
      <Arrow x1={610} y1={435} x2={405} y2={435} id="ah1" />
      <Arrow x1={235} y1={375} x2={235} y2={185} id="ah1" />
      <Txt x={780} y={290} s="CONTINUOUS SUBSCRIPTION LOOP" size={20} fill={BRAND} bold spacing={3} />
      <Txt x={780} y={318} s="method identical for every client · content rebuilt per brand" size={12.5} fill={DIM} />
    </svg>
  );
}

const P1_STEPS = [
  ['P1-1', 'Day-0 scan', 'minutes to first scorecard', 'at the sales meeting', 'W0', true],
  ['P1-2', 'Accounts', 'partner = editor', 'client = read-only viewer', 'W1', false],
  ['P1-3', 'Fact sheet ✍', 'client signs canonical facts', '+ forbidden items (prices)', 'W1', false],
  ['P1-4', 'Freeze panel', 'core prompts + competitors', 'judge + cadence locked', 'W1–W2', true],
  ['P1-5', 'Reporting', 'weekly auto + monthly review', '+ scorecard walkthrough', 'W2 →', false],
] as const;

export function P1Diagram() {
  return (
    <svg viewBox="0 0 1560 300" className="w-full h-auto" role="img" aria-label="P1 assessment pipeline">
      <Head id="ah2" />
      {P1_STEPS.map(([code, t1, d1, d2, wk, hot], i) => {
        const x = 40 + i * 304;
        return (
          <g key={code}>
            <Box x={x} y={50} w={270} h={150} fill={hot ? BRAND : SURFACE} fillOpacity={hot ? 0.1 : 1} stroke={hot ? BRAND : EDGE} />
            <Txt x={x + 135} y={82} s={code} size={15} fill={BRAND} bold />
            <Txt x={x + 135} y={106} s={t1} size={14} bold />
            <Txt x={x + 135} y={130} s={d1} size={11} fill={DIM} />
            <Txt x={x + 135} y={148} s={d2} size={11} fill={DIM} />
            <Txt x={x + 135} y={180} s={wk} size={12} fill={SAGE} bold />
            {i < 4 && <Arrow x1={x + 270} y1={125} x2={x + 300} y2={125} id="ah2" />}
          </g>
        );
      })}
      <Txt x={780} y={255} s="P1 sells alone (diagnosis + monitoring) — every deviation found is a quotable P2 line item" size={13} fill={DIM} />
    </svg>
  );
}

const WPS = [
  ['WP1', 'Website rebuild', 'tech baseline + content pool', 'citation · presence'],
  ['WP2', 'Crawler & index', 'robots 8 UA · GSC · Bing · IndexNow', 'citation · presence'],
  ['WP3', 'Authority sources', 'Wikidata · Wikipedia · listings', 'new sources · accuracy'],
  ['WP4', 'Platform content', 'unified bios · steady publishing', 'SOV · sentiment'],
  ['WP5', 'Corpus correction', 'kill what AI says wrong', 'accuracy · top-of-mind'],
] as const;

export function P2Diagram() {
  return (
    <svg viewBox="0 0 1560 560" className="w-full h-auto" role="img" aria-label="P2 five work packages feeding one corpus and the AI engines">
      <Head id="ah3" />
      {WPS.map(([code, t, d, m], i) => {
        const x = 40 + i * 304;
        return (
          <g key={code}>
            <Box x={x} y={40} w={270} h={140} fill={GOLD} fillOpacity={0.12} stroke={GOLD} />
            <Txt x={x + 135} y={72} s={code} size={15} fill={GOLD} bold />
            <Txt x={x + 135} y={96} s={t} size={13.5} bold />
            <Txt x={x + 135} y={120} s={d} size={10.5} fill={DIM} />
            <Txt x={x + 135} y={152} s={`verify: ${m}`} size={10.5} fill={SAGE} />
            <Arrow x1={x + 135} y1={180} x2={x + 135} y2={225} id="ah3" />
          </g>
        );
      })}
      <Box x={120} y={230} w={1320} h={80} fill={BRAND} fillOpacity={0.1} stroke={BRAND} />
      <Txt x={780} y={265} s="ONE AUTHORITATIVE CORPUS" size={16} fill={BRAND} bold spacing={2} />
      <Txt x={780} y={290} s="single fact source · single wording · every channel consistent" size={12} fill={DIM} />
      <Arrow x1={780} y1={310} x2={780} y2={355} id="ah3" />
      <Box x={120} y={360} w={1320} h={90} fill={SURFACE} stroke={EDGE} />
      <Txt x={780} y={395} s="AI ENGINES" size={15} bold spacing={2} />
      <Txt x={780} y={420} s="ChatGPT · Perplexity · Gemini · Google AI Overview · Copilot" size={12.5} fill={DIM} />
      <Txt x={780} y={440} s="retrieval engines respond first (2–6 wks) — model training follows (months)" size={11.5} fill={SAGE} />
      <Txt x={780} y={505} s="AI fills vacuum with whatever it finds — whoever supplies the corpus owns the answer" size={14} fill={BRAND} bold />
    </svg>
  );
}

export function TimelineDiagram() {
  const marks: Array<[number, string]> = [[60, 'W0'], [300, 'W1'], [540, 'W2'], [900, 'W6'], [1140, 'W8'], [1440, 'W12']];
  const bars: Array<[number, number, string, boolean, number]> = [
    [60, 240, 'Day-0 scan + onboarding + fact sheet + freeze', true, 110],
    [300, 240, 'WP2 crawler switches (48-hour sprint)', false, 110],
    [540, 600, 'WP1 website · WP3 authority sources · WP4 content supply', false, 180],
    [540, 900, 'weekly scans + WP5 rolling corpus correction', true, 250],
  ];
  const reviews: Array<[number, string]> = [[540, 'M1 review'], [1140, 'M2 review'], [1440, 'M3 = 90-day acceptance']];
  return (
    <svg viewBox="0 0 1560 360" className="w-full h-auto" role="img" aria-label="90-day standard timeline">
      <line x1={60} y1={80} x2={1500} y2={80} stroke={EDGE} strokeWidth={3} />
      {marks.map(([mx, lab]) => (
        <g key={lab}>
          <line x1={mx} y1={72} x2={mx} y2={88} stroke={BRAND} strokeWidth={2.5} />
          <Txt x={mx} y={60} s={lab} size={12.5} fill={BRAND} bold />
        </g>
      ))}
      {bars.map(([bx, bw, lab, hot, y]) => (
        <g key={lab}>
          <rect x={bx} y={y} width={bw} height={44} rx={7} fill={hot ? BRAND : GOLD} fillOpacity={0.12} stroke={hot ? BRAND : GOLD} strokeWidth={1.5} />
          <Txt x={bx + bw / 2} y={y + 27} s={lab} size={11.5} />
        </g>
      ))}
      {reviews.map(([mx, lab]) => (
        <g key={lab}>
          <circle cx={mx} cy={80} r={9} fill={BRAND} />
          <line x1={mx} y1={89} x2={mx} y2={295} stroke={BRAND} strokeWidth={1.2} strokeDasharray="4 4" />
          <Txt x={mx} y={325} s={lab} size={12} fill={BRAND} bold />
        </g>
      ))}
      <Txt x={780} y={30} s="success = reproduce the curve shape: citation leads, presence follows" size={13} fill={SAGE} bold />
    </svg>
  );
}
