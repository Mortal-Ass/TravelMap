import {useEffect,useState} from 'react';
import {readApiResponse} from './api';

const key='travelmap.offline.agenda';
export function clearOffline(){localStorage.removeItem(key)}
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
let pending:InstallEvent|null=null;
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();pending=event as InstallEvent;window.dispatchEvent(new Event('travelmap-install'));
});
if('serviceWorker' in navigator&&window.isSecureContext)void navigator.serviceWorker.register('/sw.js').catch(()=>{});
export function DeviceTools({trip,name}:{trip:string;name:string}){
 const [message,setMessage]=useState(''),[install,setInstall]=useState(!!pending);
 useEffect(()=>{const update=()=>setInstall(!!pending);window.addEventListener('travelmap-install',update);return()=>window.removeEventListener('travelmap-install',update)},[]);
 async function save(){
  try{
   if(!navigator.serviceWorker?.controller)throw Error('离线组件尚未就绪，请通过 HTTPS 或 localhost 打开并刷新');
   const base='/api/trips/'+trip;
   const [plan,places]=await Promise.all(['/itinerary','/places'].map(s=>fetch(base+s).then(readApiResponse)));
   const items=plan.items.map((s:{day:string;start:string;end:string;place:string})=>({day:s.day,start:s.start,end:s.end,name:places.find((p:{id:string})=>p.id===s.place)?.name??'未知地点'}));
   localStorage.setItem(key,JSON.stringify({name,saved:Date.now(),items}));
   setMessage('已保存本次行程的只读副本');
  }catch(e){setMessage((e as Error).message)}
 }
 return <details><summary>安装与离线行程</summary><p>在个人设备上保存一份行程，断网后可查看日期、地点名称和时间。此设备的使用者可查看副本，再次保存会替换旧副本。</p>
 <button onClick={save}>保存到本机</button> <button onClick={()=>{clearOffline();setMessage('已删除本机副本')}}>删除本机副本</button> <a href="/offline.html">查看离线副本</a>
 {install?<button onClick={async()=>{const event=pending;if(!event)return;pending=null;setInstall(false);await event.prompt();await event.userChoice}}>安装 TravelMap</button>:<p>可在浏览器菜单选择「安装应用」或「添加到主屏幕」。</p>}
 <p aria-live="polite">{message}</p></details>
}
