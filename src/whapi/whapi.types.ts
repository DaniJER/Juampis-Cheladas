import type { InboundMessage } from '../whatsapp/whatsapp.types';

/**
 * Minimal shape of a Whapi.cloud webhook payload we rely on.
 * Docs: https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/incoming-message
 */
export interface WhapiWebhookBody {
  messages?: WhapiInboundRaw[];
  event?: { type?: string; event?: string };
  channel_id?: string;
}

export interface WhapiInboundRaw {
  id: string;
  from_me: boolean;
  type: string; // 'text' | 'reply' | ...
  chat_id?: string;
  from?: string;
  from_name?: string;
  timestamp?: number;
  text?: { body?: string };
  reply?: {
    type?: string; // 'buttons_reply' | 'list_reply'
    buttons_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
}

/**
 * Whapi (Baileys-based) sometimes wraps the custom id we sent with a
 * protocol prefix (observed: "ButtonsV3:<our id>"). Strip it defensively
 * so it still matches the plain ids the bot engine expects
 * (e.g. "qty:5", "ord:<id>:ACCEPT"). Unverified against the live API yet —
 * revisit once we've tested against a real channel.
 */
function stripReplyPrefix(id: string): string {
  return id.replace(/^[A-Za-z]+V3:/, '');
}

export function parseWebhook(body: WhapiWebhookBody): InboundMessage[] {
  if (body.event?.type && body.event.type !== 'messages') return [];

  const out: InboundMessage[] = [];
  for (const raw of body.messages ?? []) {
    if (raw.from_me) continue; // ignore messages we sent ourselves
    if (!raw.from) continue;
    out.push(normalizeInbound(raw));
  }
  return out;
}

function normalizeInbound(raw: WhapiInboundRaw): InboundMessage {
  let text = '';
  let replyId: string | undefined;

  switch (raw.type) {
    case 'text':
      text = raw.text?.body ?? '';
      break;
    case 'reply': {
      const br = raw.reply?.buttons_reply;
      const lr = raw.reply?.list_reply;
      if (br) {
        replyId = br.id ? stripReplyPrefix(br.id) : undefined;
        text = br.title ?? '';
      } else if (lr) {
        replyId = lr.id ? stripReplyPrefix(lr.id) : undefined;
        text = lr.title ?? '';
      }
      break;
    }
    default:
      text = '';
  }

  return {
    messageId: raw.id,
    from: raw.from!,
    contactName: raw.from_name,
    text,
    replyId,
    type: raw.type,
  };
}
