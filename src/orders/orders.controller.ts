import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { OrderStatusService } from './order-status.service';
import { ApiKeyGuard } from './api-key.guard';
import type { RequestWithBusiness } from './api-key.guard';

/**
 * Order feed + status updates, gated by ApiKeyGuard (`x-api-key` header,
 * matched against a Business.adminApiKey). Every query/update is scoped to
 * the business the API key resolved to. Consumed by the staff dashboard
 * (`GET /dashboard`).
 */
@UseGuards(ApiKeyGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly orderStatus: OrderStatusService,
  ) {}

  @Get()
  list(@Req() req: RequestWithBusiness, @Query('status') status?: string) {
    const parsed =
      status && status.toUpperCase() in OrderStatus
        ? (status.toUpperCase() as OrderStatus)
        : undefined;
    return this.orders.list(req.businessId, parsed);
  }

  @Get(':id')
  async byId(@Req() req: RequestWithBusiness, @Param('id') id: string) {
    const order = await this.orders.findById(req.businessId, id);
    if (!order) throw new NotFoundException();
    return order;
  }

  /** Staff dashboard calls this to move an order forward (or cancel it). */
  @Patch(':id/status')
  async updateStatus(
    @Req() req: RequestWithBusiness,
    @Param('id') id: string,
    @Body('status') statusRaw?: string,
  ) {
    const status = statusRaw?.toUpperCase();
    if (!status || !(status in OrderStatus)) {
      throw new BadRequestException('status inválido');
    }
    return this.orderStatus.transition(req.businessId, id, status as OrderStatus);
  }
}
