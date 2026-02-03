import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function main(){
  try{
    const url = process.env.DATABASE_URL;
    console.log('Using DATABASE_URL (masked):', url ? url.replace(/:\/\/([^@]+)@/, '://***@') : url);
    const sql = neon(url as string);
    console.log('neon object keys:', Object.keys(sql));
    // try a drizzle-style query via neon's execute method if available
    if (typeof (sql as any).execute === 'function') {
      const res = await (sql as any).execute('select 1');
      console.log('Neon query result:', res);
    } else if (typeof (sql as any).query === 'function') {
      const res = await (sql as any).query('select 1');
      console.log('Neon query result:', res);
    } else {
      console.log('Neon client does not expose execute/query — printing object for inspection');
      console.dir(sql);
    }
  }catch(e){
    console.error('Neon test failed:', e);
    process.exitCode = 2;
  }
}

main();
