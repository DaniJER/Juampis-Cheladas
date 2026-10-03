import { BotConfigService } from '../bot/bot-config.service';
import { WeatherService } from '../weather/weather.service';

/**
 * Staff-only text command to control the rain surcharge, shared by both
 * WhatsApp channels:
 *   "lluvia on"   → force the surcharge on
 *   "lluvia off"  → force it off
 *   "lluvia auto" → back to the live weather (Open-Meteo)
 *
 * Returns the reply to send back to the staff member, or `null` if the message
 * isn't a rain command (so the caller keeps handling it normally).
 */
export function handleRainCommand(
  businessId: string,
  text: string,
  weather: WeatherService,
  cfg: BotConfigService,
): string | null {
  const norm = text.trim().toLowerCase();
  if (!/^lluvia\b/.test(norm)) return null;

  const arg = norm.replace(/^lluvia\b/, '').trim();
  const multiplier = cfg.get(businessId).delivery.rain.multiplier;

  if (['on', 'si', 'sí', '1', 'true'].includes(arg)) {
    weather.setOverride(businessId, true);
    return cfg.message(businessId, 'staffRainOn', { multiplier });
  }
  if (['off', 'no', '0', 'false'].includes(arg)) {
    weather.setOverride(businessId, false);
    return cfg.message(businessId, 'staffRainOff');
  }
  if (arg === '' || arg === 'auto') {
    weather.setOverride(businessId, null);
    return cfg.message(businessId, 'staffRainAuto');
  }
  return 'Comandos: *lluvia on* / *lluvia off* / *lluvia auto*';
}
