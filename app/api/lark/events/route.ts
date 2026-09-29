// POST /api/lark/events — Lark event + callback endpoint for "GEO Assistant (MemeCMO)".
//
// Tech plan v1.0 §3. Lark sends:
//   • url_verification — answered with the challenge (Lark checks this when IT saves the URL);
//   • im.message.receive_v1 — only messages that @ the bot (scope group_at_msg) or DM it;
//     stored once (event_id is unique, so Lark's retries are no-ops) and handled by
//     the Inngest worker, so this endpoint always answers well inside Lark's 3 s;
//   • card.action.trigger — the Xác nhận / Hủy buttons; answered synchronously with
//     a toast and the updated card.
// Security: bodies must be encrypted with the app's Encrypt Key (decryption itself
// proves the sender holds it); the Verification Token must match; the
// X-Lark-Signature header is checked whenever Lark sends it.

import { NextRequest, NextResponse } from 'next/server';
import { serviceClient } from '@/lib/commerce';
import { inngest } from '@/lib/inngest/client';
import { larkConfigured, larkDecrypt, larkSignatureOk, larkTokenOk } from '@/lib/lark';
import { handleLarkCardAction } from '@/lib/lark-bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!larkConfigured()) return NextResponse.json({ error: 'Lark app not configured' }, { status: 503 });
  const raw = await req.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }); }
  if (typeof body?.encrypt !== 'string') return NextResponse.json({ error: 'Encrypted body required' }, { status: 400 });

  let payload: any;
  try { payload = JSON.parse(larkDecrypt(body.encrypt)); } catch { return NextResponse.json({ error: 'Cannot decrypt' }, { status: 401 }); }
  if (req.headers.get('x-lark-signature') && !larkSignatureOk(req.headers, raw)) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  }

  if (payload?.type === 'url_verification') {
    if (!larkTokenOk(payload.token)) return NextResponse.json({ error: 'Bad token' }, { status: 401 });
    return NextResponse.json({ challenge: payload.challenge });
  }

  const header = payload?.header ?? {};
  if (!larkTokenOk(header.token)) return NextResponse.json({ error: 'Bad token' }, { status: 401 });
  const type = String(header.event_type ?? '');
  const event = payload.event ?? {};
  const sb = serviceClient();

  if (type === 'card.action.trigger') {
    try {
      return NextResponse.json(await handleLarkCardAction(sb, event));
    } catch (e) {
      console.error('[lark] card action failed:', e instanceof Error ? e.message : e);
      return NextResponse.json({ toast: { type: 'error', content: 'Lỗi hệ thống, thử lại sau · 系统错误，请稍后重试' } });
    }
  }

  if (type === 'im.message.receive_v1' || type === 'im.chat.member.bot.added') {
    const msg = event.message ?? null;
    const { data: row, error } = await sb
      .from('lark_messages')
      .insert({
        event_id: String(header.event_id ?? ''),
        event_type: type,
        chat_id: msg?.chat_id ?? event.chat_id ?? null,
        message_id: msg?.message_id ?? null,
        sender_open_id: event.sender?.sender_id?.open_id ?? event.operator_id?.open_id ?? null,
        msg_type: msg?.message_type ?? null,
        content: msg ? { content: msg.content, mentions: msg.mentions ?? [], chat_type: msg.chat_type } : event,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return NextResponse.json({}); // a retry of an event we already have
      console.error('[lark] store failed:', error.message);
      return NextResponse.json({ error: 'store failed' }, { status: 500 }); // Lark will retry
    }
    if (type === 'im.message.receive_v1' && row?.id) {
      await inngest.send({ name: 'lark/message.received', data: { rowId: row.id } });
    }
    return NextResponse.json({});
  }

  return NextResponse.json({});
}
