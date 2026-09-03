import { Injectable, Logger } from '@nestjs/common';
import { BotConfigService } from '../bot/bot-config.service';
import { BotEngineService } from '../bot/bot-engine.service';
import { ConversationService } from '../conversation/conversation.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { OrdersService } from '../orders/orders.service';
import { WhatsappApiService } from './whatsapp-api.service';
import { InboundMessage, WhatsappWebhookBody, parseWebhook } from './whatsapp.types';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly api: WhatsappApiService,
    private readonly engine: BotEngineService,
    private readonly conversations: ConversationService,
    private readonly orders: OrdersService,
    private readonly dispatch: DispatchService,
    private readonly botConfig: BotConfigService,
  ) {}

  async processWebhook(body: WhatsappWebhookBody): Promise<void> {
    const messages = parseWebhook(body);
    for (const msg of messages) {
      try {
        await this.handleOne(msg);
      } catch (err) {
        this.logger.error(
          `Failed handling message ${msg.messageId} from ${msg.from}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }

  private async handleOne(msg: InboundMessage): Promise<void> {
    if (await this.conversations.isDuplicate(msg.messageId)) {
      this.logger.debug(`Skipping duplicate message ${msg.messageId}`);
      return;
    }

    // Staff advancing an order via buttons.
    if (this.dispatch.isStaff(msg.from) && this.dispatch.isStaffAction(msg.replyId)) {
      await this.dispatch.handleStaffAction(msg.from, msg.replyId!);
      return;
    }

    // Customer conversation.
    const convo = await this.conversations.load(msg.from, msg.contactName);
    const result = this.engine.handle(convo.state, convo.draft, {
      text: msg.text ?? '',
      replyId: msg.replyId,
    });

    await this.api.sendMany(msg.from, result.replies);

    if (result.order) {
      const order = await this.orders.create(
        msg.from,
        convo.name ?? msg.contactName,
        result.order,
      );
      await this.api.sendText(
        msg.from,
        this.botConfig.message('orderPlaced', { code: order.code }),
      );
      await this.dispatch.notifyNewOrder(order);
      this.logger.log(`Order #${order.code} created for ${msg.from}`);
    }

    await this.conversations.save(msg.from, result.nextState, result.draft);
  }
}
