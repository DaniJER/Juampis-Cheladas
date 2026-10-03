import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WhapiService } from './whapi.service';
import type { WhapiWebhookBody } from './whapi.types';

/**
 * Receives Whapi.cloud webhooks, one route per business. Unlike Meta, Whapi
 * has no verification handshake or built-in request signing — protect the
 * endpoint with a per-business shared secret in the webhook URL you
 * configure in that business's Whapi dashboard, e.g.
 * https://<your-domain>/webhook/whapi/<businessId>?secret=<that business's webhookSecret>.
 */
@Controller('webhook/whapi/:businessId')
export class WhapiController {
  private readonly logger = new Logger(WhapiController.name);

  constructor(
    private readonly whapiService: WhapiService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Param('businessId') businessId: string,
    @Query('secret') secret: string | undefined,
    @Body() body: WhapiWebhookBody,
  ): Promise<{ received: true }> {
    await this.assertSecret(businessId, secret);

    // Ack fast; process out of band so Whapi never times out / retries.
    void this.whapiService.processWebhook(businessId, body);
    return { received: true };
  }

  private async assertSecret(businessId: string, provided: string | undefined): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { isActive: true, whapiWebhookSecret: true },
    });
    if (!business || !business.isActive) {
      this.logger.warn(`Rejected Whapi webhook: unknown or inactive business ${businessId}`);
      throw new UnauthorizedException();
    }

    const expected = business.whapiWebhookSecret;
    if (!expected) return; // verification disabled until a webhook secret is set

    const bufA = Buffer.from(provided ?? '');
    const bufB = Buffer.from(expected);
    const ok = bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
    if (!ok) {
      this.logger.warn(`Rejected Whapi webhook for business ${businessId}: invalid or missing secret`);
      throw new UnauthorizedException();
    }
  }
}
