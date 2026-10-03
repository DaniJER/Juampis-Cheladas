import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import type { WhatsappWebhookBody } from './whatsapp.types';

/**
 * Receives WhatsApp Cloud API (Meta) webhooks, one route per business —
 * mirrors WhapiController. Each business has its own metaVerifyToken (for
 * the GET handshake) and metaAppSecret (for the HMAC signature on every
 * POST), both stored on its Business row rather than a global env var.
 */
@Controller('webhook/meta/:businessId')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly prisma: PrismaService,
  ) {}

  /** Meta webhook verification handshake. */
  @Get()
  async verify(
    @Param('businessId') businessId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { isActive: true, metaVerifyToken: true },
    });
    const expected = business?.isActive ? business.metaVerifyToken : undefined;
    if (mode === 'subscribe' && expected && token === expected) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Param('businessId') businessId: string,
    @Req() req: Request,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: WhatsappWebhookBody,
  ): Promise<string> {
    if (!(await this.verifySignature(businessId, req, signature))) {
      this.logger.warn(`Rejected webhook for business ${businessId}: invalid X-Hub-Signature-256`);
      return 'EVENT_RECEIVED';
    }

    // Ack fast; process out of band so Meta never times out / retries.
    void this.whatsappService.processWebhook(businessId, body);
    return 'EVENT_RECEIVED';
  }

  private async verifySignature(
    businessId: string,
    req: Request,
    signature?: string,
  ): Promise<boolean> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { isActive: true, metaAppSecret: true },
    });
    if (!business?.isActive) return false;

    const secret = business.metaAppSecret;
    if (!secret) return true; // verification disabled until a meta app secret is set

    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!signature || !raw) return false;

    const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
