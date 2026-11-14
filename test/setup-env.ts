process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Postgres для e2e поднимается в test/global-setup.ts (testcontainers, нужен Docker)
process.env.API_KEYS = 'project-a:test-key-project-a-0001,project-b:test-key-project-b-0002';
process.env.YOOKASSA_SHOP_ID = 'test-shop';
process.env.YOOKASSA_SECRET_KEY = 'test-secret';
