import { z } from 'zod';

const bool = (def: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(def)
    .transform((v) => v === 'true');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

/**
 * `API_KEYS=project-a:secret-a,project-b:secret-b`
 * Ключ проекта используется и для авторизации запросов, и для подписи уведомлений (HMAC).
 */
const apiKeys = z
  .string()
  .default('')
  .transform((raw, ctx) => {
    const map = new Map<string, string>();
    for (const pair of raw.split(',').map((s) => s.trim())) {
      if (!pair) continue;
      const idx = pair.indexOf(':');
      const project = pair.slice(0, idx).trim();
      const key = pair.slice(idx + 1).trim();
      if (idx <= 0 || !project || key.length < 16) {
        ctx.addIssue({
          code: 'custom',
          message: `invalid entry "${project || pair}": expected "project:key", key length >= 16`,
        });
        return z.NEVER;
      }
      if (map.has(project)) {
        ctx.addIssue({ code: 'custom', message: `duplicate project "${project}"` });
        return z.NEVER;
      }
      map.set(project, key);
    }
    return map;
  });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  GLOBAL_PREFIX: z.string().default('api'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  SWAGGER_ENABLED: bool('false'),

  // --- database ---
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().default('payments'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_LOGGING: bool('false'),

  // --- clients ---
  API_KEYS: apiKeys,

  // --- callbacks to client projects ---
  CALLBACK_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  CALLBACK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(12),

  // --- YooKassa ---
  YOOKASSA_SHOP_ID: optionalString,
  YOOKASSA_SECRET_KEY: optionalString,
  /** return_url по умолчанию, если клиент не передал returnUrl */
  YOOKASSA_RETURN_URL: optionalString,

  // --- WeChat Pay (APIv3, Native) ---
  WECHAT_APPID: optionalString,
  WECHAT_MCHID: optionalString,
  WECHAT_API_V3_KEY: optionalString,
  /** Публичный URL вебхука: https://<host>/api/v1/wechat/callback */
  WECHAT_NOTIFY_URL: optionalString,
  /** Папка с apiclient_cert.pem и apiclient_key.pem */
  WECHAT_CERTS_DIR: z.string().default('data/keys'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
