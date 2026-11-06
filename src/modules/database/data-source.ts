/**
 * DataSource для TypeORM CLI (миграции):
 *   npm run migration:generate -- src/modules/database/migrations/<Name>
 *   npm run migration:run
 */
import { DataSource } from 'typeorm';
import { validateEnv } from '../../config/env.validation';
import { buildDataSourceOptions } from './data-source-options';

try {
  process.loadEnvFile('.env');
} catch {
  // .env не обязателен — переменные могут прийти из окружения
}

export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));
