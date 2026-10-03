import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { WhatsappApiModule } from '../whatsapp/whatsapp-api.module';
import { OrdersService } from './orders.service';
import { OrderStatusService } from './order-status.service';
import { OrdersController } from './orders.controller';
import { ApiKeyGuard } from './api-key.guard';

@Module({
  imports: [BotModule, WhatsappApiModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStatusService, ApiKeyGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
