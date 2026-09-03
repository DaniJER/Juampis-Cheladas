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

export const botConfigSchema = z.object({
  businessName: z.string().min(1),
  currency: z.string().min(1).default('COP'),
  location: z.string().default(''),
  hours: z.string().default(''),
  deliveryFee: z.number().int().nonnegative().default(0),
  menu: z.array(menuItemSchema).min(1),
  faqs: z.array(faqSchema).default([]),
  messages: z.record(z.string(), z.string()),
});

export type MenuItem = z.infer<typeof menuItemSchema>;
export type Faq = z.infer<typeof faqSchema>;
export type BotConfig = z.infer<typeof botConfigSchema>;
