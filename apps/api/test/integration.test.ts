import WebSocket from 'ws';
import {test} from 'node:test';
import assert from 'node:assert/strict';
// Run against a dedicated, migrated PostgreSQL database and running API.
test('真实 PostgreSQL/API：认证、CSRF、旅行隔离与版本冲突',{skip:!process.env.TEST_API_URL},async()=>{
 const base=process.env.TEST_API_URL!;
 async function request(path:string,method='GET',body?:unknown,cookie='',csrf=''){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',cookie,'x-csrf-token':csrf},body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]??''};
 }
 const suffix=Date.now();
 const a=await request('/auth/register','POST',{email:`a${suffix}@example.com`,password:'a-long-test-password',nickname:'A'});
 const b=await request('/auth/register','POST',{email:`b${suffix}@example.com`,password:'a-long-test-password',nickname:'B'});
 assert.equal(a.status,201);assert.equal(b.status,201);
 const body={name:'测试旅行',destination:'东京',startDate:'2027-01-01',endDate:'2027-01-03',timezone:'Asia/Tokyo'};
 assert.equal((await request('/trips','POST',body,a.cookie)).status,403);
 const trip=await request('/trips','POST',body,a.cookie,a.data.csrfToken);assert.equal(trip.status,201);
 assert.equal((await request('/trips/'+trip.data.id,'GET',undefined,b.cookie)).status,404);
 assert.equal((await request('/trips','GET',undefined,b.cookie)).data.length,0);
 assert.equal((await request('/trips/'+trip.data.id,'PATCH',{...body,version:1},a.cookie,a.data.csrfToken)).status,200);
 assert.equal((await request('/trips/'+trip.data.id,'PATCH',{...body,version:1},a.cookie,a.data.csrfToken)).status,409);
 const placesPath='/trips/'+trip.data.id+'/places';
 assert.equal((await request(placesPath,'GET',undefined,b.cookie)).status,404);
 const place={name:'测试地点',category:'景点',longitude:123,latitude:42};
 assert.equal((await request(placesPath,'POST',place,b.cookie,b.data.csrfToken)).status,404);
 assert.equal((await request(placesPath,'POST',place,a.cookie,a.data.csrfToken)).status,201);
 assert.equal((await request(placesPath,'GET',undefined,a.cookie)).data[0].longitude,123);
 const path='/trips/'+trip.data.id;
 const owner=(p:string,data:unknown)=>request(path+p,'POST',data,a.cookie,a.data.csrfToken);
 const editor=(p:string,data:unknown)=>request(p,'POST',data,b.cookie,b.data.csrfToken);
 const invite=await owner('/links',{kind:'invite',role:'editor'});
 for(let i=0;i<2;i++)assert.equal((await editor('/join',{code:invite.data.code})).status,201);
 const stream=()=>new WebSocket(base.replace(/^http/,'ws')+'/sync/'+trip.data.id,{headers:{cookie:b.cookie,origin:new URL(base).origin}});
 const revision=(ws:WebSocket)=>new Promise<string>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('等待同步超时')),6000);
  ws.once('message',m=>{clearTimeout(timer);resolve(m.toString())});
  ws.once('error',reject);
 });
 const ws=stream();const initial=await revision(ws);const changed=revision(ws);
 const saved=await editor(placesPath,{...place,notes:'私人备注'});
 assert.equal(saved.status,201);assert.notEqual(await changed,initial);ws.close();
 assert.equal((await owner('/places',{...saved.data,name:'更新'})).status,201);
 assert.equal((await editor(placesPath,saved.data)).status,409);
 const reopened=stream();await revision(reopened);reopened.close();
 assert.ok((await request(placesPath,'GET',undefined,b.cookie)).data.some((p:{name:string})=>p.name==='更新'));
 await owner('/member',{userId:b.data.id,role:'viewer'});
 assert.equal((await editor(placesPath,place)).status,403);
 const publicLink=await owner('/links',{kind:'public'});
 const shared=await request('/shared/'+publicLink.data.code);
 assert.equal(shared.status,200);assert.equal(JSON.stringify(shared.data).includes('私人备注'),false);
 const team=await request(path+'/team','GET',undefined,a.cookie);
 await owner('/links',{revoke:team.data.links.find((l:{kind:string})=>l.kind==='public').id});
 assert.equal((await request('/shared/'+publicLink.data.code)).status,404);
 const locationSocket=(cookie:string)=>new WebSocket(base.replace(/^http/,'ws')+'/locations/'+trip.data.id,{headers:{cookie,origin:new URL(base).origin}});
 const sender=locationSocket(a.cookie),receiver=locationSocket(b.cookie);
 try{
  await Promise.all([revision(sender),revision(receiver)]);
  const loc='/location';
  const start=async(recipients:string[]|null)=>await owner(loc,{action:'start',minutes:15,recipients});
  const sample=(grant:string)=>sender.send(JSON.stringify({grant,lat:41.8,lon:123.4,time:Date.now(),accuracy:8}));
  const hidden=await start([a.data.id]);sample(hidden.data.grant);
  assert.equal(JSON.parse(await revision(sender)).locations.length,1);
  assert.equal(JSON.parse(await revision(receiver)).locations.length,0);
  const visible=await start([b.data.id]);sample(visible.data.grant);
  assert.equal(JSON.parse(await revision(receiver)).locations[0].id,a.data.id);
  assert.equal((await request('/shared/'+publicLink.data.code)).status,404);
  assert.equal((await owner(loc,{action:'stop',grant:visible.data.grant})).status,201);
  sample(visible.data.grant);
  assert.equal(JSON.parse(await revision(receiver)).locations.length,0);
 }finally{sender.close();receiver.close()}
 await owner('/member',{userId:b.data.id,role:'remove'});
 assert.equal((await request(placesPath,'GET',undefined,b.cookie)).status,404);
 assert.equal((await request('/auth/logout','POST',{},a.cookie,a.data.csrfToken)).status,201);
 assert.equal((await request('/auth/me','GET',undefined,a.cookie)).status,401);
});
