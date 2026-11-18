import { randomBytes, scrypt as rawScrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(rawScrypt);
export const token = () => randomBytes(32).toString('hex');
export const digest = (value:string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password:string){const salt=token();const hash=await scrypt(password,salt,64) as Buffer;return `${salt}:${hash.toString('hex')}`;}
export async function verifyPassword(password:string,stored:string){const [salt,hex]=stored.split(':');const actual=await scrypt(password,salt,64) as Buffer;const expected=Buffer.from(hex,'hex');return actual.length===expected.length && timingSafeEqual(actual,expected);}
