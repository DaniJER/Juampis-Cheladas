import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  // rawBody is needed to verify Meta's X-Hub-Signature-256 header.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });

  await app.listen(port);
  new Logger('Bootstrap').log(`Listening on http://localhost:${port}`);
}
bootstrap();
