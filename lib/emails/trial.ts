// Trial-lifecycle emails (funnel D4). Four touches, then silence:
//   E1 preview-ready  — immediately on preview completion (win back closed tabs)
//   E2 day 1          — interpret the gaps (value, soft CTA)
//   E3 day 3          — FMVN proof story (hard CTA)
//   E4 day 7          — honest close-out; we stop emailing after this
// Language: vi for Vietnam-market projects, en otherwise. All senders are
// the company Resend account via lib/email.sendEmail.

const APP = 'https://app.memecmo.ai';

function shell(inner: string, footerNote: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FBF7F4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="margin-bottom:18px;">
    <img src="${APP}/email-logo.png" width="22" height="22" alt="MemeCMO" style="vertical-align:middle;border:0;border-radius:5px;"/>
    <span style="font-size:11px;letter-spacing:3px;color:#9C8E8A;text-transform:uppercase;vertical-align:middle;margin-left:8px;">MemeCMO</span>
  </div>
  <div style="background:#FFFFFF;border:1px solid rgba(58,30,34,0.12);border-radius:14px;padding:28px;">${inner}</div>
  <p style="margin:14px 0 0;font-size:11px;color:#9C8E8A;text-align:center;line-height:1.6;">MemeCMO Tech Limited · Hong Kong CR No. 80218619<br/>${footerNote}</p>
</div></body></html>`;
}

const FOOTER = {
  en: 'Prefer no more emails? Just reply and say so.',
  vi: 'Không muốn nhận thêm email? Chỉ cần trả lời cho chúng tôi biết.',
};

const BTN = 'display:inline-block;background:#C76B7A;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px;';
const H1 = 'margin:0 0 14px;font-size:18px;color:#2A2024;line-height:1.45;';
const P = 'margin:0 0 14px;font-size:14px;color:#2A2024;line-height:1.7;';
const DIM = 'margin:0 0 14px;font-size:12.5px;color:#6E625F;line-height:1.65;';

export interface TrialEmailCtx {
  brand: string;
  orgSlug: string;
  projectSlug: string;
  lang: 'en' | 'vi';
  score?: number | null;
  gaps?: number | null;
}

const ws = (c: TrialEmailCtx) => `${APP}/workspace/${c.orgSlug}/${c.projectSlug}`;
const upgrade = (c: TrialEmailCtx) => `${APP}/dashboard?billing=${c.orgSlug}`;

export function previewReadyEmail(c: TrialEmailCtx): { subject: string; html: string } {
  const scoreLine = c.score != null
    ? (c.lang === 'vi'
        ? `Chỉ số hiện diện AI của <strong>${c.brand}</strong>: <strong>${c.score}/100</strong>${c.gaps ? ` · ${c.gaps} câu hỏi có ý định mua mà thương hiệu vắng mặt` : ''}.`
        : `<strong>${c.brand}</strong> scored <strong>${c.score}/100</strong>${c.gaps ? ` — with ${c.gaps} high-intent questions where the brand is absent` : ''}.`)
    : '';
  if (c.lang === 'vi') {
    return {
      subject: `Báo cáo hiện diện AI của ${c.brand} đã sẵn sàng`,
      html: shell(`
        <h1 style="${H1}">Bản quét xem trước đã hoàn tất</h1>
        <p style="${P}">${scoreLine}</p>
        <p style="${P}">Xem câu trả lời thực tế của ChatGPT và Google AI Overview, các nguồn được trích dẫn, và những khoảng trống mà đối thủ đang chiếm.</p>
        <p style="margin:18px 0 0;"><a href="${ws(c)}" style="${BTN}">Mở báo cáo →</a></p>`, FOOTER.vi),
    };
  }
  return {
    subject: `${c.brand}'s AI visibility preview is ready`,
    html: shell(`
      <h1 style="${H1}">Your preview scan is complete</h1>
      <p style="${P}">${scoreLine}</p>
      <p style="${P}">See the actual answers ChatGPT and Google AI Overview gave, which sources they cited, and the gaps competitors currently own.</p>
      <p style="margin:18px 0 0;"><a href="${ws(c)}" style="${BTN}">Open your report →</a></p>`, FOOTER.en),
  };
}

