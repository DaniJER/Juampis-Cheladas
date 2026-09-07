import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { ApiKeyGuard } from './api-key.guard';

/**
 * Read-only order feed, gated by ApiKeyGuard (`x-api-key` header, see
 * ADMIN_API_KEY). This is the seam the phase 2 staff dashboard will consume.
 */
@UseGuards(ApiKeyGuard)
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
