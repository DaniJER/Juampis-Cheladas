import { Injectable, Logger } from '@nestjs/common';
import { BotConfigService } from '../bot/bot-config.service';

/**
 * "Is it raining over the delivery area right now?" — used to apply the rain
 * surcharge to the delivery fee (`delivery.rain.multiplier`). Scoped per
 * business: each business has its own lat/lng, cache and manual override.
 *
 * Source of truth, in order:
 *  1. A manual staff override (`setOverride(businessId, true|false)`), if set.
 *  2. Open-Meteo current weather at `delivery.rain.lat/lng` (free, no API key),
 *     cached for `TTL_MS` so a burst of orders is one HTTP call.
 *  3. On any failure: the last known value, else `false` (no surcharge).
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private static readonly TTL_MS = 10 * 60 * 1000;
  // WMO codes: 51-57 drizzle, 61-67 rain, 80-82 rain showers, 95-99 thunderstorm.
  private static readonly RAIN_CODES = new Set([
    51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
  ]);

  private readonly cache = new Map<string, { raining: boolean; at: number }>();
  private readonly override = new Map<string, boolean>();

  constructor(private readonly cfg: BotConfigService) {}

  /** `true`/`false` pins the answer; `null` returns to automatic (Open-Meteo). */
  setOverride(businessId: string, value: boolean | null): void {
    if (value === null) {
      this.override.delete(businessId);
      this.logger.log(`Rain override cleared (automatic) for business ${businessId}`);
      return;
    }
    this.override.set(businessId, value);
    this.logger.log(`Rain override set to ${value} for business ${businessId}`);
  }

  overrideState(businessId: string): boolean | undefined {
    return this.override.get(businessId);
  }

  async isRaining(businessId: string): Promise<boolean> {
    const override = this.override.get(businessId);
    if (override !== undefined) return override;

    const now = Date.now();
    const cached = this.cache.get(businessId);
    if (cached && now - cached.at < WeatherService.TTL_MS) {
      return cached.raining;
    }

    const { lat, lng, multiplier } = this.cfg.get(businessId).delivery.rain;
    if (multiplier <= 1 || (!lat && !lng)) return false; // surcharge disabled

    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=rain,precipitation,weather_code`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const data = (await res.json()) as {
        current?: { rain?: number; precipitation?: number; weather_code?: number };
      };
      const c = data.current ?? {};
      const raining =
        (c.rain ?? 0) > 0 ||
        (c.precipitation ?? 0) > 0 ||
        WeatherService.RAIN_CODES.has(c.weather_code ?? -1);
      this.cache.set(businessId, { raining, at: now });
      return raining;
    } catch (err) {
      this.logger.warn(
        `Weather lookup failed for business ${businessId}, assuming ${cached?.raining ?? false}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return cached?.raining ?? false;
    }
  }
}
