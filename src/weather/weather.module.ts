import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { WeatherService } from './weather.service';

@Module({
  imports: [BotModule],
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
