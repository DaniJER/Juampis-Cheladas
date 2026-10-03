import { Injectable, Logger } from '@nestjs/common';
import { MessagingClient } from '../bot/outbound';
import { OrderWithItems } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Notifies staff of new orders (plain-text heads-up, no action buttons —
 * state changes happen on the staff dashboard, not by tapping WhatsApp
 * buttons; see OrderStatusService). Channel-agnostic: callers pass their
 * own MessagingClient (WhapiApiService / WhatsappApiService).
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async staffIds(businessId: string): Promise<string[]> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { staffWaIds: true },
    });
    return (business?.staffWaIds ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async isStaff(businessId: string, waId: string): Promise<boolean> {
    return (await this.staffIds(businessId)).includes(waId);
  }

  /** Notify every staff member that a new order came in (plain text; they
   *  manage it from the dashboard, not from this message). */
  async notifyNewOrder(
    businessId: string,
    order: OrderWithItems,
    client: MessagingClient,
  ): Promise<void> {
    const staffIds = await this.staffIds(businessId);
    if (staffIds.length === 0) {
      this.logger.warn(`Order #${order.businessSeq} created but staffWaIds is empty`);
      return;
    }
    const body = `🆕 Pedido #${order.businessSeq}\n${this.staffSummary(order)}`;
    await Promise.all(staffIds.map((to) => client.sendText(to, body)));
  }

  private staffSummary(order: OrderWithItems): string {
    const lines = order.items.map((it) => `• ${it.quantity} x ${it.name}`);
    lines.push('');
    lines.push(`Total: $${order.total.toLocaleString('es-CO')}`);
    lines.push(`Cliente: ${order.customerName ?? order.customerWaId}`);
    lines.push(`Tel: ${order.customerWaId}`);
    lines.push(`Dirección: ${order.address}`);
    return lines.join('\n');
  }
}
