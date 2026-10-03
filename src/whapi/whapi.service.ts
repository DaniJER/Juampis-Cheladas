import { Injectable, Logger } from '@nestjs/common';
import { BotConfigService } from '../bot/bot-config.service';
import { BotEngineService } from '../bot/bot-engine.service';
import { ConversationService } from '../conversation/conversation.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { OrdersService } from '../orders/orders.service';
import { WeatherService } from '../weather/weather.service';
import { handleRainCommand } from '../dispatch/rain-command';
import { WhapiApiService } from './whapi-api.service';
import { WhapiWebhookBody, parseWebhook } from './whapi.types';
import type { InboundMessage } from '../whatsapp/whatsapp.types';

/**
 * Orchestrator for the Whapi.cloud channel — mirrors WhatsappService.
 * Shares BotEngineService, ConversationService, OrdersService and
 * DispatchService with the Meta channel (same conversations table, same
 * order records, same staff-dispatch logic); only the transport
 * (WhapiApiService) differs.
 */
@Injectable()
export class WhapiService {
  private readonly logger = new Logger(WhapiService.name);

  constructor(
    private readonly api: WhapiApiService,
    private readonly engine: BotEngineService,
    private readonly conversations: ConversationService,
    private readonly orders: OrdersService,
    private readonly dispatch: DispatchService,
    private readonly botConfig: BotConfigService,
    private readonly weather: WeatherService,
  ) {}

  async processWebhook(businessId: string, body: WhapiWebhookBody): Promise<void> {
    const messages = parseWebhook(body);
    for (const msg of messages) {
      try {
        await this.handleOne(businessId, msg);
      } catch (err) {
        this.logger.error(
          `Failed handling message ${msg.messageId} from ${msg.from} (business ${businessId})`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }

  private async handleOne(businessId: string, msg: InboundMessage): Promise<void> {
    if (await this.conversations.isDuplicate(businessId, msg.messageId)) {
      this.logger.debug(`Skipping duplicate message ${msg.messageId}`);
      return;
    }

    const client = this.api.forBusiness(businessId);
    const isStaff = await this.dispatch.isStaff(businessId, msg.from);

    // Staff toggling the rain surcharge ("lluvia on/off/auto"). Order status
    // changes happen on the staff dashboard, not via WhatsApp buttons.
    if (isStaff) {
      const rainReply = handleRainCommand(businessId, msg.text ?? '', this.weather, this.botConfig);
      if (rainReply) {
        await client.sendText(msg.from, rainReply);
        return;
      }
    }

    const convo = await this.conversations.load(businessId, msg.from, msg.contactName);
    const result = this.engine.handle(businessId, convo.state, convo.draft, {
      text: msg.text ?? '',
      replyId: msg.replyId,
      raining: await this.weather.isRaining(businessId),
    });

    await client.sendMany(msg.from, result.replies);

    if (result.order) {
      const order = await this.orders.create(
        businessId,
        msg.from,
        convo.name ?? msg.contactName,
        result.order,
      );
      await client.sendText(
        msg.from,
        this.botConfig.message(businessId, 'orderPlaced', { code: order.businessSeq }),
      );
      await this.dispatch.notifyNewOrder(businessId, order, client);
      this.logger.log(`Order #${order.businessSeq} created for ${msg.from} (business ${businessId}, via Whapi)`);
    }

    await this.conversations.save(businessId, msg.from, result.nextState, result.draft);
  }
}
