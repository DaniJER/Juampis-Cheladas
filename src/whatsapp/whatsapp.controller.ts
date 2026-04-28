import { Controller, Get, Query, Res, Post, Body } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import express from 'express';

@Controller('webhook')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: express.Response,
  ) {
    const VERIFY_TOKEN = 'cockteles_granizados_cali';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  @Post()
  async receive(@Body() body: any) {
    await this.whatsappService.processMessage(body);
    return 'EVENT_RECEIVED';
  }
}
