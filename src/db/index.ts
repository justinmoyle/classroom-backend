import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

function maskDbUrl(url: string | undefined) {
  if (!url) return undefined;
  return url.replace(/:\/\/([^@]+)@/, '://***@');
}

let sql;
try {
  const dbUrl = process.env.DATABASE_URL;
  try {
    const parsed = new URL(dbUrl);
    if (parsed.hostname.includes('0.0.1') || parsed.hostname === 'api.0.0.1') {
      console.warn('DATABASE_URL hostname looks suspicious:', parsed.hostname);
    }
  } catch (err) {
    console.warn('Could not parse DATABASE_URL host for inspection.');
  }

  sql = neon(process.env.DATABASE_URL);
} catch (e) {
  console.error('Failed to initialize Neon client. DATABASE_URL may be malformed (masked):', maskDbUrl(process.env.DATABASE_URL));
  throw e;
}

export const db = drizzle(sql);
