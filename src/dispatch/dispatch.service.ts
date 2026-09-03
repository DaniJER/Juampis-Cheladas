import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { BotConfigService } from '../bot/bot-config.service';
import { ButtonsMessage } from '../bot/outbound';
import { WhatsappApiService } from '../whatsapp/whatsapp-api.service';
import { OrdersService, OrderWithItems } from '../orders/orders.service';

type StaffAction = 'ACCEPT' | 'READY' | 'DISPATCH' | 'CANCEL';

const ACTION_TO_STATUS: Record<StaffAction, OrderStatus> = {
  ACCEPT: 'ACCEPTED',
  READY: 'READY',
  DISPATCH: 'DISPATCHED',
  CANCEL: 'CANCELLED',
};

const PREFIX = 'ord';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly wa: WhatsappApiService,
    private readonly orders: OrdersService,
    private readonly botConfig: BotConfigService,
  ) {}

  private get staffIds(): string[] {
    return this.config.get('staffWaIds', { infer: true });
  }

  isStaff(waId: string): boolean {
    return this.staffIds.includes(waId);
  }

  /** true if the reply id is a staff order-action button. */
  isStaffAction(replyId?: string): boolean {
    return !!replyId && replyId.startsWith(`${PREFIX}:`);
  }

  /** Notify every staff member that a new order came in. */
  async notifyNewOrder(order: OrderWithItems): Promise<void> {
    if (this.staffIds.length === 0) {
      this.logger.warn(`Order #${order.code} created but STAFF_WA_IDS is empty`);
      return;
    }
    const msg: ButtonsMessage = {
      kind: 'buttons',
      header: `🆕 Pedido #${order.code}`,
      body: this.staffSummary(order),
      footer: 'Acepta para empezar a prepararlo',
      buttons: [
        { id: `${PREFIX}:${order.id}:ACCEPT`, title: 'Aceptar' },
        { id: `${PREFIX}:${order.id}:CANCEL`, title: 'Rechazar' },
      ],
    };
    await Promise.all(this.staffIds.map((to) => this.wa.send(to, msg)));
  }

  /** Handle a staff member tapping an order-action button. */
  async handleStaffAction(from: string, replyId: string): Promise<void> {
    const [, orderId, rawAction] = replyId.split(':');
    const action = rawAction as StaffAction;
    if (!orderId || !ACTION_TO_STATUS[action]) {
      await this.wa.sendText(from, 'Acción no reconocida.');
      return;
    }

    const order = await this.orders.findById(orderId);
    if (!order) {
      await this.wa.sendText(from, 'Ese pedido ya no existe.');
      return;
    }

    const target = ACTION_TO_STATUS[action];
    if (!this.orders.canTransition(order.status, target)) {
      await this.wa.sendText(
        from,
        `El pedido #${order.code} ya está en estado ${order.status}.`,
      );
      return;
    }

    const updated = await this.orders.setStatus(order.id, target);
    await this.notifyCustomer(updated);
    await this.confirmToStaff(from, updated);
  }

  // ---------------------------------------------------------------------------

  private async notifyCustomer(order: OrderWithItems): Promise<void> {
    const key: Record<string, string> = {
      ACCEPTED: 'statusAccepted',
      READY: 'statusReady',
      DISPATCHED: 'statusDispatched',
      CANCELLED: 'statusCancelledByStaff',
    };
    const msgKey = key[order.status];
    if (!msgKey) return;
    await this.wa.sendText(
      order.customerWaId,
      this.botConfig.message(msgKey, { code: order.code }),
    );
  }

  private async confirmToStaff(to: string, order: OrderWithItems): Promise<void> {
    const nextButtons: Partial<Record<OrderStatus, ButtonsMessage['buttons']>> = {
      ACCEPTED: [
        { id: `${PREFIX}:${order.id}:READY`, title: 'Listo 🍹' },
        { id: `${PREFIX}:${order.id}:CANCEL`, title: 'Cancelar' },
      ],
      READY: [{ id: `${PREFIX}:${order.id}:DISPATCH`, title: 'Despachado 🛵' }],
    };

    const buttons = nextButtons[order.status];
    if (buttons) {
      await this.wa.send(to, {
        kind: 'buttons',
        header: `Pedido #${order.code} · ${order.status}`,
        body: '¿Siguiente paso?',
        buttons,
      });
    } else {
      await this.wa.sendText(
        to,
        `Pedido #${order.code} marcado como ${order.status}. ¡Gracias!`,
      );
    }
  }

  private staffSummary(order: OrderWithItems): string {
    const lines = order.items.map(
      (it) => `• ${it.quantity} x ${it.name}`,
    );
    lines.push('');
    lines.push(`Total: $${order.total.toLocaleString('es-CO')}`);
    lines.push(`Cliente: ${order.customerName ?? order.customerWaId}`);
    lines.push(`Tel: ${order.customerWaId}`);
    lines.push(`Dirección: ${order.address}`);
    return lines.join('\n');
  }
}
