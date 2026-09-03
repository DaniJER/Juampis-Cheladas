import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BotConfig, botConfigSchema, MenuItem } from './bot-config.schema';

/**
 * Loads and validates bot-config.json (menu, FAQs, copy). Kept separate from
 * the engine so the content can later move to the database / an admin panel
 * without touching conversation logic.
 */
@Injectable()
export class BotConfigService implements OnModuleInit {
  private readonly logger = new Logger(BotConfigService.name);
  private config!: BotConfig;

  onModuleInit() {
    this.reload();
  }

  reload(): void {
    const path = join(__dirname, 'bot-config.json');
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    this.config = botConfigSchema.parse(raw);
    this.logger.log(
      `Bot config loaded: ${this.config.menu.length} products, ${this.config.faqs.length} FAQs`,
    );
  }

  get(): BotConfig {
    return this.config;
  }

  get menu(): MenuItem[] {
    return this.config.menu;
  }

  availableMenu(): MenuItem[] {
    return this.config.menu.filter((m) => m.available);
  }

  findProduct(id: string): MenuItem | undefined {
    return this.config.menu.find((m) => m.id === id);
  }

  /** Resolve {placeholders} against top-level config values. */
  interpolate(template: string, extra: Record<string, string | number> = {}): string {
    const values: Record<string, string | number> = {
      businessName: this.config.businessName,
      location: this.config.location,
      hours: this.config.hours,
      deliveryFee: this.config.deliveryFee,
      currency: this.config.currency,
      ...extra,
    };
    return template.replace(/\{(\w+)\}/g, (_, key: string) =>
      key in values ? String(values[key]) : `{${key}}`,
    );
  }

  message(key: string, extra: Record<string, string | number> = {}): string {
    const template = this.config.messages[key];
    if (!template) {
      this.logger.warn(`Missing message key: ${key}`);
      return '';
    }
    return this.interpolate(template, extra);
  }
}
