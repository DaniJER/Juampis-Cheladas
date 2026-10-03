import { Module } from '@nestjs/common';
import { WhapiApiService } from './whapi-api.service';

/** Split out from WhapiModule so other modules (e.g. OrdersModule, for the
 *  order-status endpoint) can use WhapiApiService without importing
 *  WhapiModule and creating a circular dependency (WhapiModule imports
 *  OrdersModule). Mirrors WhatsappApiModule. */
@Module({
  providers: [WhapiApiService],
  exports: [WhapiApiService],
})
export class WhapiApiModule {}
