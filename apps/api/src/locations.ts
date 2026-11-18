import type WebSocket from 'ws';
import {db} from './db.js';

const online=new Map<string,number>();
const lastSeen=new Map<string,number>();
const member=`FROM trip_members m JOIN sessions s ON s.user_id=m.user_id
  WHERE m.trip_id=$1 AND s.token_hash=$2 AND s.expires_at>now()`;
export async function locationSnapshot(trip:string,hash:string){
   const result=await db.query(`WITH viewer AS (SELECT m.user_id ${member})
    SELECT v.user_id AS viewer,l.user_id,u.nickname,l.latitude,l.longitude,l.accuracy,l.sampled_at,l.expires_at,
    CASE WHEN l.user_id=v.user_id THEN l.grant_id END AS own
    FROM viewer v LEFT JOIN (location_shares l JOIN users u ON u.id=l.user_id
    JOIN sessions owner_session ON owner_session.token_hash=l.session_hash AND owner_session.expires_at>now())
    ON l.trip_id=$1 AND (l.expires_at IS NULL OR l.expires_at>now())
    AND (l.user_id=v.user_id OR l.recipients IS NULL OR v.user_id=ANY(l.recipients))`,[trip,hash]);
   if(!result.rowCount)return null;
   const rows=result.rows;
   lastSeen.set(trip+'/'+rows[0].viewer,Date.now());
   return {own:rows.find(r=>r.own)?.own??null,locations:rows.filter(r=>r.latitude!==null).map(r=>({
    id:r.user_id,name:r.nickname,lat:r.latitude,lon:r.longitude,accuracy:r.accuracy,time:r.sampled_at,expires:r.expires_at,online:online.has(trip+'/'+r.user_id)||Date.now()-(lastSeen.get(trip+'/'+r.user_id)??0)<15000
   }))};
}
export async function reportLocation(trip:string,hash:string,p:any){
 if(typeof p.grant!=='string'||![p.lat,p.lon,p.accuracy,p.time].every(Number.isFinite)||Math.abs(p.lat)>90||Math.abs(p.lon)>180||p.accuracy<0||Math.abs(Date.now()-p.time)>120000)return false;
   const result=await db.query(`UPDATE location_shares SET latitude=$3,longitude=$4,accuracy=$5,sampled_at=to_timestamp($6/1000.0),received_at=now()
    WHERE trip_id=$1 AND session_hash=$2 AND grant_id=$7 AND user_id IN (SELECT m.user_id ${member})
    AND (expires_at IS NULL OR expires_at>now()) AND (received_at IS NULL OR received_at <= now() - interval '900 milliseconds') AND (sampled_at IS NULL OR sampled_at<to_timestamp($6/1000.0))`,
    [trip,hash,p.lat,p.lon,p.accuracy,p.time,p.grant]);
 return !!result.rowCount;
}
export function locationStream(ws:WebSocket,trip:string,hash:string,user:string){
 const presence=trip+'/'+user;
 online.set(presence,(online.get(presence)??0)+1);
 let busy=false,lastWrite=0;
 async function snapshot(){
  if(busy||ws.readyState!==1)return;
  busy=true;
  try{
   const data=await locationSnapshot(trip,hash);
   if(!data){ws.close(1008);return}
   ws.send(JSON.stringify(data));
  }catch{ws.close(1011)}finally{busy=false}
 }
 ws.on('message',async raw=>{
  try{
   const p=JSON.parse(raw.toString());

   if(Date.now()-lastWrite<900)return;
   lastWrite=Date.now();
   await reportLocation(trip,hash,p);
  }catch{ws.close(1008)}
 });
 const timer=setInterval(snapshot,2000);
 ws.once('close',()=>{clearInterval(timer);const count=(online.get(presence)??1)-1;if(count)online.set(presence,count);else online.delete(presence)});
 ws.on('error',()=>ws.terminate());void snapshot();
}
export function cleanLocations(){
 for(const [key,time] of lastSeen)if(Date.now()-time>=15000)lastSeen.delete(key);
 return db.query(`DELETE FROM location_shares l WHERE expires_at<=now()
 OR EXISTS(SELECT 1 FROM sessions s WHERE s.token_hash=l.session_hash AND s.expires_at<=now())`);
}
