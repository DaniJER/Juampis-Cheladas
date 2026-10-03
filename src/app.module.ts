import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { configuration } from './config/configuration';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './prisma/prisma.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
// Whapi.cloud channel is paused — the official WhatsApp Cloud API (Meta) is
// the active transport now, to avoid the ban risk of Whapi's unofficial
// automation. The module is left in the tree, just not imported; re-add it
// below to bring the Whapi webhook (/webhook/whapi/:businessId) back.
// import { WhapiModule } from './whapi/whapi.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    PrismaModule,
    WhatsappModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
