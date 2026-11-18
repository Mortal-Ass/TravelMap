import {Controller,Get,Param,Req,Res} from '@nestjs/common';
import {fetch,ProxyAgent} from 'undici';

type Tile={bytes:Buffer;expiry:number;etag:string|null};
const cache=new Map<string,Tile>();
const pending=new Map<string,Promise<Tile>>();
let proxy:ProxyAgent|undefined;

async function load(path:string,origin:string,old?:Tile){
 const proxyUrl=process.env.TILE_PROXY??process.env.GEOCODER_PROXY;
 if(proxyUrl&&!proxy)proxy=new ProxyAgent(proxyUrl);
 const response=await fetch('https://tile.openstreetmap.org/'+path,{
  dispatcher:proxy,signal:AbortSignal.timeout(12000),redirect:'error',
  headers:{'User-Agent':'TravelMap/1.0 ('+origin+')',Referer:origin+'/',...(old?.etag?{'If-None-Match':old.etag}:{})}
 });
 const age=response.headers.get('cache-control')?.match(/max-age=(\d+)/i);
 const expiry=Date.now()+1000*(age?Number(age[1]):604800);
 if(response.status===304&&old)return {...old,expiry};
 if(!response.ok||!response.headers.get('content-type')?.startsWith('image/png'))throw Error('Tile unavailable');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>1024*1024||!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw Error('Invalid tile');
 return {bytes,expiry,etag:response.headers.get('etag')};
}

@Controller('tiles')
export class TileController{
 @Get(':z/:x/:file')
 async tile(@Param() p:{z:string;x:string;file:string},@Req() req:any,@Res() res:any){
  const y=p.file.match(/^(\d{1,6})\.png$/)?.[1];
  if(!/^\d{1,2}$/.test(p.z)||!/^\d{1,6}$/.test(p.x)||!y||+p.z>19||+p.x>=2**+p.z||+y>=2**+p.z)return res.sendStatus(404);
  const path=[+p.z,+p.x,+y+'.png'].join('/');
  let entry=cache.get(path);
  if(!entry||entry.expiry<=Date.now()){
   let request=pending.get(path);
   if(!request){
    if(pending.size>=32)return res.sendStatus(429);
    let origin:string;
    try{origin=new URL(req.headers.referer||'https://'+req.headers.host).origin}catch{return res.sendStatus(400)}
    request=load(path,origin,entry).then(tile=>{
     cache.delete(path);
     if(cache.size>=512)cache.delete(cache.keys().next().value!);
     cache.set(path,tile);return tile;
    }).finally(()=>pending.delete(path));
    pending.set(path,request);
   }
   try{entry=await request}catch{return res.status(503).set('Cache-Control','no-store').end()}
  }
  res.set('Cache-Control','public, max-age='+Math.max(0,Math.floor((entry.expiry-Date.now())/1000)));
  if(entry.etag)res.set('ETag',entry.etag);
  return res.type('png').send(entry.bytes);
 }
}
