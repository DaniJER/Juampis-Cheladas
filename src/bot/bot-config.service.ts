import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotConfig, botConfigSchema, MenuItem } from './bot-config.schema';

/**
 * Loads and validates each business's bot config (menu, FAQs, copy) from the
 * `Business.botConfig` column and keeps it in an in-memory cache keyed by
 * businessId. Invalidation is explicit (`reload`/`reloadAll`) rather than
 * TTL-based: content only changes when someone deliberately edits a
 * business's config.
 */
@Injectable()
export class BotConfigService implements OnModuleInit {
  private readonly logger = new Logger(BotConfigService.name);
  private readonly cache = new Map<string, BotConfig>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reloadAll();
  }

  /** Reload every active business's config from the database. */
  async reloadAll(): Promise<void> {
    const businesses = await this.prisma.business.findMany({
      where: { isActive: true },
    });
    this.cache.clear();
    for (const business of businesses) {
      this.setFromRow(business.id, business.botConfig);
    }
    this.logger.log(`Bot config loaded for ${this.cache.size} business(es)`);
  }

  /** Reload a single business's config (e.g. after an admin edit). */
  async reload(businessId: string): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business || !business.isActive) {
      this.cache.delete(businessId);
      return;
    }
    this.setFromRow(business.id, business.botConfig);
  }

  /** Test-only / seed-adjacent helper: load a config without touching the DB. */
  loadFromObject(businessId: string, raw: unknown): void {
    this.setFromRow(businessId, raw);
  }

  private setFromRow(businessId: string, raw: unknown): void {
    this.cache.set(businessId, botConfigSchema.parse(raw));
  }

  private configFor(businessId: string): BotConfig {
    const config = this.cache.get(businessId);
    if (!config) {
      throw new Error(`No bot config loaded for business "${businessId}"`);
    }
    return config;
  }

  get(businessId: string): BotConfig {
    return this.configFor(businessId);
  }

  menu(businessId: string): MenuItem[] {
    return this.configFor(businessId).menu;
  }

  availableMenu(businessId: string): MenuItem[] {
    return this.configFor(businessId).menu.filter((m) => m.available);
  }

  findProduct(businessId: string, id: string): MenuItem | undefined {
    return this.configFor(businessId).menu.find((m) => m.id === id);
  }

  /** Resolve {placeholders} against top-level config values. */
  interpolate(
    businessId: string,
    template: string,
    extra: Record<string, string | number> = {},
  ): string {
    const config = this.configFor(businessId);
    const rate = config.delivery.ratePerKm;
    const values: Record<string, string | number> = {
      businessName: config.businessName,
      location: config.location,
      hours: config.hours,
      ratePerKm: rate,
      // Same value, formatted for display (thousands separators): "1.000".
      ratePerKmFmt: rate.toLocaleString('es-CO'),
      currency: config.currency,
      ...extra,
    };
    return template.replace(/\{(\w+)\}/g, (_, key: string) =>
      key in values ? String(values[key]) : `{${key}}`,
    );
  }

  message(
    businessId: string,
    key: string,
    extra: Record<string, string | number> = {},
  ): string {
    const config = this.configFor(businessId);
    const template = config.messages[key];
    if (!template) {
      this.logger.warn(`Missing message key: ${key} (business ${businessId})`);
      return '';
    }
    return this.interpolate(businessId, template, extra);
  }
}
