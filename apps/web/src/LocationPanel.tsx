import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import {write} from './Team';
import {readApiResponse} from './api';

type Location={id:string;name:string;lat:number;lon:number;accuracy:number;time:string;expires:string|null;online:boolean};
type Member={id:string;nickname:string};
export function LocationPanel({trip,csrf,user,map,sync}:{trip:string;csrf:string;user:string;map:L.Map|null;sync:number}){
 const [members,setMembers]=useState<Member[]>([]),[all,setAll]=useState(true),[audience,setAudience]=useState<string[]>([]);
 const [minutes,setMinutes]=useState(15),[own,setOwn]=useState<string|null>(null),[rows,setRows]=useState<Location[]>([]);
 const [connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const socket=useRef<WebSocket|null>(null),watch=useRef<number|null>(null),active=useRef<string|null>(null),mounted=useRef(false);
 const expiry=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const path='trips/'+trip+'/location';
 function clearWatch(){
  active.current=null;clearTimeout(expiry.current);
  if(watch.current!==null){navigator.geolocation.clearWatch(watch.current);watch.current=null}
 }
 async function stop(grant:string){
  clearWatch();
  try{await write(path,csrf,{action:'stop',grant});if(mounted.current){setOwn(null);setMessage('位置共享已停止')}}
  catch{if(mounted.current)setMessage('本机已停止定位。连接恢复后请再次停止共享，以清除服务端最后位置。')}
 }
 useEffect(()=>{
  let live=true;
  fetch('/api/trips/'+trip+'/team').then(readApiResponse).then(team=>{if(live)setMembers(team.members.filter((m:Member)=>m.id!==user))}).catch(()=>{if(live)setMembers([])});
  return()=>{live=false};
 },[trip,user,sync]);
 useEffect(()=>{
  mounted.current=true;
  let closed=false,timer:ReturnType<typeof setTimeout>;
  function connect(){
   const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/locations/'+trip);
   socket.current=ws;
   ws.onmessage=e=>{
    if(closed)return;
    const data=JSON.parse(e.data);
    setConnected(true);setOwn(data.own);setRows(data.locations);
    if(active.current&&data.own!==active.current)clearWatch();
   };
   ws.onclose=e=>{if(closed)return;setConnected(false);setRows([]);if(e.code===1008){clearWatch();setOwn(null);return}timer=setTimeout(connect,2200)};
  }
  connect();
  return()=>{closed=true;mounted.current=false;clearTimeout(timer);const grant=active.current;clearWatch();socket.current?.close();if(grant)void write(path,csrf,{action:'stop',grant}).catch(()=>{})};
 },[trip,csrf]);
 useEffect(()=>{
  if(!map)return;
  const layer=L.layerGroup().addTo(map);
  for(const row of rows){
   if(row.expires&&Date.parse(row.expires)<=Date.now())continue;
   const point:L.LatLngTuple=[row.lat,row.lon];
   const avatar=document.createElement('span');avatar.textContent=row.name.slice(0,1);
   const label=document.createElement('span');label.textContent=row.name+' · '+new Date(row.time).toLocaleTimeString();
   L.marker(point,{title:row.name,icon:L.divIcon({className:'place-pin',html:avatar,iconSize:[28,28]})}).bindTooltip(label).addTo(layer);
   L.circle(point,{radius:row.accuracy,weight:1,fillOpacity:.08}).addTo(layer);
  }
  return()=>{layer.remove()};
 },[map,rows]);
 async function start(){
  if(!window.isSecureContext||!navigator.geolocation){setMessage('定位需要 HTTPS 或本机 localhost，并需要浏览器支持定位');return}
  setBusy(true);setMessage('');
  try{
   const result=await write(path,csrf,{action:'start',minutes,recipients:all?null:audience});
   if(!mounted.current){await write(path,csrf,{action:'stop',grant:result.grant});return}
   active.current=result.grant;setOwn(result.grant);setMessage('正在等待浏览器定位');
   if(result.expires)expiry.current=setTimeout(()=>{clearWatch();setOwn(null);setMessage('位置共享已到期')},Math.max(0,Date.parse(result.expires)-Date.now()));
   watch.current=navigator.geolocation.watchPosition(p=>{
    if(active.current!==result.grant)return;
    if(socket.current?.readyState===WebSocket.OPEN){
     socket.current.send(JSON.stringify({grant:result.grant,lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,time:p.timestamp}));
     setMessage('定位中');
    }
   },err=>{
    if(active.current!==result.grant)return;
    if(err.code===1){void stop(result.grant).then(()=>setMessage('定位权限被拒绝或撤销，已停止定位'))}
    else setMessage('暂时无法取得新位置，请检查设备定位');
   },{enableHighAccuracy:true,maximumAge:0,timeout:20000});
  }catch(e){const grant=active.current;if(grant)void stop(grant);setMessage((e as Error).message)}finally{setBusy(false)}
 }
 return <details><summary>成员位置共享</summary><p>开启后，在浏览器能获取定位时更新。关闭或挂起页面会中断更新。</p>
 {own?<button onClick={()=>stop(own)}>停止位置共享</button>:<fieldset disabled={busy}>
 <label>共享给<select value={all?'all':'selected'} onChange={e=>setAll(e.target.value==='all')}><option value="all">全部旅行成员</option><option value="selected">指定成员</option></select></label>
 {!all&&members.map(m=><label key={m.id}><input style={{width:'auto',display:'inline'}} type="checkbox" checked={audience.includes(m.id)} onChange={e=>setAudience(old=>e.target.checked?[...old,m.id]:old.filter(x=>x!==m.id))}/>{m.nickname}</label>)}
 <label>共享时长<select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}><option value={15}>15 分钟</option><option value={60}>1 小时</option><option value={0}>直到手动停止</option></select></label>
 <button disabled={!connected||(!all&&!audience.length)} onClick={start}>开启位置共享</button></fieldset>}
 <p aria-live="polite">{connected?message:'位置服务连接中…'}</p>
 {rows.map(r=><p key={r.id}><button onClick={()=>map?.setView([r.lat,r.lon],16)}>{r.name}</button> {r.online?'在线':'离线'} · {Date.now()-Date.parse(r.time)>60000?'上次位置':'最近位置'} {new Date(r.time).toLocaleString()} · 精度约 {Math.round(r.accuracy)} 米 · {r.lon.toFixed(5)}, {r.lat.toFixed(5)}</p>)}</details>
}