export function nurtureD1Email(c: TrialEmailCtx): { subject: string; html: string } {
  const g = c.gaps ?? 0;
  if (c.lang === 'vi') {
    return {
      subject: `${g > 0 ? `${g} khoảng trống` : 'Khoảng trống'} trong câu trả lời AI có nghĩa là gì?`,
      html: shell(`
        <h1 style="${H1}">Khoảng trống ý định cao = khách hàng đang hỏi, AI trả lời bằng tên đối thủ</h1>
        <p style="${P}">Mỗi "khoảng trống" trong báo cáo là một câu hỏi mà người mua thật sự đang hỏi AI — và câu trả lời hiện tại không nhắc đến ${c.brand}.</p>
        <p style="${P}">Ba việc nền tảng có thể làm ngay: xây thư viện câu hỏi chuẩn cho ngành của bạn, tạo nội dung nhắm vào chính các nguồn AI trích dẫn, và đo lại hàng tuần để chứng minh tiến bộ.</p>
        <p style="margin:18px 0 0;"><a href="${ws(c)}" style="${BTN}">Xem lại các khoảng trống →</a></p>`, FOOTER.vi),
    };
  }
  return {
    subject: `What ${g > 0 ? `your ${g} AI answer gaps` : 'your AI answer gaps'} actually mean`,
    html: shell(`
      <h1 style="${H1}">A high-intent gap = a buyer asked, and AI answered with a competitor's name</h1>
      <p style="${P}">Every "gap" in your report is a question real buyers ask AI — where the current answer doesn't mention ${c.brand}.</p>
      <p style="${P}">Three things the platform does about it: build a frozen question panel for your category, engineer content aimed at the exact sources AI cites, and re-measure weekly so progress is provable.</p>
      <p style="margin:18px 0 0;"><a href="${ws(c)}" style="${BTN}">Review your gaps →</a></p>`, FOOTER.en),
  };
}

export function nurtureD3Email(c: TrialEmailCtx): { subject: string; html: string } {
  if (c.lang === 'vi') {
    return {
      subject: 'Focus Media Việt Nam đã tăng hiện diện AI +6,8% trong một tháng như thế nào',
      html: shell(`
        <h1 style="${H1}">Một khách hàng thực, số liệu thực</h1>
        <p style="${P}">Focus Media Việt Nam đo hiện diện AI hàng tuần trên 5 công cụ, sửa các câu trả lời sai (độ chính xác 73% được kiểm định), và tăng chỉ số +6,8% trong tháng đầu vận hành đầy đủ.</p>
        <p style="${P}">Bản xem trước của bạn mới chạy 2/5 công cụ. Gói đầy đủ mở khóa Gemini, Perplexity, Claude, quét hàng tuần tự động và bộ 10 agent sản xuất nội dung.</p>
        <p style="margin:18px 0 0;"><a href="${upgrade(c)}" style="${BTN}">Xem các gói · từ $99/tháng →</a></p>`, FOOTER.vi),
    };
  }
  return {
    subject: 'How Focus Media Vietnam lifted AI visibility +6.8% in a month',
    html: shell(`
      <h1 style="${H1}">A real client, real numbers</h1>
      <p style="${P}">Focus Media Vietnam measures its AI presence weekly across 5 engines, fixes wrong answers (73% audited accuracy), and lifted its index +6.8% in the first full month.</p>
      <p style="${P}">Your preview covered 2 of 5 engines. The full plan unlocks Gemini, Perplexity, Claude, automatic weekly scans, and the ten-agent content suite.</p>
      <p style="margin:18px 0 0;"><a href="${upgrade(c)}" style="${BTN}">See plans · from $99/mo →</a></p>`, FOOTER.en),
  };
}

export function nurtureD7Email(c: TrialEmailCtx): { subject: string; html: string } {
  if (c.lang === 'vi') {
    return {
      subject: `Đường cơ sở của ${c.brand} đã một tuần tuổi`,
      html: shell(`
        <h1 style="${H1}">Email chủ động cuối cùng của chúng tôi</h1>
        <p style="${P}">Câu trả lời của AI thay đổi liên tục — đường cơ sở một tuần tuổi chỉ là ảnh chụp. Nếu hiện diện AI chưa phải ưu tiên bây giờ, không sao cả: dữ liệu xem trước vẫn ở trong không gian làm việc của bạn.</p>
        <p style="${P}">Khi bạn sẵn sàng, hoặc muốn trao đổi trước: <a href="mailto:samchan@memecmo.ai" style="color:#B25A69;">samchan@memecmo.ai</a>. Đây là email chủ động cuối — chúng tôi sẽ không làm phiền thêm.</p>
        <p style="margin:18px 0 0;"><a href="${upgrade(c)}" style="${BTN}">Kích hoạt theo dõi đầy đủ →</a></p>`, FOOTER.vi),
    };
  }
  return {
    subject: `${c.brand}'s baseline is a week old`,
    html: shell(`
      <h1 style="${H1}">Our last proactive email</h1>
      <p style="${P}">AI answers shift constantly — a week-old baseline is a snapshot. If AI visibility isn't a priority right now, that's fine: your preview data stays in your workspace.</p>
      <p style="${P}">Whenever you're ready, or if you'd rather talk first: <a href="mailto:samchan@memecmo.ai" style="color:#B25A69;">samchan@memecmo.ai</a>. This is our last proactive email — no more nudges.</p>
      <p style="margin:18px 0 0;"><a href="${upgrade(c)}" style="${BTN}">Activate full monitoring →</a></p>`, FOOTER.en),
  };
}
