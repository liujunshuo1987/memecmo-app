// Copy for the public "Sources AI engines cite" pages and PDFs (en / vi).
// Wording follows the Measurement Standard v1.1: a citation is the engine
// choosing a page as a source; counts are answers, never URL tallies.

export type Lang = 'en' | 'vi';

export const TYPE_LABEL: Record<Lang, Record<string, string>> = {
  en: { news: 'News media', 'industry media': 'Industry media', community: 'Community', documents: 'Document platform', social: 'Social', reference: 'Reference', 'directory / listing': 'Directory / listing', platform: 'Platform', website: 'Website' },
  vi: { news: 'Báo chí', 'industry media': 'Báo ngành', community: 'Cộng đồng', documents: 'Nền tảng tài liệu', social: 'Mạng xã hội', reference: 'Tra cứu', 'directory / listing': 'Danh bạ / đặt chỗ', platform: 'Nền tảng', website: 'Website' },
};

const monthName = (month: string, lang: Lang) => {
  const [y, m] = month.split('-').map(Number);
  return lang === 'vi' ? `tháng ${m}/${y}` : new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export function copyFor(lang: Lang, d: { month: string; window: { days: number; from: string; to: string }; basis: { projects: number; organizations: number; industries: number; answersWithCitations: number; engines: string[] }; rules: { minProjects: number; volume: number; engines: number; stabilityPerHalf: number }; counts: { t1: number; t2: number; listed: number; candidates: number; brandOwned: number; belowProjects: number } }) {
  const m = monthName(d.month, lang);
  const eng = d.basis.engines.join(', ');
  if (lang === 'vi') return {
    lang, htmlLang: 'vi',
    title: `Các nguồn mà AI trích dẫn tại Việt Nam — ${m}`,
    shortTitle: `Nguồn AI trích dẫn · Việt Nam · ${m}`,
    subtitle: `${eng} dựa vào những website nào khi trả lời người mua Việt Nam. Đo lường thực tế, không khảo sát.`,
    description: `Bảng xếp hạng hằng tháng các website mà ChatGPT, Gemini, Claude, Perplexity và Google AI Overview trích dẫn khi trả lời câu hỏi của người mua tại Việt Nam, đo trên ${d.basis.projects} bộ câu hỏi thương hiệu thuộc ${d.basis.industries} ngành.`,
    intro: `Mỗi tháng, MemeCMO đặt cho các AI engine những câu hỏi người mua thật sự hỏi, trải rộng ${d.basis.industries} ngành tại Việt Nam, và ghi lại mọi nguồn mà chúng trích dẫn. Bảng này chỉ xếp hạng các nguồn xuất hiện ở ít nhất ${d.rules.minProjects} bộ câu hỏi thương hiệu độc lập, nên không thương hiệu hay ngành nào chi phối kết quả. Website thuộc sở hữu của các thương hiệu được theo dõi bị loại ra.`,
    kpis: [
      { label: 'Câu trả lời có trích dẫn', value: d.basis.answersWithCitations.toLocaleString('vi-VN') },
      { label: 'Bộ câu hỏi thương hiệu', value: `${d.basis.projects}` },
      { label: 'Ngành', value: `${d.basis.industries}` },
      { label: 'AI engine', value: `${d.basis.engines.length}` },
      { label: 'Kỳ đo', value: `${d.window.from} → ${d.window.to}` },
    ],
    columns: { rank: '#', domain: 'Nguồn', type: 'Loại', tier: 'Hạng', answers: 'Câu trả lời trích dẫn', share: 'Tỷ lệ', engines: 'Engine', projects: 'Bộ câu hỏi', stability: 'Nửa đầu / nửa sau' },
    shareNote: 'Tỷ lệ = câu trả lời trích dẫn nguồn ÷ tất cả câu trả lời có trích dẫn trong kỳ.',
    tierLegend: `T1 = đạt cả ba tiêu chí: ≥${d.rules.volume} câu trả lời trích dẫn, ≥${d.rules.engines} engine, và xuất hiện ở cả hai nửa kỳ đo (mỗi nửa ≥${d.rules.stabilityPerHalf}). T2 = đạt hai trong ba. Nguồn chỉ đạt một tiêu chí không được liệt kê.`,
    methodologyTitle: 'Cách đo',
    methodology: [
      `Kỳ đo ${d.window.days} ngày (${d.window.from} → ${d.window.to}); ${d.basis.answersWithCitations.toLocaleString('vi-VN')} câu trả lời có trích dẫn từ ${d.basis.projects} bộ câu hỏi thương hiệu, ${d.basis.organizations} tổ chức, ${d.basis.industries} ngành; engine: ${eng}.`,
      'Đơn vị là câu trả lời: một câu trả lời trích dẫn ba trang của cùng một website chỉ tính một. Tên miền phụ được gộp về tên miền chính (e.vnexpress.net → vnexpress.net).',
      `Chỉ công bố nguồn xuất hiện ở ≥${d.rules.minProjects} bộ câu hỏi (quy tắc "mỗi số liệu công bố cần ≥5 khách hàng" trong thỏa thuận dữ liệu của MemeCMO). ${d.counts.belowProjects} nguồn đặc thù ngành và ${d.counts.brandOwned} website thuộc thương hiệu bị loại.`,
      'Đây không phải lưu lượng truy cập hay điểm uy tín. Một trích dẫn nghĩa là engine đã chọn trang đó làm nguồn cho câu trả lời — đúng vị trí mà một thương hiệu cần hiện diện.',
      'Phương pháp theo Tiêu chuẩn đo lường mức hiện diện trên AI của MemeCMO v1.1 (điều 9–10, chỉ mục nguồn và bảng nguồn công khai). Dữ liệu thuộc lớp ③ (chỉ mục trích dẫn) — MemeCMO sở hữu; không có dữ liệu riêng của khách hàng nào trong bảng này.',
    ],
    useTitle: 'Dùng bảng này thế nào',
    use: [
      'Nếu bạn bán hàng tại Việt Nam, các trang trên những website này là nơi AI tìm câu trả lời. Xuất hiện ở đó quan trọng hơn thứ hạng Google truyền thống.',
      'Báo chí T1: bài PR, phỏng vấn, dữ liệu ngành có ngày tháng rõ ràng. Nền tảng tài liệu và cộng đồng: tải báo cáo PDF, trả lời câu hỏi thật. Website của bạn: trang có cấu trúc, FAQ, ngày cập nhật.',
    ],
    faqTitle: 'Câu hỏi thường gặp',
    faq: [
      { q: 'Thế nào là một trích dẫn?', a: 'Khi AI engine đưa đường dẫn tới một trang làm nguồn cho câu trả lời. Chúng tôi ghi lại mọi đường dẫn như vậy trong mỗi lần quét, rồi đếm theo câu trả lời, không đếm theo URL.' },
      { q: 'Vì sao Facebook hay YouTube có trong danh sách nguồn?', a: 'Vì engine thật sự trích dẫn chúng. Danh sách phản ánh hành vi của engine, không phải quan điểm của chúng tôi về chất lượng nguồn. Cột "Loại" giúp bạn tách báo chí khỏi mạng xã hội.' },
      { q: 'Vì sao website ngành của tôi không có ở đây?', a: `Bảng công bố chỉ gồm nguồn xuất hiện ở ≥${d.rules.minProjects} bộ câu hỏi thuộc nhiều ngành. Nguồn đặc thù một ngành có trong báo cáo riêng của từng khách hàng, không công bố.` },
      { q: 'Bao lâu cập nhật một lần?', a: 'Hằng tháng, với kỳ đo trượt 60 ngày, cùng phương pháp và cùng ngưỡng. Thay đổi phương pháp sẽ được ghi rõ theo điều 11 của Tiêu chuẩn.' },
      { q: 'Tôi có thể dùng lại dữ liệu này không?', a: 'Có. Bảng được phát hành theo giấy phép CC BY 4.0: dùng, trích dẫn, xuất bản lại tùy ý, chỉ cần ghi nguồn "MemeCMO — Sources AI engines cite in Vietnam" kèm đường dẫn.' },
    ],
    download: 'Tải PDF', downloadOther: 'English version', standard: 'Tiêu chuẩn đo lường v1.1 (PDF)',
    footer: `Phương pháp: Tiêu chuẩn đo lường mức hiện diện trên AI của MemeCMO v1.1 · Dữ liệu lớp ③ · Giấy phép CC BY 4.0 · © ${new Date().getUTCFullYear()} MemeCMO Tech Limited`,
    updated: 'Cập nhật',
  };
  return {
    lang, htmlLang: 'en',
    title: `Sources AI engines cite in Vietnam — ${m}`,
    shortTitle: `AI-cited sources · Vietnam · ${m}`,
    subtitle: `Which websites ${eng} lean on when they answer Vietnamese buyers. Measured, not surveyed.`,
    description: `Monthly ranking of the websites ChatGPT, Gemini, Claude, Perplexity and Google AI Overview cite when answering buyer questions in Vietnam, measured across ${d.basis.projects} brand panels in ${d.basis.industries} industries.`,
    intro: `Every month MemeCMO asks the AI engines the questions real buyers ask, across ${d.basis.industries} industries in Vietnam, and records every source they cite. This list ranks only the sources that appear across at least ${d.rules.minProjects} independent brand panels, so no single brand or industry shapes it. Sites owned by the tracked brands are excluded.`,
    kpis: [
      { label: 'Answers with citations', value: d.basis.answersWithCitations.toLocaleString('en-US') },
      { label: 'Brand panels', value: `${d.basis.projects}` },
      { label: 'Industries', value: `${d.basis.industries}` },
      { label: 'AI engines', value: `${d.basis.engines.length}` },
      { label: 'Window', value: `${d.window.from} → ${d.window.to}` },
    ],
    columns: { rank: '#', domain: 'Source', type: 'Type', tier: 'Tier', answers: 'Answers citing it', share: 'Share', engines: 'Engines', projects: 'Panels', stability: 'First / second half' },
    shareNote: 'Share = answers citing the source ÷ all answers with citations in the window.',
    tierLegend: `T1 = passes all three tests: ≥${d.rules.volume} citing answers, ≥${d.rules.engines} engines, and present in both halves of the window (≥${d.rules.stabilityPerHalf} each). T2 = two of three. Sources passing one test are not listed.`,
    methodologyTitle: 'How it is measured',
    methodology: [
      `Window of ${d.window.days} days (${d.window.from} → ${d.window.to}); ${d.basis.answersWithCitations.toLocaleString('en-US')} answers with citations from ${d.basis.projects} brand panels, ${d.basis.organizations} organisations, ${d.basis.industries} industries; engines: ${eng}.`,
      'The unit is the answer: an answer citing three pages of one site counts once. Subdomains are merged into the registrable domain (e.vnexpress.net → vnexpress.net).',
      `Only sources cited across ≥${d.rules.minProjects} panels are published (MemeCMO's own "≥5 clients per published figure" rule). ${d.counts.belowProjects} industry-specific sources and ${d.counts.brandOwned} brand-owned sites were excluded.`,
      'This is not traffic and not an authority score. A citation means the engine chose that page as a source for its answer — which is exactly where a brand needs to be present.',
      'Method per the MemeCMO AI Visibility Measurement Standard v1.1 (clauses 9–10, source index and public source list). Data class ③ (citation index), owned by MemeCMO; no client-specific data is in this table.',
    ],
    useTitle: 'How to use it',
    use: [
      'If you sell in Vietnam, the pages on these sites are where AI looks for answers. Being present there matters more than a classic Google ranking.',
      'T1 news: dated PR, interviews, industry data. Document platforms and communities: upload the PDF report, answer real questions. Your own site: structured pages with FAQ and an update date.',
    ],
    faqTitle: 'Frequently asked questions',
    faq: [
      { q: 'What counts as a citation?', a: 'An AI engine returning a link to a page as a source for its answer. We record every such link in every scan, then count answers, not URLs.' },
      { q: 'Why are Facebook or YouTube on a list of sources?', a: 'Because the engines really cite them. The list reflects engine behaviour, not our opinion of source quality. The "Type" column separates news from social platforms.' },
      { q: "Why isn't my industry's trade site here?", a: `The public list only includes sources cited across ≥${d.rules.minProjects} panels from several industries. Industry-specific sources appear in each client's own report and are not published.` },
      { q: 'How often is it updated?', a: 'Monthly, on a rolling 60-day window, with the same method and thresholds. Any change of method is declared per clause 11 of the Standard.' },
      { q: 'Can I reuse the data?', a: 'Yes. The table is released under CC BY 4.0: use, quote and republish freely with attribution to "MemeCMO — Sources AI engines cite in Vietnam" and a link.' },
    ],
    download: 'Download PDF', downloadOther: 'Bản tiếng Việt', standard: 'Measurement Standard v1.1 (PDF)',
    footer: `Method: MemeCMO AI Visibility Measurement Standard v1.1 · Data class ③ · CC BY 4.0 · © ${new Date().getUTCFullYear()} MemeCMO Tech Limited`,
    updated: 'Updated',
  };
}
