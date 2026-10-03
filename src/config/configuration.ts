export interface AppConfig {
  port: number;
  whatsapp: {
    phoneNumberId: string;
    accessToken: string;
    verifyToken: string;
    apiVersion: string;
    appSecret: string;
  };
  staffWaIds: string[];
  adminApiKey: string;
  whapi: {
    baseUrl: string;
    token: string;
    webhookSecret: string;
  };
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function configuration(): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),
    whatsapp: {
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
      apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v21.0',
      appSecret: process.env.META_APP_SECRET ?? '',
    },
    staffWaIds: splitList(process.env.STAFF_WA_IDS),
    adminApiKey: process.env.ADMIN_API_KEY ?? '',
    whapi: {
      baseUrl: process.env.WHAPI_BASE_URL ?? 'https://gate.whapi.cloud',
      token: process.env.WHAPI_TOKEN ?? '',
      webhookSecret: process.env.WHAPI_WEBHOOK_SECRET ?? '',
    },
  };
}
