import {locationStream,cleanLocations} from './locations.js';
import {WebSocketServer} from 'ws';
import type {Server} from 'node:http';
import {digest} from './security.js';
import {db} from './db.js';

export function enableSync(server:Server){
 const sweep=setInterval(()=>{void cleanLocations().catch(()=>{})},15000);
 server.once('close',()=>clearInterval(sweep));
 const sockets=new WebSocketServer({noServer:true,maxPayload:256});
 server.on('upgrade',async(req,socket,head)=>{
  const trip=req.url?.match(/^\/api\/(?:sync|locations)\/([\da-f-]{36})$/i)?.[1];
  const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('session='))?.slice(8);
  try{
   if(!trip||!cookie||!req.headers.origin||new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return}
   const values=[trip,digest(cookie)];
   const revision=async()=>(await db.query(`SELECT concat_ws('/',t.activity,t.version,t.itinerary_version) AS rev
    FROM trips t JOIN trip_members m ON m.trip_id=t.id JOIN sessions s ON s.user_id=m.user_id
    WHERE t.id=$1 AND s.token_hash=$2 AND s.expires_at>now()`,values)).rows[0]?.rev;
   if(!await revision()){socket.destroy();return}
   const viewer=(await db.query('SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()',[values[1]])).rows[0];
   if(!viewer){socket.destroy();return}
   sockets.handleUpgrade(req,socket,head,ws=>{
    if(req.url?.startsWith('/api/locations/')){locationStream(ws,trip,values[1],viewer.user_id);return}
    let last='',checking=false;
    async function check(){
     if(checking)return;
     checking=true;
     try{const next=await revision();if(!next){ws.close(1008);return}
      if(last!==next){last=next;ws.send(next)}
     }catch{ws.close(1011)}finally{checking=false}
    }
    const timer=setInterval(check,1500);
    ws.once('close',()=>clearInterval(timer));ws.on('error',()=>ws.terminate());void check();
   });
  }catch{socket.destroy()}
 });
}
