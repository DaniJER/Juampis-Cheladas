import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { ConversationModule } from '../conversation/conversation.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { OrdersModule } from '../orders/orders.module';
import { WeatherModule } from '../weather/weather.module';
import { WhapiApiModule } from './whapi-api.module';
import { WhapiController } from './whapi.controller';
import { WhapiService } from './whapi.service';

/**
 * Prototype channel: WhatsApp via Whapi.cloud (unofficial, QR-linked
 * device) instead of the Meta Cloud API. Fully parallel to WhatsappModule
 * — shares BotModule/ConversationModule/OrdersModule/DispatchModule (same
 * conversations, orders and staff-dispatch logic) but has its own
 * transport (WhapiApiService, via WhapiApiModule).
 */
@Module({
  imports: [
    BotModule,
    ConversationModule,
    OrdersModule,
    DispatchModule,
    WeatherModule,
    WhapiApiModule,
  ],
  controllers: [WhapiController],
  providers: [WhapiService],
})
export class WhapiModule {}
