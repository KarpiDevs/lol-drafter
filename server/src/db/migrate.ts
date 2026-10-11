import { runMigrations, DB_PATH } from './index';

runMigrations();
console.log(`Migraciones aplicadas en ${DB_PATH}`);
