import { config } from 'dotenv';
import { execSync } from 'child_process';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const PG_BIN = process.env.PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
const url = process.env.DATABASE_URL ?? '';
const m = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
if (!m) throw new Error('Invalid DATABASE_URL');
process.env.PGPASSWORD = m[2];
const psql = `"${PG_BIN}\\psql.exe"`;
const out = execSync(`${psql} -h ${m[3]} -p ${m[4] ?? '5432'} -U ${m[1]} -d ${m[5]} -tAc "SELECT rolcreatedb, rolsuper FROM pg_roles WHERE rolname='${m[1]}';"`, { encoding: 'utf8' });
console.log(`role ${m[1]}: createdb=${out.trim().split('|')[0]} super=${out.trim().split('|')[1]}`);
