import coordinates from 'coordtransform';
import {ServiceUnavailableException} from '@nestjs/common';
import {fetch,ProxyAgent} from 'undici';

let proxy:ProxyAgent|undefined;
async function amap(path:string,params:Record<string,string>){
 const key=process.env.AMAP_WEB_SERVICE_KEY;
 if(!key)throw new ServiceUnavailableException('公交规划需要管理员配置高德 Web 服务 Key');
 const url=new URL(path,'https://restapi.amap.com');
 url.search=new URLSearchParams({...params,key}).toString();
 const proxyUrl=process.env.ROUTE_PROXY??process.env.GEOCODER_PROXY;
 if(proxyUrl&&!proxy)proxy=new ProxyAgent(proxyUrl);
 try{
  const response=await fetch(url,{dispatcher:proxy,signal:AbortSignal.timeout(12000)});
  const data=await response.json() as any;
  if(!response.ok||data.status!=='1')throw new ServiceUnavailableException('高德服务暂不可用，服务码 '+String(data.infocode??response.status));
  return data;
 }catch(e){if(e instanceof ServiceUnavailableException)throw e;throw new ServiceUnavailableException('无法连接高德路线服务');}
}
export function transitOptions(transits:any[]){
 return transits.flatMap(t=>{
  const lines:number[][][]=[];
  const steps:string[]=[];
  let rides=0,walking=0;
  function line(raw:unknown){
   if(raw && typeof raw==='object' && 'polyline' in raw)raw=raw.polyline;
   if(typeof raw!=='string')return;
   const points=raw.split(';').map(pair=>pair.split(',').map(Number));
   if(points.length>1&&points.every(p=>p.length===2&&p.every(Number.isFinite)))lines.push(points.map(([x,y])=>coordinates.gcj02towgs84(x,y)));
  }
  for(const segment of t.segments??[]){
   if(segment.railway?.id||segment.taxi?.distance)return [];
   if(Number(segment.walking?.distance)>0){
    walking+=Number(segment.walking.distance);
    steps.push('步行 '+segment.walking.distance+' 米');
    for(const step of segment.walking.steps??[])line(step.polyline);
   }
   const bus=segment.bus?.buslines?.[0];
   if(bus){rides++;steps.push([bus.name,bus.departure_stop?.name+' 上车',bus.arrival_stop?.name+' 下车'].join(' · '));line(bus.polyline);}
  }
  const duration=Number(t.cost?.duration??t.duration);
  if(!rides||!Number.isFinite(duration)||duration<=0)return [];
  return [{duration,walking,transfers:rides-1,steps,geometry:{type:'MultiLineString',coordinates:lines}}];
 });
}
export async function transitRoute(points:{longitude:number;latitude:number}[],strategy:string,day:string,time:string){
 const locations=points.map(p=>coordinates.wgs84togcj02(p.longitude,p.latitude).map(n=>n.toFixed(6)).join(','));
 const cities=await Promise.all(locations.map(async location=>{
  const data=await amap('/v3/geocode/regeo',{location});
  const code=data.regeocode?.addressComponent?.citycode;
  if(typeof code!=='string'||!code)throw new ServiceUnavailableException('无法识别站点所在城市');
  return code;
 }));
 const data=await amap('/v5/direction/transit/integrated',{origin:locations[0],destination:locations[1],city1:cities[0],city2:cities[1],strategy,date:day,...(time?{time:time.replace(':','-')}:{}),show_fields:'cost,polyline',AlternativeRoute:'5'});
 const options=transitOptions(data.route?.transits??[]);
 const score=(o:typeof options[number])=>strategy==='2'?o.transfers:strategy==='3'?o.walking:o.duration;
 return options.sort((a,b)=>score(a)-score(b)||a.duration-b.duration);
}
