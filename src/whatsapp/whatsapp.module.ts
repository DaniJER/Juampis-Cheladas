import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { ConversationModule } from '../conversation/conversation.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { OrdersModule } from '../orders/orders.module';
import { WhatsappApiModule } from './whatsapp-api.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [
    WhatsappApiModule,
    BotModule,
    ConversationModule,
    OrdersModule,
    DispatchModule,
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService],
})
export class WhatsappModule {}
