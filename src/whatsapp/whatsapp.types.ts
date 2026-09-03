/** Minimal shape of the WhatsApp Cloud API webhook payload we rely on. */
export interface WhatsappWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: WhatsappInboundRaw[];
        statuses?: Array<Record<string, unknown>>;
      };
    }>;
  }>;
}

export interface WhatsappInboundRaw {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
}

/** Normalized inbound message after parsing the webhook. */
export interface InboundMessage {
  messageId: string;
  from: string;
  contactName?: string;
  /** Best-effort text: message body, or the title of a tapped button/row. */
  text: string;
  /** id of a tapped interactive button / list row, if any. */
  replyId?: string;
  type: string;
}

export function parseWebhook(body: WhatsappWebhookBody): InboundMessage[] {
  const out: InboundMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;
      const contactName = value.contacts?.[0]?.profile?.name;
      for (const raw of value.messages) {
        out.push(normalizeInbound(raw, contactName));
      }
    }
  }
  return out;
}

function normalizeInbound(raw: WhatsappInboundRaw, contactName?: string): InboundMessage {
  let text = '';
  let replyId: string | undefined;

  switch (raw.type) {
    case 'text':
      text = raw.text?.body ?? '';
      break;
    case 'interactive': {
      const br = raw.interactive?.button_reply;
      const lr = raw.interactive?.list_reply;
      if (br) {
        replyId = br.id;
        text = br.title ?? '';
      } else if (lr) {
        replyId = lr.id;
        text = lr.title ?? '';
      }
      break;
    }
    case 'button':
      // Quick-reply from a template message.
      replyId = raw.button?.payload;
      text = raw.button?.text ?? '';
      break;
    default:
      text = '';
  }

  return {
    messageId: raw.id,
    from: raw.from,
    contactName,
    text,
    replyId,
    type: raw.type,
  };
}
