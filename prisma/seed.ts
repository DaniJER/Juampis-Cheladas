/**
 * One-time seed: creates the first `Business` row ("Juampis Cheladas") from
 * the current static bot-config.json + env vars, so the existing business
 * keeps working unchanged once the code starts reading from the Business
 * table instead of the static file / global env vars (Phase 1).
 *
 * Usage: npx ts-node -r tsconfig-paths/register prisma/seed.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { botConfigSchema } from '../src/bot/bot-config.schema';

const prisma = new PrismaClient();

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const configPath = join(__dirname, '..', 'src', 'bot', 'bot-config.json');
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  const botConfig = botConfigSchema.parse(raw);

  const PLACEHOLDER = 'pending-setup';
  const staffWaIds = splitList(process.env.STAFF_WA_IDS).join(',') || PLACEHOLDER;
  const whapiToken = process.env.WHAPI_TOKEN || PLACEHOLDER;
  const whapiWebhookSecret = process.env.WHAPI_WEBHOOK_SECRET || PLACEHOLDER;
  const metaPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || PLACEHOLDER;
  const metaAccessToken = process.env.WHATSAPP_ACCESS_TOKEN || PLACEHOLDER;
  const metaVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN || PLACEHOLDER;
  const metaAppSecret = process.env.META_APP_SECRET || PLACEHOLDER;
  const adminApiKey = process.env.ADMIN_API_KEY ?? '';

  if (!adminApiKey) {
    throw new Error(
      'Missing ADMIN_API_KEY in the environment. Load the same .env used by the running app before seeding.',
    );
  }

  const usedPlaceholders = [
    staffWaIds === PLACEHOLDER && 'STAFF_WA_IDS',
    whapiToken === PLACEHOLDER && 'WHAPI_TOKEN',
    whapiWebhookSecret === PLACEHOLDER && 'WHAPI_WEBHOOK_SECRET',
    metaPhoneNumberId === PLACEHOLDER && 'WHATSAPP_PHONE_NUMBER_ID',
    metaAccessToken === PLACEHOLDER && 'WHATSAPP_ACCESS_TOKEN',
    metaVerifyToken === PLACEHOLDER && 'WHATSAPP_VERIFY_TOKEN',
    metaAppSecret === PLACEHOLDER && 'META_APP_SECRET',
  ].filter(Boolean);
  if (usedPlaceholders.length) {
    console.warn(
      `Warning: seeding with placeholder values for [${usedPlaceholders.join(', ')}] because they are empty in the environment. ` +
        'Update them on the Business row (e.g. via Prisma Studio) once the real values are known.',
    );
  }

  const data = {
    name: botConfig.businessName,
    whapiBaseUrl: process.env.WHAPI_BASE_URL ?? 'https://gate.whapi.cloud',
    whapiToken,
    whapiWebhookSecret,
    metaPhoneNumberId,
    metaAccessToken,
    metaVerifyToken,
    metaAppSecret,
    staffWaIds,
    adminApiKey,
    botConfig: botConfig as object,
  };

  const existing = await prisma.business.findUnique({
    where: { slug: 'juampis-cheladas' },
  });
  if (existing) {
    // Re-running the seed also refreshes credentials: useful right after
    // wiring up a new channel's real values (e.g. Meta) for a business that
    // was already seeded with placeholders.
    const updated = await prisma.business.update({
      where: { id: existing.id },
      data,
    });
    console.log(`Business already seeded, refreshed credentials: ${updated.id}`);
    return;
  }

  const business = await prisma.business.create({
    data: { ...data, slug: 'juampis-cheladas' },
  });

  console.log(`Seeded business: ${business.id} (${business.name})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
