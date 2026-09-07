import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { ApiKeyGuard } from './api-key.guard';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, ApiKeyGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
