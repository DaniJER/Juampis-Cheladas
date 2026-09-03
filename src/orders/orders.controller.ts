import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

/**
 * Read-only order feed. Phase 1 has no auth — keep it behind the tunnel /
 * a private network, or add a guard before exposing publicly. This is the
 * seam the phase 2 staff dashboard will consume.
 */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query('status') status?: string) {
    const parsed =
      status && status.toUpperCase() in OrderStatus
        ? (status.toUpperCase() as OrderStatus)
        : undefined;
    return this.orders.list(parsed);
  }

  @Get(':id')
  async byId(@Param('id') id: string) {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundException();
    return order;
  }
}
