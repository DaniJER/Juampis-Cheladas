import { z } from 'zod';

export const menuItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  price: z.number().int().nonnegative(),
  available: z.boolean().default(true),
});

export const faqSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1),
  answer: z.string().min(1),
});

/**
 * One delivery zone (a barrio). `km` is the driving distance from the local,
 * and `fee` the resulting charge (`ceil(km) * ratePerKm`). Both are filled in
 * by `scripts/build-delivery-zones.mjs`; `aliases` is maintained by hand so
 * the address parser recognizes the way customers actually write the barrio.
 */
export const deliveryZoneSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  km: z.number().nonnegative(),
  fee: z.number().int().nonnegative(),
});

/** Rain surcharge: the delivery fee is multiplied by `multiplier` while it
 *  rains (Open-Meteo at lat/lng, or a manual staff override). */
export const rainSchema = z.object({
  multiplier: z.number().min(1).default(1),
  lat: z.number().default(0),
  lng: z.number().default(0),
});

export const deliverySchema = z.object({
  /** COP charged per (rounded-up) km. */
  ratePerKm: z.number().int().positive().default(1000),
  /** Address the distance is measured from (used by the build script). */
  origin: z.string().default(''),
  /** Charge used when the barrio can't be identified. */
  fallbackFee: z.number().int().nonnegative().default(0),
  zones: z.array(deliveryZoneSchema).default([]),
  rain: rainSchema.default({}),
});

export const botConfigSchema = z.object({
  businessName: z.string().min(1),
  currency: z.string().min(1).default('COP'),
  location: z.string().default(''),
  hours: z.string().default(''),
  delivery: deliverySchema.default({}),
  menu: z.array(menuItemSchema).min(1),
  faqs: z.array(faqSchema).default([]),
  messages: z.record(z.string(), z.string()),
});

export type MenuItem = z.infer<typeof menuItemSchema>;
export type Faq = z.infer<typeof faqSchema>;
export type DeliveryZone = z.infer<typeof deliveryZoneSchema>;
export type BotConfig = z.infer<typeof botConfigSchema>;
