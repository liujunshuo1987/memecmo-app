// Transactional email via Resend. Invite sending is best-effort by design:
// the API returns emailSent so callers always fall back to the copyable link.
//
// Sender: INVITE_FROM_EMAIL env (e.g. "MemeCMO <invites@memecmo.ai>", requires
// the domain to be verified in Resend). Defaults to the Resend sandbox sender,
// which only delivers to the account owner's own mailbox — fine for internal
// testing, not for real clients until the domain is verified.

import { Resend } from 'resend';

const FROM = process.env.INVITE_FROM_EMAIL || 'MemeCMO <onboarding@resend.dev>';

export interface InviteEmailArgs {
  to: string;
  orgName: string;
  role: string;
  acceptUrl: string;
  expiresAt?: string; // ISO
}

function inviteHtml({ orgName, role, acceptUrl, expiresAt }: InviteEmailArgs): string {
  const expiry = expiresAt ? new Date(expiresAt).toISOString().slice(0, 10) : null;
  // Atelier day palette, inline styles only (email clients strip <style>).
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#FBF7F4;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:11px;letter-spacing:3px;color:#9C8E8A;text-transform:uppercase;margin-bottom:18px;">MemeCMO &middot; GEO</div>
    <div style="background:#FFFFFF;border:1px solid rgba(58,30,34,0.12);border-radius:14px;padding:28px;">
      <h1 style="margin:0 0 6px;font-size:19px;color:#2A2024;">You're invited to join ${escapeHtml(orgName)}</h1>
      <p style="margin:0 0 4px;font-size:13px;color:#6E625F;">B&#7841;n &#273;&#432;&#7907;c m&#7901;i tham gia kh&#244;ng gian l&#224;m vi&#7879;c GEO c&#7911;a ${escapeHtml(orgName)}.</p>
      <p style="margin:12px 0 20px;font-size:14px;color:#2A2024;line-height:1.55;">
        You've been invited as <strong>${escapeHtml(role)}</strong> on the MemeCMO GEO platform &mdash;
        AI-visibility measurement, reports and content for your brand.
      </p>
      <a href="${acceptUrl}" style="display:block;text-align:center;background:#C76B7A;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:12px 18px;border-radius:10px;">Accept invitation &middot; Ch&#7845;p nh&#7853;n l&#7901;i m&#7901;i</a>
      <p style="margin:18px 0 0;font-size:12px;color:#9C8E8A;line-height:1.6;">
        This invitation is addressed to this email and${expiry ? ` expires on ${expiry}` : ' expires in 14 days'}.<br/>
        If the button doesn't work, open this link:<br/>
        <a href="${acceptUrl}" style="color:#C76B7A;word-break:break-all;">${acceptUrl}</a>
      </p>
    </div>
    <p style="margin:16px 0 0;font-size:11px;color:#9C8E8A;text-align:center;">MemeCMO.ai &mdash; Generative Engine Optimization</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Send the invite email. Never throws — returns whether it was accepted by Resend. */
export async function sendInviteEmail(args: InviteEmailArgs): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: 'RESEND_API_KEY not configured' };
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({
      from: FROM,
      to: [args.to],
      subject: `Invitation to join ${args.orgName} · MemeCMO GEO`,
      html: inviteHtml(args),
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
