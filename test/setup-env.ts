process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Postgres для e2e поднимается в test/global-setup.ts (testcontainers, нужен Docker)
process.env.API_KEYS = 'project-a:test-key-project-a-0001,project-b:test-key-project-b-0002';
process.env.YOOKASSA_SHOP_ID = 'test-shop';
process.env.YOOKASSA_SECRET_KEY = 'test-secret';

// Задаётся до импорта AppModule: ConfigModule читает env один раз.
// Пустой пароль в .env иначе включил бы USDT на машине разработчика.
process.env.USDT_WALLET_PASSWORD = 'usdt-wallet-v1-test';
process.env.USDT_TON_API_URL = 'https://tonapi.test';
process.env.USDT_TON_API_KEY = 'ton-test-key';
process.env.USDT_ETH_RPC_URL = 'https://eth.test';
process.env.USDT_TRON_API_URL = 'https://tron.test';
process.env.USDT_TRON_API_KEY = 'tron-test-key';
process.env.USDT_INVOICE_TTL_SEC = '86400';
