import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv({});
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('coerces values', () => {
    const env = validateEnv({ PORT: '8080', SWAGGER_ENABLED: 'true' });
    expect(env.PORT).toBe(8080);
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it('throws on invalid values', () => {
    expect(() => validateEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('leaves USDT off when the password is empty', () => {
    const env = validateEnv({ USDT_WALLET_PASSWORD: '   ' });
    expect(env.USDT_WALLET_PASSWORD).toBeUndefined();
    expect(env.USDT_TON_API_URL).toBeUndefined();
    expect(env.USDT_ETH_CONFIRMATIONS).toBe(12);
    expect(env.USDT_TRON_CONFIRMATIONS).toBe(19);
    expect(env.USDT_INVOICE_TTL_SEC).toBe(86_400);
  });

  it('keeps a USDT password and network settings', () => {
    const env = validateEnv({
      USDT_WALLET_PASSWORD: ' secret ',
      USDT_TON_API_URL: ' https://tonapi.io ',
      USDT_ETH_CONFIRMATIONS: '20',
    });
    expect(env.USDT_WALLET_PASSWORD).toBe('secret');
    expect(env.USDT_TON_API_URL).toBe('https://tonapi.io');
    expect(env.USDT_ETH_CONFIRMATIONS).toBe(20);
  });
});
