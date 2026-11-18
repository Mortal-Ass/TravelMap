import {locationSnapshot,reportLocation} from './locations.js';
import {transitRoute} from './transit.js';
import {validateStops,roadRoute,type Stop} from './itinerary.js';
import {fetch,ProxyAgent} from 'undici';
import { Controller, Get, Post, Patch, Body, Req, Res, Param, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { digest, token, hashPassword, verifyPassword } from './security.js';
const fail=(message:string,status=400):never=>{throw new HttpException({message},status);};
function text(value:unknown,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.length>max)fail('输入格式或长度不正确');return (value as string).trim();}
function tripInput(body:any){const name=text(body.name,1,120),destination=text(body.destination,1,200),description=text(body.description??'',0,5000);const start=text(body.startDate,10,10),end=text(body.endDate,10,10);for(const date of [start,end]){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail('日期无效');}if(end<start)fail('结束日期不能早于开始日期');const timezone=text(body.timezone??'Asia/Shanghai',1,80);try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{fail('时区无效');}return [name,destination,start,end,timezone,description];}
@Controller()
export class ApiController{
 private async user(req:any,write=false){const cookie=String(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);if(!cookie)fail('请先登录',401);const {rows}=await db.query('SELECT s.*,u.email,u.nickname FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now()',[digest(cookie!)]);if(!rows[0])fail('登录已过期',401);if(write&&req.headers['x-csrf-token']!==rows[0].csrf_token)fail('请求校验失败',403);return rows[0];}
 private async session(id:string,res:any){const value=token(),csrf=token();await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '7 days',$3)",[digest(value),id,csrf]);res.setHeader('Set-Cookie',`session=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`);return csrf;}
 @Get('health') async health(){await db.query('SELECT 1');return {status:'ok'};}
 @Post('auth/register') async register(@Body() body:any,@Res({passthrough:true}) res:any){const email=text(body.email,3,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('邮箱格式无效');const password=text(body.password,8,128),nickname=text(body.nickname,1,60);const id=randomUUID();try{await db.query('INSERT INTO users(id,email,password_hash,nickname) VALUES($1,$2,$3,$4)',[id,email,await hashPassword(password),nickname]);}catch(e:any){if(e.code==='23505')fail('该邮箱已注册',409);throw e;}return {id,email,nickname,csrfToken:await this.session(id,res)};}
 @Post('auth/login') async login(@Body() body:any,@Res({passthrough:true}) res:any){const email=text(body.email,3,254).toLowerCase(),password=text(body.password,1,128);const {rows}=await db.query('SELECT * FROM users WHERE email=$1',[email]);if(!rows[0]||!await verifyPassword(password,rows[0].password_hash))fail('邮箱或密码错误',401);return {id:rows[0].id,email,nickname:rows[0].nickname,csrfToken:await this.session(rows[0].id,res)};}
 @Get('auth/me') async me(@Req() req:any){const u=await this.user(req);return {id:u.user_id,email:u.email,nickname:u.nickname,csrfToken:u.csrf_token};}
 @Post('auth/logout') async logout(@Req() req:any,@Res({passthrough:true}) res:any){const u=await this.user(req,true);await db.query('DELETE FROM sessions WHERE token_hash=$1',[u.token_hash]);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');return {ok:true};}
 @Get('trips') async list(@Req() req:any){const u=await this.user(req);return (await db.query('SELECT t.*,m.role FROM trips t JOIN trip_members m ON t.id=m.trip_id WHERE m.user_id=$1 ORDER BY t.created_at DESC',[u.user_id])).rows;}
 @Post('trips') async create(@Req() req:any,@Body() body:any){const u=await this.user(req,true),values=tripInput(body),id=randomUUID(),client=await db.connect();try{await client.query('BEGIN');const {rows}=await client.query('INSERT INTO trips(id,name,destination,start_date,end_date,timezone,description) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id,...values]);await client.query("INSERT INTO trip_members VALUES($1,$2,'owner')",[id,u.user_id]);await client.query('COMMIT');return {...rows[0],role:'owner'};}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
 @Get('trips/:id') async detail(@Req() req:any,@Param('id') id:string){if(!/^[0-9a-f-]{36}$/i.test(id))fail('旅行不存在',404);const u=await this.user(req);const {rows}=await db.query('SELECT t.*,m.role FROM trips t JOIN trip_members m ON t.id=m.trip_id WHERE t.id=$1 AND m.user_id=$2',[id,u.user_id]);return rows[0]??fail('旅行不存在',404);}
 @Patch('trips/:id') async update(@Req() req:any,@Param('id') id:string,@Body() body:any){await this.user(req,true);const trip=await this.detail(req,id);if(!['owner','admin'].includes(trip.role))fail('无编辑权限',403);const values=tripInput(body);if(!Number.isInteger(body.version))fail('缺少版本号');const {rows}=await db.query('UPDATE trips SET name=$2,destination=$3,start_date=$4,end_date=$5,timezone=$6,description=$7,version=version+1 WHERE id=$1 AND version=$8 RETURNING *',[id,...values,body.version]);return rows[0]??fail('行程已被修改，请刷新后重试',409);}
 private async placeAccess(req:any,id:string,write=false){
  if(write) await this.user(req,true);
  const trip=await this.detail(req,id);
  if(write && trip.role==='viewer') fail('无编辑权限',403);
 }
 @Get('trips/:id/places') async places(@Req() req:any,@Param('id') id:string){
  await this.placeAccess(req,id);
  return (await db.query('SELECT * FROM places WHERE trip_id=$1 ORDER BY name,id',[id])).rows;
 }
 @Post('trips/:id/places') async savePlace(@Req() req:any,@Param('id') id:string,@Body() body:any){
  await this.placeAccess(req,id,true);
  const {longitude,latitude,category}=body;
  if(!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(latitude)||Math.abs(latitude)>90) fail('坐标无效');
  if(!['景点','酒店','餐厅','交通','其他'].includes(category)) fail('分类无效');
  const values=[id,body.id??body.requestId??randomUUID(),text(body.name,1,180),category,longitude,latitude,text(body.notes??'',0,2000)];
  if(body.id)values.push(body.version);
  const query=body.id?'UPDATE places SET name=$3,category=$4,longitude=$5,latitude=$6,notes=$7,version=version+1 WHERE trip_id=$1 AND id=$2 AND version=$8 RETURNING *':'INSERT INTO places(trip_id,id,name,category,longitude,latitude,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *';
  const saved=(await db.query(query,values)).rows[0];
  if(saved)return saved;
  if(!body.id&&body.requestId){
   const existing=await db.query('SELECT * FROM places WHERE id=$1 AND trip_id=$2',[body.requestId,id]);
   if(existing.rowCount)return existing.rows[0];
  }
  fail('地点已更新，请重新选择地点后编辑',409);
 }
 private geocoderProxy=process.env.GEOCODER_PROXY ? new ProxyAgent(process.env.GEOCODER_PROXY) : undefined;
 private searchAfter=0;
 private searches=new Map<string,any>();
 @Get('trips/:id/search') async search(@Req() req:any,@Param('id') id:string){
  await this.placeAccess(req,id);
  const q=text(req.query.q,2,180);
  if(this.searches.has(q)) return this.searches.get(q);
  if(Date.now()<this.searchAfter) fail('请稍后再搜索',429);
  this.searchAfter=Date.now()+1100;
  const url=new URL(process.env.GEOCODER_URL||'https://nominatim.openstreetmap.org/search');
  url.search=new URLSearchParams({q,format:'jsonv2',limit:'5','accept-language':'zh'}).toString();
  try{
   const response=await fetch(url,{dispatcher:this.geocoderProxy,headers:{'User-Agent':'TravelMap/1.0 (self-hosted travel planner)'},signal:AbortSignal.timeout(8000)});
   if(!response.ok) throw Error();
   const rows=await response.json(); if(!Array.isArray(rows)) throw Error();
   const results=rows.map((r:any)=>({name:r.name||r.display_name,address:r.display_name,latitude:Number(r.lat),longitude:Number(r.lon)})).filter((r:any)=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude));
   if(this.searches.size>=500)this.searches.clear();
   this.searches.set(q,results);
   return results;
  }catch{fail('地点搜索暂时不可用，可点击地图选点',503);}
 }
 @Get('trips/:id/itinerary') async itinerary(@Req() req:any,@Param('id') id:string){
  const trip=await this.detail(req,id);
  return {items:trip.itinerary,version:trip.itinerary_version};
 }
 @Post('trips/:id/itinerary') async saveItinerary(@Req() req:any,@Param('id') id:string,@Body() body:any){
  await this.placeAccess(req,id,true);
  const dates=(await db.query('SELECT start_date::text,end_date::text FROM trips WHERE id=$1',[id])).rows[0];
  const places=await db.query('SELECT id FROM places WHERE trip_id=$1',[id]);
  validateStops(body.items,dates.start_date,dates.end_date,new Set(places.rows.map(p=>p.id)));
  const updated=await db.query('UPDATE trips SET itinerary=$2,itinerary_version=itinerary_version+1 WHERE id=$1 AND itinerary_version=$3 RETURNING itinerary_version',[id,JSON.stringify(body.items),body.version]);
  if(!updated.rowCount)fail('行程已更新，请刷新后重试',409);
  return {items:body.items,version:updated.rows[0].itinerary_version};
 }
 @Get('trips/:id/route') async route(@Req() req:any,@Param('id') id:string){
  const trip=await this.detail(req,id);
  const places=(await db.query('SELECT id,longitude,latitude FROM places WHERE trip_id=$1',[id])).rows;
  const lookup=new Map(places.map(p=>[p.id,p]));
  return roadRoute(req.query.mode,trip.itinerary.filter((s:Stop)=>s.day===req.query.day).map((s:Stop)=>lookup.get(s.place)));
 }
 @Get('trips/:id/leg') async leg(@Req() req:any,@Param('id') id:string){
  const trip=await this.detail(req,id);
  const stops:Stop[]=trip.itinerary.filter((s:Stop)=>s.day===req.query.day);
  const index=stops.findIndex(s=>s.id===req.query.from);
  const from=stops[index],to=stops[index+1];
  if(!from||!to||to.id!==req.query.to)fail('行程已变更，请刷新',409);
  const rows=(await db.query('SELECT * FROM places WHERE trip_id=$1 AND id=ANY($2::uuid[])',[id,[from.place,to.place]])).rows;
  const points=[from,to].map(s=>rows.find(p=>p.id===s.place));
  if(points.some(p=>!p))fail('地点不存在',404);
  if(req.query.mode==='transit'){
   if(!['8','2','3'].includes(req.query.strategy))fail('换乘偏好无效');
   return transitRoute(points,req.query.strategy,from.day,from.end||from.start);
  }
  const road=await roadRoute(req.query.mode,points);
  return [{duration:road.duration,steps:road.roads,geometry:road.geometry,distance:road.distance}];
 }
 @Post('trips/:id/import') async importGuide(@Req() req:any,@Param('id') id:string,@Body() body:any){
  await this.placeAccess(req,id,true);
  if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>100)fail('每次导入 1 至 100 站');
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   const trip=(await client.query('SELECT itinerary,start_date::text,end_date::text FROM trips WHERE id=$1 FOR UPDATE',[id])).rows[0];
   const places=(await client.query('SELECT * FROM places WHERE trip_id=$1',[id])).rows;
   const allowed=new Set<string>(places.map(p=>p.id));
   const added=[];
   const seen=new Set(trip.itinerary.map((s:Stop)=>s.id));
   for(const row of body.rows){
    if(!row||typeof row.id!=='string'||!row.id)fail('草稿项目无效');
    if(seen.has(row.id))continue;
    let place=row.place;
    if(!place){
     const name=text(row.name,1,180);
     if(!Number.isFinite(row.longitude)||Math.abs(row.longitude)>180||!Number.isFinite(row.latitude)||Math.abs(row.latitude)>90)fail('请确认每个地点的坐标');
     place=places.find(p=>p.name===name&&p.latitude===row.latitude&&p.longitude===row.longitude)?.id;
     if(!place){
      place=randomUUID();
      await client.query('INSERT INTO places(id,trip_id,name,category,longitude,latitude) VALUES($1,$2,$3,$4,$5,$6)',[place,id,name,'其他',row.longitude,row.latitude]);
      places.push({id:place,name,latitude:row.latitude,longitude:row.longitude});allowed.add(place);
     }
    }
    added.push({id:row.id,day:row.day,start:row.start,end:row.end,place});
   }
   const items=[...trip.itinerary,...added];
   validateStops(items,trip.start_date,trip.end_date,allowed);
   if(added.length)await client.query('UPDATE trips SET itinerary=$2,itinerary_version=itinerary_version+1 WHERE id=$1',[id,JSON.stringify(items)]);
   await client.query('COMMIT');
   return {count:added.length};
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 @Get('trips/:id/team') async team(@Req() req:any,@Param('id') id:string){
  const trip=await this.detail(req,id);
  const members=(await db.query('SELECT u.id,u.nickname,m.role FROM trip_members m JOIN users u ON u.id=m.user_id WHERE trip_id=$1 ORDER BY u.nickname',[id])).rows;
  const manage=['owner','admin'].includes(trip.role);
  const links=manage?(await db.query('SELECT id,kind,role,expires_at FROM trip_links WHERE trip_id=$1 AND expires_at>now() ORDER BY expires_at DESC',[id])).rows:[];
  return {members,links,role:trip.role};
 }
 @Post('trips/:id/links') async link(@Req() req:any,@Param('id') id:string,@Body() body:any){
  await this.user(req,true);
  const trip=await this.detail(req,id);
  if(!['owner','admin'].includes(trip.role))fail('需要管理权限',403);
  if(body.revoke){await db.query('DELETE FROM trip_links WHERE id=$1 AND trip_id=$2',[body.revoke,id]);return {ok:true}}
  const {kind,role='viewer'}=body;
  if(!['invite','public','login','members'].includes(kind)||!['viewer','editor','admin'].includes(role)||(role==='admin'&&trip.role!=='owner'))fail('链接设置无效');
  const code=token();
  await db.query("INSERT INTO trip_links VALUES($1,$2,$3,$4,$5,now()+interval '7 days')",[randomUUID(),id,digest(code),kind,role]);
  return {code};
 }
 @Post('join') async join(@Req() req:any,@Body() body:any){
  const user=await this.user(req,true);
  const result=await db.query(`WITH invite AS (SELECT trip_id,role FROM trip_links WHERE hash=$1 AND kind='invite' AND expires_at>now()),
   joined AS (INSERT INTO trip_members SELECT trip_id,$2,role FROM invite ON CONFLICT DO NOTHING)
   SELECT trip_id FROM invite`,[digest(text(body.code,1,100)),user.user_id]);
  return result.rows[0]??fail('邀请码已失效',404);
 }
 @Post('trips/:id/member') async member(@Req() req:any,@Param('id') id:string,@Body() body:any){
  const user=await this.user(req,true);
  const trip=await this.detail(req,id);
  const self=user.user_id===body.userId;
  if(self&&body.role!=='remove')fail('不能修改自己的角色',403);
  if(!self&&!['owner','admin'].includes(trip.role))fail('需要管理权限',403);
  if(!['remove','admin','editor','viewer'].includes(body.role)||(body.role==='admin'&&trip.role!=='owner'))fail('角色无效',403);
  const args=[id,body.userId,trip.role==='owner'||self];
  const condition=" WHERE trip_id=$1 AND user_id=$2 AND role!='owner' AND ($3 OR role!='admin')";
  const result=body.role==='remove'?await db.query('DELETE FROM trip_members'+condition,args):await db.query('UPDATE trip_members SET role=$4'+condition,[...args,body.role]);
  if(!result.rowCount)fail('无法修改该成员',403);return {ok:true};
 }
 @Get('shared/:code') async shared(@Req() req:any,@Res({passthrough:true}) res:any,@Param('code') code:string){
  res.setHeader('Cache-Control','no-store');
  const link=(await db.query("SELECT trip_id,kind FROM trip_links WHERE hash=$1 AND kind!='invite' AND expires_at>now()",[digest(code)])).rows[0];
  if(!link)fail('分享链接已失效',404);
  if(link.kind==='login')await this.user(req);
  if(link.kind==='members')await this.detail(req,link.trip_id);
  const trip=(await db.query('SELECT name,destination,start_date,end_date,itinerary FROM trips WHERE id=$1',[link.trip_id])).rows[0];
  const places=(await db.query('SELECT id,name,category,latitude,longitude FROM places WHERE trip_id=$1',[link.trip_id])).rows;
  return {name:trip.name,destination:trip.destination,start:trip.start_date,end:trip.end_date,places,items:trip.itinerary.map((s:Stop)=>({day:s.day,start:s.start,end:s.end,place:s.place}))};
 }
 @Get('trips/:id/location') async sharedLocations(@Req() req:any,@Param('id') id:string){
  const u=await this.user(req);
  return (await locationSnapshot(id,u.token_hash))??fail('无法访问此旅行',403);
 }
 @Post('trips/:id/location') async location(@Req() req:any,@Param('id') id:string,@Body() body:any){
  const u=await this.user(req,true);
  await this.detail(req,id);
  if(body.action==='sample')return {accepted:await reportLocation(id,u.token_hash,body)};
  if(body.action==='stop'){
   await db.query('DELETE FROM location_shares WHERE trip_id=$1 AND user_id=$2 AND grant_id=$3',[id,u.user_id,body.grant]);
   return {ok:true};
  }
  if(body.action!=='start'||![0,15,60].includes(body.minutes))fail('无效的共享时长');
  const recipients=body.recipients;
  if(recipients!==null&&(!Array.isArray(recipients)||recipients.length===0||recipients.length>500||!recipients.every(r=>typeof r==='string'&&/^[a-f0-9-]{36}$/i.test(r))))fail('请选择接收成员');
  const grant=randomUUID();
  const result=await db.query(`INSERT INTO location_shares(trip_id,user_id,grant_id,session_hash,recipients,expires_at)
   SELECT $1,$2,$3,$4,$5::uuid[],CASE WHEN $6::int>0 THEN now()+make_interval(mins=>$6) END
   WHERE NOT EXISTS(SELECT unnest($5::uuid[]) EXCEPT SELECT user_id FROM trip_members WHERE trip_id=$1)
   ON CONFLICT(trip_id,user_id) DO UPDATE SET grant_id=excluded.grant_id,session_hash=excluded.session_hash,
   recipients=excluded.recipients,expires_at=excluded.expires_at,latitude=NULL,longitude=NULL,accuracy=NULL,sampled_at=NULL,received_at=NULL
   RETURNING expires_at`,[id,u.user_id,grant,u.token_hash,recipients,body.minutes]);
  if(!result.rowCount)fail('接收者已不是旅行成员');
  return {grant,expires:result.rows[0].expires_at};
 }
}