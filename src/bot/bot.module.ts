import { Module } from '@nestjs/common';
import { BotConfigService } from './bot-config.service';
import { BotEngineService } from './bot-engine.service';

@Module({
  providers: [BotConfigService, BotEngineService],
  exports: [BotConfigService, BotEngineService],
})
export class BotModule {}
