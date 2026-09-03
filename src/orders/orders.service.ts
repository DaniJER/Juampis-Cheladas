import { Injectable } from '@nestjs/common';
import { Order, OrderItem, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EngineOrder } from '../bot/bot-engine.types';

export type OrderWithItems = Order & { items: OrderItem[] };

/** Allowed forward transitions for the staff dispatch flow. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    customerWaId: string,
    customerName: string | undefined,
    order: EngineOrder,
  ): Promise<OrderWithItems> {
    return this.prisma.order.create({
      data: {
        customerWaId,
        customerName,
        address: order.address,
        total: order.total,
        items: {
          create: order.items.map((it) => ({
            productId: it.productId,
            name: it.name,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
          })),
        },
      },
      include: { items: true },
    });
  }

  findById(id: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findUnique({ where: { id }, include: { items: true } });
  }

  list(status?: OrderStatus): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  async setStatus(id: string, to: OrderStatus): Promise<OrderWithItems> {
    return this.prisma.order.update({
      where: { id },
      data: { status: to },
      include: { items: true },
    });
  }
}

export { OrderStatus, Prisma };
