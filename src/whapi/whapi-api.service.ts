import { Injectable, Logger } from '@nestjs/common';
import { MessagingClient, OutboundMessage } from '../bot/outbound';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Thin client over Whapi.cloud (unofficial WhatsApp Web automation, no
 * Meta Cloud API involved — see https://whapi.cloud/docs). Same contract
 * as WhatsappApiService (MessagingClient) so the two channels are
 * interchangeable from the orchestrator's point of view. Credentials are
 * resolved per business (each business has its own Whapi channel/token)
 * rather than from global env config.
 */
@Injectable()
export class WhapiApiService {
  private readonly logger = new Logger(WhapiApiService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async credentials(businessId: string): Promise<{ baseUrl: string; token: string }> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { whapiBaseUrl: true, whapiToken: true },
    });
    return {
      baseUrl: business?.whapiBaseUrl || 'https://gate.whapi.cloud',
      token: business?.whapiToken ?? '',
    };
  }

  /** waId is plain digits (e.g. "573001112233"); Whapi wants the JID form. */
  private toChatId(waId: string): string {
    return waId.includes('@') ? waId : `${waId}@s.whatsapp.net`;
  }

  async sendText(businessId: string, to: string, body: string): Promise<void> {
    await this.post(businessId, '/messages/text', {
      to: this.toChatId(to),
      body,
    });
  }

  async send(businessId: string, to: string, message: OutboundMessage): Promise<void> {
    const chatId = this.toChatId(to);
    switch (message.kind) {
      case 'text':
        return this.sendText(businessId, to, message.body);
      case 'buttons':
        return this.post(businessId, '/messages/interactive', {
          to: chatId,
          type: 'button',
          ...(message.header ? { header: { text: message.header } } : {}),
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: {
            buttons: message.buttons.slice(0, 3).map((b) => ({
              type: 'quick_reply',
              id: b.id.slice(0, 256),
              title: b.title.slice(0, 25),
            })),
          },
        });
      case 'list':
        return this.post(businessId, '/messages/interactive', {
          to: chatId,
          type: 'list',
          ...(message.header ? { header: { text: message.header } } : {}),
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: {
            list: {
              label: message.button.slice(0, 20),
              sections: message.sections.map((s) => ({
                title: s.title.slice(0, 24),
                rows: s.rows.slice(0, 10).map((r) => ({
                  id: r.id.slice(0, 200),
                  title: r.title.slice(0, 24),
                  ...(r.description
                    ? { description: r.description.slice(0, 72) }
                    : {}),
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
   *  (to, message) signature that DispatchService and the engine expect. */
  forBusiness(businessId: string): MessagingClient {
    return {
      sendText: (to, body) => this.sendText(businessId, to, body),
      send: (to, message) => this.send(businessId, to, message),
      sendMany: (to, messages) => this.sendMany(businessId, to, messages),
    };
  }

  private async post(
    businessId: string,
    path: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { baseUrl, token } = await this.credentials(businessId);
    if (!token) {
      this.logger.warn(
        `Whapi not configured for business ${businessId} (missing token). Would send: ${JSON.stringify(payload)}`,
      );
      return;
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Whapi ${res.status}: ${detail}`);
      throw new Error(`Whapi send failed: ${res.status}`);
    }
  }
}
