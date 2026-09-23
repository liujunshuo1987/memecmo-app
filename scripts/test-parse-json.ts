// Regression cases for parseJsonFromLLM (run: npx tsx scripts/test-parse-json.ts)
import { parseJsonFromLLM, repairJsonStrings } from '../lib/llm/poe';
let fails = 0;
const check = (name: string, fn: () => unknown, expect: (v: any) => boolean) => {
  try { const v = fn(); if (expect(v)) console.log('ok  ', name); else { fails++; console.log('FAIL', name, JSON.stringify(v).slice(0, 120)); } }
  catch (e) { fails++; console.log('FAIL', name, '→', e instanceof Error ? e.message.slice(0, 160) : e); }
};
// 1. outer fence with an INNER ```json fence inside a markdown string (the 2026-09-23 optimize/distribute failure)
const inner = '```json\n{\n  "title": "GEO 指南",\n  "articleMarkdown": "## 步骤\\n\\n加上 schema：\\n\\n```json\\n{\\"@type\\": \\"FAQPage\\"}\\n```\\n\\n完。",\n  "faq": [{"question": "q", "answer": "a"}]\n}\n```';
check('inner code fence inside string', () => parseJsonFromLLM<any>(inner), (v) => v.title === 'GEO 指南' && v.articleMarkdown.includes('FAQPage') && v.faq.length === 1);
// 2. raw newlines inside a string literal
const rawNl = '```json\n{"title": "x", "body": "line one\nline two\n\ttabbed", "n": 2}\n```';
check('raw newlines/tabs in string', () => parseJsonFromLLM<any>(rawNl), (v) => v.body === 'line one\nline two\n\ttabbed' && v.n === 2);
// 3. markdown escapes that are illegal JSON escapes
const badEsc = '{"md": "use \\*bold\\* and snake\\_case 100\\%"}';
check('illegal escapes \\* \\_ \\%', () => parseJsonFromLLM<any>(badEsc), (v) => v.md === 'use \\*bold\\* and snake\\_case 100\\%');
// 4. legal escapes untouched
check('legal escapes preserved', () => parseJsonFromLLM<any>('{"a": "q\\"uote \\\\ back \\n nl \\u00e9"}'), (v) => v.a === 'q"uote \\ back \n nl é');
// 5. truncated output still salvages the balanced prefix
const trunc = '```json\n{"targets": [{"domain": "a.com", "title": "t1"}, {"domain": "b.com", "title": "t2"}], "note": "cut off he';
check('truncated → balanced prefix', () => parseJsonFromLLM<any>(trunc), (v) => Array.isArray(v.targets) && v.targets.length === 2);
// 6. prose around the JSON
check('prose around json', () => parseJsonFromLLM<any>('Here you go:\n{"ok": true}\nThanks!'), (v) => v.ok === true);
// 7. repair leaves structure alone
check('repair keeps structure', () => repairJsonStrings('{"a":[1,2],"b":{"c":"x\ny"}}'), (v) => v === '{"a":[1,2],"b":{"c":"x\\ny"}}');
// 8. truncated right after a key
check('truncated after key', () => parseJsonFromLLM<any>('{"a": [1, 2, {"b": "c"}], "d":'), (v) => v.a.length === 3 && v.d === undefined);
// 9. truncated inside a nested array of objects
check('truncated mid-object', () => parseJsonFromLLM<any>('{"targets": [{"domain": "a.com"}, {"domain": "b.co'), (v) => v.targets.length === 2 && v.targets[1].domain === 'b.co');
// 10. unescaped inner quotes: a JSON-LD example pasted into the article (the 2026-09-23 content failure)
const innerQuotes = '```json\n{\n  "title": "GEO 指南",\n  "articleMarkdown": "加上结构化数据，例如 {"@type": "FAQPage", "name": "常见问题"} 这样的标记，AI 更容易引用。",\n  "faq": [{"question": "为什么要用 "schema"？", "answer": "因为 AI 引擎读它。"}]\n}\n```';
check('unescaped inner quotes (JSON-LD example)', () => parseJsonFromLLM<any>(innerQuotes), (v) => v.articleMarkdown.includes('"@type": "FAQPage"') && v.faq[0].question === '为什么要用 "schema"？' && v.faq[0].answer.startsWith('因为'));
// 11. prose with quoted list items inside a value
check('quoted list in prose', () => parseJsonFromLLM<any>('{"a": "例如 "x", "y" 等词", "b": 1}'), (v) => v.a === '例如 "x", "y" 等词' && v.b === 1);
// 12. array of strings with an inner quote
check('inner quote in array string', () => parseJsonFromLLM<any>('{"tags": ["say "hi" now", "plain"]}'), (v) => v.tags[0] === 'say "hi" now' && v.tags[1] === 'plain');
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
