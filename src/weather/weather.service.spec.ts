import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BotConfigService } from '../bot/bot-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from './weather.service';

const BUSINESS_ID = 'test-business';

describe('WeatherService', () => {
  let cfg: BotConfigService;
  let weather: WeatherService;
  const realFetch = global.fetch;

  beforeAll(() => {
    cfg = new BotConfigService({} as PrismaService);
    const raw = JSON.parse(
      readFileSync(join(__dirname, '..', 'bot', 'bot-config.json'), 'utf-8'),
    );
    cfg.loadFromObject(BUSINESS_ID, raw);
  });
  beforeEach(() => {
    weather = new WeatherService(cfg);
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const mockCurrent = (current: Record<string, unknown>) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current }),
    }) as unknown as typeof fetch;
  };

  it('reads rain from Open-Meteo when precipitation > 0', async () => {
    mockCurrent({ rain: 0.4, precipitation: 0.4, weather_code: 61 });
    expect(await weather.isRaining(BUSINESS_ID)).toBe(true);
  });

  it('reports no rain on a clear reading', async () => {
    mockCurrent({ rain: 0, precipitation: 0, weather_code: 1 });
    expect(await weather.isRaining(BUSINESS_ID)).toBe(false);
  });

  it('caches the result (one HTTP call for a burst)', async () => {
    mockCurrent({ rain: 0, precipitation: 0, weather_code: 0 });
    await weather.isRaining(BUSINESS_ID);
    await weather.isRaining(BUSINESS_ID);
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('manual override wins over the API and skips the call', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    weather.setOverride(BUSINESS_ID, true);
    expect(await weather.isRaining(BUSINESS_ID)).toBe(true);
    weather.setOverride(BUSINESS_ID, false);
    expect(await weather.isRaining(BUSINESS_ID)).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    weather.setOverride(BUSINESS_ID, null);
    expect(weather.overrideState(BUSINESS_ID)).toBeUndefined();
  });

  it('falls back to "not raining" when the API errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    expect(await weather.isRaining(BUSINESS_ID)).toBe(false);
  });
});
