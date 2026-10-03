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

  /** Creates the order with the next sequential number for this business,
   *  computed transactionally (row-lock on Business.nextOrderSeq) so
   *  concurrent orders for the same business never collide. */
  async create(
    businessId: string,
    customerWaId: string,
    customerName: string | undefined,
    order: EngineOrder,
  ): Promise<OrderWithItems> {
    return this.prisma.$transaction(async (tx) => {
      const business = await tx.business.update({
        where: { id: businessId },
        data: { nextOrderSeq: { increment: 1 } },
        select: { nextOrderSeq: true },
      });

      return tx.order.create({
        data: {
          businessId,
          businessSeq: business.nextOrderSeq,
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
    });
  }

  /** Scoped to one business — a valid API key for business A must never be
   *  able to fetch business B's order, even by guessing/enumerating an id. */
  async findById(businessId: string, id: string): Promise<OrderWithItems | null> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    return order && order.businessId === businessId ? order : null;
  }

  list(businessId: string, status?: OrderStatus): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      where: status ? { businessId, status } : { businessId },
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
