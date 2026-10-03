import { Module } from '@nestjs/common';
import { DispatchService } from './dispatch.service';

/** No imports needed: DispatchService only depends on PrismaService
 *  (global) and takes its MessagingClient per call. */
@Module({
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
