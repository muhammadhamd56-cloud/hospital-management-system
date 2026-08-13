import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Loads backend/api/.env.test into process.env before the e2e suite boots
 * the Nest app, so it connects to the dedicated test database instead of
 * whatever DATABASE_URL a developer's shell/.env happens to have set.
 * Hand-rolled instead of adding the `dotenv` package as a new dependency —
 * it's already a transitive dep of @nestjs/config, but relying on that
 * indirectly would be fragile.
 */
function loadEnvFile(path: string): void {
  const content = readFileSync(path, 'utf-8');

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile(join(__dirname, '..', '.env.test'));
