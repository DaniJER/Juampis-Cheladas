import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BotConfigService } from '../bot/bot-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from '../weather/weather.service';
import { handleRainCommand } from './rain-command';

const BUSINESS_ID = 'test-business';

describe('handleRainCommand', () => {
  let cfg: BotConfigService;
  let weather: WeatherService;

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

  it('returns null for a non-command message', () => {
    expect(handleRainCommand(BUSINESS_ID, 'hola quiero un mojito', weather, cfg)).toBeNull();
  });

  it('"lluvia on" forces the surcharge on', () => {
    const reply = handleRainCommand(BUSINESS_ID, 'lluvia on', weather, cfg);
    expect(weather.overrideState(BUSINESS_ID)).toBe(true);
    expect(reply).toContain('ACTIVADO');
  });

  it('"lluvia off" forces it off', () => {
    handleRainCommand(BUSINESS_ID, 'lluvia off', weather, cfg);
    expect(weather.overrideState(BUSINESS_ID)).toBe(false);
  });

  it('"lluvia auto" clears the override', () => {
    weather.setOverride(BUSINESS_ID, true);
    handleRainCommand(BUSINESS_ID, 'LLUVIA auto', weather, cfg);
    expect(weather.overrideState(BUSINESS_ID)).toBeUndefined();
  });

  it('bare "lluvia" goes back to automatic', () => {
    weather.setOverride(BUSINESS_ID, true);
    handleRainCommand(BUSINESS_ID, 'lluvia', weather, cfg);
    expect(weather.overrideState(BUSINESS_ID)).toBeUndefined();
  });

  it('shows help on an unknown argument', () => {
    const reply = handleRainCommand(BUSINESS_ID, 'lluvia quizas', weather, cfg);
    expect(reply).toContain('lluvia on');
  });
});
