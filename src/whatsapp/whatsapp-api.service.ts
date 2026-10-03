import { Injectable, Logger } from '@nestjs/common';
import { ListSection, MessagingClient, OutboundMessage } from '../bot/outbound';
import { PrismaService } from '../prisma/prisma.service';

const API_VERSION = 'v21.0';

/** Flattens rows across sections and re-chunks them so the total row count
 *  never exceeds `max`, dropping (and logging via the caller) anything past
 *  that — the official Cloud API rejects the whole message otherwise. */
function capListSections(sections: ListSection[], max: number): ListSection[] {
  const out: ListSection[] = [];
  let remaining = max;
  for (const s of sections) {
    if (remaining <= 0) break;
    const rows = s.rows.slice(0, remaining);
    if (rows.length > 0) out.push({ ...s, rows });
    remaining -= rows.length;
  }
  return out;
}

/**
 * Thin client over the WhatsApp Cloud API (Meta Graph API). Renders our
 * channel-agnostic OutboundMessage union into Graph API payloads.
 * Credentials are resolved per business (each business has its own Meta
 * phone number/token), mirroring WhapiApiService.
 */
@Injectable()
export class WhatsappApiService {
  private readonly logger = new Logger(WhatsappApiService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async credentials(
    businessId: string,
  ): Promise<{ phoneNumberId: string; accessToken: string }> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { metaPhoneNumberId: true, metaAccessToken: true },
    });
    return {
      phoneNumberId: business?.metaPhoneNumberId ?? '',
      accessToken: business?.metaAccessToken ?? '',
    };
  }

  async sendText(businessId: string, to: string, body: string): Promise<void> {
    await this.post(businessId, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    });
  }

  async send(businessId: string, to: string, message: OutboundMessage): Promise<void> {
    switch (message.kind) {
      case 'text':
        return this.sendText(businessId, to, message.body);
      case 'buttons':
        return this.post(businessId, {
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            ...(message.header ? { header: { type: 'text', text: message.header } } : {}),
            body: { text: message.body },
            ...(message.footer ? { footer: { text: message.footer } } : {}),
            action: {
              buttons: message.buttons.slice(0, 3).map((b) => ({
                type: 'reply',
                reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
              })),
            },
          },
        });
      case 'list':
        return this.post(businessId, {
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'list',
            ...(message.header ? { header: { type: 'text', text: message.header } } : {}),
            body: { text: message.body },
            ...(message.footer ? { footer: { text: message.footer } } : {}),
            action: {
              button: message.button.slice(0, 20),
              // The official Cloud API caps rows at 10 TOTAL across every
              // section (not 10 per section like some unofficial clients
              // allow) — truncate here so this transport alone enforces it.
              sections: capListSections(message.sections, 10).map((s) => ({
                title: s.title.slice(0, 24),
                rows: s.rows.map((r) => ({
                  id: r.id.slice(0, 200),
                  title: r.title.slice(0, 24),
                  ...(r.description ? { description: r.description.slice(0, 72) } : {}),
                })),
              })),
            },
          },
        });
    }
  }

  async sendMany(businessId: string, to: string, messages: OutboundMessage[]): Promise<void> {
    for (const m of messages) {
      await this.send(businessId, to, m);
    }
  }

  /** Bind to one business, returning a MessagingClient with the plain
   *  (to, message) signature that DispatchService/OrderStatusService expect. */
  forBusiness(businessId: string): MessagingClient {
    return {
      sendText: (to, body) => this.sendText(businessId, to, body),
      send: (to, message) => this.send(businessId, to, message),
      sendMany: (to, messages) => this.sendMany(businessId, to, messages),
    };
  }

  private async post(businessId: string, payload: Record<string, unknown>): Promise<void> {
    const { phoneNumberId, accessToken } = await this.credentials(businessId);
    if (!phoneNumberId || !accessToken) {
      this.logger.warn(
        `WhatsApp not configured for business ${businessId} (missing phoneNumberId/accessToken). Would send: ${JSON.stringify(payload)}`,
      );
      return;
    }

    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Graph API ${res.status}: ${detail}`);
      throw new Error(`WhatsApp send failed: ${res.status}`);
    }
  }
}
