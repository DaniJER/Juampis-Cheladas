import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { ConversationModule } from '../conversation/conversation.module';
import { OrdersModule } from '../orders/orders.module';
import { WhapiApiService } from './whapi-api.service';
import { WhapiDispatchService } from './whapi-dispatch.service';
import { WhapiController } from './whapi.controller';
import { WhapiService } from './whapi.service';

/**
 * Prototype channel: WhatsApp via Whapi.cloud (unofficial, QR-linked
 * device) instead of the Meta Cloud API. Fully parallel to WhatsappModule
 * — shares BotModule/ConversationModule/OrdersModule (same conversations
 * and orders) but has its own transport and staff-dispatch. Safe to
 * remove without touching the Meta path; see whapi-dispatch.service.ts.
 */
@Module({
  imports: [BotModule, ConversationModule, OrdersModule],
  controllers: [WhapiController],
  providers: [WhapiApiService, WhapiDispatchService, WhapiService],
})
export class WhapiModule {}
