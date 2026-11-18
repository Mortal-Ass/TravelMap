import {TileController} from './tiles.js';
import {enableSync} from './sync.js';
import 'reflect-metadata';
import { config } from 'dotenv';
config({path:'../../.env'});
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ApiController } from './routes.js';
@Module({controllers:[ApiController,TileController]})
class AppModule {}
const app=await NestFactory.create(AppModule);
const attempts=new Map<string,{count:number;until:number}>();
app.use((req:any,res:any,next:()=>void)=>{
 if(req.method==='POST' && /^\/api\/auth\/(login|register)$/.test(req.path)){
  const now=Date.now();
  for(const [key,value] of attempts)if(value.until<now)attempts.delete(key);
  const key=req.ip;const entry=attempts.get(key)??{count:0,until:now+60000};
  attempts.set(key,entry);if(++entry.count>20){res.status(429).json({message:'请求过于频繁，请稍后重试'});return;}
 }
 next();
});
app.setGlobalPrefix('api');
await app.listen(Number(process.env.PORT || 3001),process.env.HOST || '127.0.0.1');

enableSync(app.getHttpServer());
