import { Body, Controller, HttpCode, Logger, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../config/configuration';
import { WhapiService } from './whapi.service';
import type { WhapiWebhookBody } from './whapi.types';

/**
 * Receives Whapi.cloud webhooks. Unlike Meta, Whapi has no verification
 * handshake or built-in request signing — protect the endpoint by putting
 * a shared secret in the webhook URL you configure in the Whapi dashboard,
 * e.g. https://<your-domain>/webhook/whapi?secret=<WHAPI_WEBHOOK_SECRET>.
 */
@Controller('webhook/whapi')
export class WhapiController {
  private readonly logger = new Logger(WhapiController.name);

  constructor(
    private readonly whapiService: WhapiService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Query('secret') secret: string | undefined,
    @Body() body: WhapiWebhookBody,
  ): Promise<{ received: true }> {
    this.assertSecret(secret);

    // Ack fast; process out of band so Whapi never times out / retries.
    void this.whapiService.processWebhook(body);
    return { received: true };
  }

  private assertSecret(provided: string | undefined): void {
    const expected = this.config.get('whapi', { infer: true }).webhookSecret;
    if (!expected) return; // verification disabled until WHAPI_WEBHOOK_SECRET is set

    const bufA = Buffer.from(provided ?? '');
    const bufB = Buffer.from(expected);
    const ok = bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
    if (!ok) {
      this.logger.warn('Rejected Whapi webhook: invalid or missing secret');
      throw new UnauthorizedException();
    }
  }
}
