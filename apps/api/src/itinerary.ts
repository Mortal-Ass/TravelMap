import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {fetch,ProxyAgent} from 'undici';

export type Stop={id:string;place:string;day:string;start:string;end:string};
export function validateStops(items:Stop[],first:string,last:string,places:Set<string>){
 if(!Array.isArray(items)||items.length>500)throw new BadRequestException('每次旅行最多安排 500 站');
 const ids=new Set();
 for(const item of items){
  if(!item||typeof item.id!=='string'||item.id.length>64||ids.has(item.id)||!places.has(item.place))
   throw new BadRequestException('行程包含无效地点或重复项目');
  ids.add(item.id);
  if(typeof item.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item.day)||!Number.isFinite(Date.parse(item.day))||new Date(item.day).toISOString().slice(0,10)!==item.day||item.day<first||item.day>last)
   throw new BadRequestException('日期不在旅行范围内');
  if(![item.start,item.end].every(t=>typeof t==='string'&&(t===''||/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))||(item.start&&item.end&&item.end<item.start))
   throw new BadRequestException('请检查起止时间');
 }
}
const endpoints:Record<string,string>={drive:'https://routing.openstreetmap.de/routed-car/route/v1/driving',walk:'https://routing.openstreetmap.de/routed-foot/route/v1/driving',bike:'https://routing.openstreetmap.de/routed-bike/route/v1/driving'};
let proxy:ProxyAgent|undefined;
export async function roadRoute(mode:string,places:{longitude:number;latitude:number}[]){
 if(!Object.hasOwn(endpoints,mode)||places.length<2||places.length>50)throw new BadRequestException('每天计算路线需要 2 至 50 站');
 const endpoint=process.env['ROUTE_'+mode.toUpperCase()+'_URL']||endpoints[mode];
 const coords=places.map(p=>[p.longitude,p.latitude].join(',')).join(';');
 const proxyUrl=process.env.ROUTE_PROXY??process.env.GEOCODER_PROXY;
 if(proxyUrl&&!proxy)proxy=new ProxyAgent(proxyUrl);
 try{
  const response=await fetch(endpoint.replace(/\/$/,'')+'/'+coords+'?overview=full&geometries=geojson&steps=true',{dispatcher:proxy,signal:AbortSignal.timeout(15000),headers:{'User-Agent':'TravelMap/1.0'}});
  if(!response.ok)throw Error();
  const body=await response.json() as any;
  const route=body.routes?.[0];
  if(body.code!=='Ok'||route?.geometry?.type!=='LineString'||!route.geometry.coordinates?.length||!Number.isFinite(route.distance)||!Number.isFinite(route.duration))throw Error();
  return {geometry:route.geometry,distance:route.distance,duration:route.duration,roads:[...new Set(route.legs.flatMap((leg:any)=>leg.steps.map((step:any)=>step.name).filter(Boolean)))]};
 }catch{throw new ServiceUnavailableException('此交通方式暂无可用道路路线，请重试或更换方式');}
}
