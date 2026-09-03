import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppConfig } from '../config/configuration';
import { WhatsappService } from './whatsapp.service';
import type { WhatsappWebhookBody } from './whatsapp.types';

@Controller('webhook')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Meta webhook verification handshake. */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expected = this.config.get('whatsapp.verifyToken', { infer: true });
    if (mode === 'subscribe' && token === expected) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: Request,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: WhatsappWebhookBody,
  ): Promise<string> {
    if (!this.verifySignature(req, signature)) {
      this.logger.warn('Rejected webhook: invalid X-Hub-Signature-256');
      return 'EVENT_RECEIVED';
    }

    // Ack fast; process out of band so Meta never times out / retries.
    void this.whatsappService.processWebhook(body);
    return 'EVENT_RECEIVED';
  }

  private verifySignature(req: Request, signature?: string): boolean {
    const secret = this.config.get('whatsapp.appSecret', { infer: true });
    if (!secret) return true; // verification disabled until META_APP_SECRET is set

    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!signature || !raw) return false;

    const expected =
      'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
