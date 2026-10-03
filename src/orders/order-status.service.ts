import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { BotConfigService } from '../bot/bot-config.service';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service';
import { STATUS_MESSAGE_KEY } from './order-status-messages';
import { OrdersService, OrderWithItems } from './orders.service';

/**
 * Applies a staff-driven status change (from the dashboard) and notifies
 * the customer, reusing the same message templates the old WhatsApp-button
 * flow used to send.
 */
@Injectable()
export class OrderStatusService {
  private readonly logger = new Logger(OrderStatusService.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly botConfig: BotConfigService,
    private readonly whatsappApi: WhatsappApiService,
  ) {}

  async transition(
    businessId: string,
    orderId: string,
    to: OrderStatus,
  ): Promise<OrderWithItems> {
    const order = await this.orders.findById(businessId, orderId);
    if (!order) throw new NotFoundException();
    if (!this.orders.canTransition(order.status, to)) {
      throw new BadRequestException(`No se puede pasar de ${order.status} a ${to}`);
    }

    const updated = await this.orders.setStatus(order.id, to);
    // The status change already committed — a failed customer notification
    // (e.g. Whapi down/misconfigured) shouldn't make the dashboard think the
    // update itself failed.
    try {
      await this.notifyCustomer(businessId, updated);
    } catch (err) {
      this.logger.error(
        `Order #${updated.businessSeq} moved to ${to} but notifying the customer failed`,
        err instanceof Error ? err.stack : String(err),
      );
    }
    return updated;
  }

  private async notifyCustomer(businessId: string, order: OrderWithItems): Promise<void> {
    const msgKey = STATUS_MESSAGE_KEY[order.status];
    if (!msgKey) return;
    const client = this.whatsappApi.forBusiness(businessId);
    await client.sendText(
      order.customerWaId,
      this.botConfig.message(businessId, msgKey, { code: order.businessSeq }),
    );
  }
}
