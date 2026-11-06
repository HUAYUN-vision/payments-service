import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

declare global {
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

/**
 * Поднимает временный Postgres для e2e (нужен Docker).
 * Переменные DB_* наследуются воркерами Jest; миграции применяет само приложение.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('payments_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  globalThis.__PG_CONTAINER__ = container;
  process.env.DB_HOST = container.getHost();
  process.env.DB_PORT = String(container.getPort());
  process.env.DB_NAME = container.getDatabase();
  process.env.DB_USER = container.getUsername();
  process.env.DB_PASSWORD = container.getPassword();
}
