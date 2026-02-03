import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  const sql = neon(process.env.DATABASE_URL);
  console.log('sql keys:', Object.keys(sql));
  const qry = `SELECT table_name, column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name IN ('departments','subjects')
ORDER BY table_name, column_name`;
  // try different methods
  if (typeof (sql as any).query === 'function') {
    const res = await (sql as any).query(qry);
    console.log('query result:', JSON.stringify(res, null, 2));
  } else if (typeof (sql as any).prepare === 'function') {
    const p = (sql as any).prepare(qry);
    const res = await p.execute([]);
    console.log('prepared result:', JSON.stringify(res, null, 2));
  } else {
    console.warn('No known query method on neon client');
  }
}

main().catch((e)=>{console.error(e); process.exit(1)});
