import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('No DATABASE_URL');
  const sql = neon(process.env.DATABASE_URL);
  const desc = 'Focuses on the theory, design, and application of computing technologies. This department prepares students to solve complex problems through software development, artificial intelligence, and cybersecurity while exploring the innovation process that transforms technical ideas into real-world products.';
  try {
    const res = await (sql as any).query(`INSERT INTO "departments" (code, name, description) VALUES ($1, $2, $3) RETURNING id, code, name, description`, [ 'CSC-DB', 'Computer Science DB', desc]);
    console.log('Insert result:', JSON.stringify(res, null, 2));
  } catch (e:any) {
    console.error('Insert failed:', e);
  }
}

main().catch(e=>{console.error(e); process.exit(1)});
