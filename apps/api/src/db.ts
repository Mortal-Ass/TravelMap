import { Pool, types } from 'pg';
import { config } from 'dotenv';
config({path:'../../.env'});
types.setTypeParser(1082, value => value); // Preserve local calendar dates in API responses.
export const db = new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000});
