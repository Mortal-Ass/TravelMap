import {useEffect,useState} from 'react';
import {readApiResponse} from './api';
const labels:Record<string,string>={owner:'创建者',admin:'管理员',editor:'编辑者',viewer:'只读成员',invite:'成员邀请',public:'公开只读',login:'登录可读',members:'旅行成员可读'};
type Team={role:string;members:{id:string;nickname:string;role:string}[];links:{id:string;kind:string;role:string}[]};
export async function write(path:string,csrf:string,data:unknown){
 return fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)}).then(readApiResponse);
}
export function Join({csrf,done}:{csrf:string;done:()=>void}){
 const [code,setCode]=useState(new URLSearchParams(location.search).get('invite')??''),[msg,setMsg]=useState('');
 return <details open={code.length>0||undefined}><summary>加入朋友的旅行</summary><form onSubmit={async e=>{
  e.preventDefault();try{await write('join',csrf,{code:code.trim()});history.replaceState(null,'',location.pathname);setCode('');setMsg('已加入旅行');done()}catch(e){setMsg((e as Error).message)}
 }}><label>邀请码<input required value={code} onChange={e=>setCode(e.target.value)}/></label><button>确认加入</button></form><p>{msg}</p></details>;
}
export function TeamPanel({id,userId,csrf,onSync,onLeave}:{id:string;userId:string;csrf:string;onSync:()=>void;onLeave:()=>void}){
 const [team,setTeam]=useState<Team|null>(null),[role,setRole]=useState('viewer'),[kind,setKind]=useState('invite'),[url,setUrl]=useState(''),[msg,setMsg]=useState('');
 const base='trips/'+id;
 async function load(){setTeam(await fetch('/api/'+base+'/team').then(readApiResponse))}
 useEffect(()=>{
  let closed=false,timer:ReturnType<typeof setTimeout>,ws:WebSocket;
  function connect(){
   ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/api/sync/'+id);
   ws.onmessage=()=>{if(!closed){void load().catch(e=>setMsg(e.message));onSync()}};
   ws.onclose=e=>{if(closed)return;if(e.code===1008){onLeave();return}timer=setTimeout(connect,2500)};
  }
  void load().catch(e=>setMsg(e.message));connect();
  return ()=>{closed=true;clearTimeout(timer);ws.close()};
 },[id]);
 async function act(path:string,body:unknown){
  try{const result=await write(base+'/'+path,csrf,body);setMsg('已更新');await load();return result}catch(e){setMsg((e as Error).message)}
 }
 const manage=team?.role==='owner'||team?.role==='admin';
 return <details><summary>成员与分享</summary>
 {team?.members.map(m=><p key={m.id}>{m.nickname} · {labels[m.role]} {m.role!=='owner'&&(m.id===userId||manage&&(m.role!=='admin'||team.role==='owner'))&&<>
 {m.id!==userId&&<select aria-label={'修改 '+m.nickname+' 的角色'} value={m.role} onChange={e=>act('member',{userId:m.id,role:e.target.value})}>{['viewer','editor',...(team.role==='owner'?['admin']:[])].map(r=><option key={r} value={r}>{labels[r]}</option>)}</select>}
 <button onClick={async()=>{if(await act('member',{userId:m.id,role:'remove'})&&m.id===userId)onLeave()}}>{m.id===userId?'退出旅行':'移除成员'}</button></>}</p>)}
 {manage&&<><label>链接用途<select value={kind} onChange={e=>{setKind(e.target.value);setUrl('')}}>{['invite','public','login','members'].map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
 {kind==='invite'&&<label>邀请角色<select value={role} onChange={e=>setRole(e.target.value)}>{['viewer','editor',...(team?.role==='owner'?['admin']:[])].map(k=><option value={k} key={k}>{labels[k]}</option>)}</select></label>}
 <button onClick={async()=>{const r=await act('links',{kind,role:kind==='invite'?role:'viewer'});if(r)setUrl(location.origin+'/?'+(kind==='invite'?'invite':'share')+'='+r.code)}}>生成七天有效链接</button>
 {url&&<><label>复制链接<input readOnly value={url} onFocus={e=>e.target.select()}/></label>{url.includes('?invite=')&&<label>邀请码<input readOnly value={url.split('=').pop()}/></label>}</>}
 {team?.links.map(l=><p key={l.id}>{labels[l.kind]} {l.kind==='invite'&&labels[l.role]} · {l.id.slice(0,8)} <button onClick={async()=>{if(await act('links',{revoke:l.id}))setUrl('')}}>撤销链接</button></p>)}</>}
 <p>{msg}</p></details>
}
