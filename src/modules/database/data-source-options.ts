import { extname, join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import type { Env } from '../../config/env.validation';
import { InvoiceEntity } from './entities/invoice.entity';

type DbEnv = Pick<
  Env,
  'DB_HOST' | 'DB_PORT' | 'DB_NAME' | 'DB_USER' | 'DB_PASSWORD' | 'DB_LOGGING'
>;

export function buildDataSourceOptions(env: DbEnv): DataSourceOptions {
  return {
    type: 'postgres',
    uuidExtension: 'pgcrypto',
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    logging: env.DB_LOGGING,
    synchronize: false,
    entities: [InvoiceEntity],
    // .ts из исходников (CLI, тесты), .js из dist — без .d.ts
    migrations: [join(__dirname, 'migrations', `*${extname(__filename)}`)],
  };
}
