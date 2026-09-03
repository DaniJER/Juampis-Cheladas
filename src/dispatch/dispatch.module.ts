import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { OrdersModule } from '../orders/orders.module';
import { WhatsappApiModule } from '../whatsapp/whatsapp-api.module';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [BotModule, OrdersModule, WhatsappApiModule],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
