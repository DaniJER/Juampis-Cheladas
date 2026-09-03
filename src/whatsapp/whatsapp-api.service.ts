import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { OutboundMessage } from '../bot/outbound';

/**
 * Thin client over the WhatsApp Cloud API (Meta Graph API). Renders our
 * channel-agnostic OutboundMessage union into Graph API payloads.
 */
@Injectable()
export class WhatsappApiService {
  private readonly logger = new Logger(WhatsappApiService.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get wa() {
    return this.config.get('whatsapp', { infer: true });
  }

  private get endpoint(): string {
    const { apiVersion, phoneNumberId } = this.wa;
    return `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  }

  get configured(): boolean {
    return Boolean(this.wa.phoneNumberId && this.wa.accessToken);
  }

  async sendText(to: string, body: string): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    });
  }

  async send(to: string, message: OutboundMessage): Promise<void> {
    switch (message.kind) {
      case 'text':
        return this.sendText(to, message.body);
      case 'buttons':
        return this.post({
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
        return this.post({
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
              sections: message.sections.map((s) => ({
                title: s.title.slice(0, 24),
                rows: s.rows.slice(0, 10).map((r) => ({
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

  async sendMany(to: string, messages: OutboundMessage[]): Promise<void> {
    for (const m of messages) {
      await this.send(to, m);
    }
  }

  private async post(payload: Record<string, unknown>): Promise<void> {
    if (!this.configured) {
      this.logger.warn(
        `WhatsApp not configured (missing phoneNumberId/accessToken). Would send: ${JSON.stringify(payload)}`,
      );
      return;
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.wa.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      this.logger.error(`Graph API ${res.status}: ${detail}`);
      throw new Error(`WhatsApp send failed: ${res.status}`);
    }
  }
}
