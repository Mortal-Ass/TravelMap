import pg from 'pg';
import {readdir,readFile} from 'node:fs/promises';
const dir=new URL('../database/migrations/',import.meta.url);
const client=new pg.Client();
await client.connect();
try{
 await client.query('SELECT pg_advisory_lock(925041)');
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY)');
 for(const name of (await readdir(dir)).filter(n=>/^\d+_.*\.sql$/.test(n)).sort()){
  const version=name.split('_')[0];
  if((await client.query('SELECT 1 FROM schema_migrations WHERE version=$1',[version])).rowCount)continue;
  const sql=(await readFile(new URL(name,dir),'utf8')).trim().replace(/^BEGIN;\s*/i,'').replace(/\s*COMMIT;$/i,'');
  await client.query('BEGIN');
  try{await client.query(sql);await client.query('COMMIT');console.log('Applied migration',version)}
  catch(error){await client.query('ROLLBACK');throw error}
 }
}finally{await client.end()}
