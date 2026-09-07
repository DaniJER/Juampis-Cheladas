import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { OutboundMessage } from '../bot/outbound';

/**
 * Thin client over Whapi.cloud (unofficial WhatsApp Web automation, no
 * Meta Cloud API involved — see https://whapi.cloud/docs). Same contract
 * as WhatsappApiService so the two channels are interchangeable from the
 * orchestrator's point of view.
 */
@Injectable()
export class WhapiApiService {
  private readonly logger = new Logger(WhapiApiService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get whapi() {
    return this.config.get('whapi', { infer: true });
  }

  get configured(): boolean {
    return Boolean(this.whapi.token);
  }

  /** waId is plain digits (e.g. "573001112233"); Whapi wants the JID form. */
  private toChatId(waId: string): string {
    return waId.includes('@') ? waId : `${waId}@s.whatsapp.net`;
  }

  async sendText(to: string, body: string): Promise<void> {
    await this.post('/messages/text', {
      to: this.toChatId(to),
      body,
    });
  }

  async send(to: string, message: OutboundMessage): Promise<void> {
    const chatId = this.toChatId(to);
    switch (message.kind) {
      case 'text':
        return this.sendText(to, message.body);
      case 'buttons':
        return this.post('/messages/interactive', {
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
        return this.post('/messages/interactive', {
          to: chatId,
          type: 'list',
          ...(message.header ? { header: { text: message.header } } : {}),
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: {
            label: message.button.slice(0, 20),
            sections: message.sections.map((s) => ({
              title: s.title.slice(0, 24),
              rows: s.rows.slice(0, 10).map((r) => ({
                id: r.id.slice(0, 200),
                title: r.title.slice(0, 24),
                ...(r.description ? { description: r.description.slice(0, 72) } : {}),
              })),
            })),
          },
        });
    }
  }

  async sendMany(to: string, messages: OutboundMessage[]): Promise<void> {
    for (const m of messages) {
      await this.send(to, m);
    }
  }

  private async post(path: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.configured) {
      this.logger.warn(
        `Whapi not configured (missing WHAPI_TOKEN). Would send: ${JSON.stringify(payload)}`,
      );
      return;
    }

    const res = await fetch(`${this.whapi.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.whapi.token}`,
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
