// Build the en/vi PDFs of the sources list from data/sources/<market>-latest.json:
// Markdown → pandoc docx → LibreOffice PDF. Output: public/sources/ (served
// by the page) and a copy next to the other deliverables in Downloads.
//   npx tsx scripts/sources-pdf.ts --market VN
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { copyFor, TYPE_LABEL, type Lang } from '../lib/sources/copy';

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const MARKET = arg('market', 'VN').toLowerCase();
const d = JSON.parse(readFileSync(`data/sources/${MARKET}-latest.json`, 'utf8'));
const OUT = 'public/sources'; mkdirSync(OUT, { recursive: true });
const DELIV = '/Users/sx/Downloads/09_GEO企业出海';

for (const lang of ['en', 'vi'] as Lang[]) {
  const c = copyFor(lang, d);
  const url = `https://app.memecmo.ai/sources/vietnam${lang === 'vi' ? '/vi' : ''}`;
  const md = [
    `# ${c.title}`, '', `*${c.subtitle}*`, '', `${c.updated}: ${d.generatedAt.slice(0, 10)} · ${url}`, '', c.intro, '',
    '| ' + c.kpis.map((k) => k.label).join(' | ') + ' |', '|' + c.kpis.map(() => '---').join('|') + '|', '| ' + c.kpis.map((k) => k.value).join(' | ') + ' |', '',
    `| ${c.columns.rank} | ${c.columns.domain} | ${c.columns.type} | ${c.columns.tier} | ${c.columns.answers} | ${c.columns.share} | ${c.columns.engines} | ${c.columns.projects} | ${c.columns.stability} |`,
    '|---|---|---|---|---:|---:|---:|---:|---:|',
    ...d.rows.map((r: any) => `| ${r.rank} | ${r.domain} | ${TYPE_LABEL[lang][r.type] ?? r.type} | ${r.tier} | ${r.answers} / ${d.basis.answersWithCitations} | ${r.share}% | ${r.engines} / ${d.basis.engines.length} | ${r.projects} / ${d.basis.projects} | ${r.firstHalf} / ${r.secondHalf} |`),
    '', c.shareNote, '', c.tierLegend, '',
    `## ${c.methodologyTitle}`, '', ...c.methodology.map((p) => `- ${p}`), '',
    `## ${c.useTitle}`, '', ...c.use.map((p) => `- ${p}`), '',
    `## ${c.faqTitle}`, '', ...c.faq.flatMap((f) => [`**${f.q}**`, '', f.a, '']),
    '---', '', c.footer, '',
  ].join('\n');
  const base = `MemeCMO_Vietnam_AI_Sources_${d.month}_${lang}`;
  writeFileSync(`${OUT}/${base}.md`, md);
  execSync(`pandoc "${OUT}/${base}.md" -o "${OUT}/${base}.docx"`, { stdio: 'inherit' });
  execSync(`soffice --headless --convert-to pdf --outdir "${OUT}" "${OUT}/${base}.docx" >/dev/null 2>&1`, { stdio: 'inherit' });
  copyFileSync(`${OUT}/${base}.pdf`, `${DELIV}/${base}.pdf`);
  console.log('built', `${OUT}/${base}.pdf`, '→', `${DELIV}/${base}.pdf`);
}
