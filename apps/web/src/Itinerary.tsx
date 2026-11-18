import {Leg} from './Leg';
import {useEffect,useState} from 'react';
import L from 'leaflet';
import {readApiResponse} from './api';
type Stop={id:string;place:string;day:string;start:string;end:string};
type Plan={items:Stop[];version:number};
type Props={sync:number;base:string;csrf:string;first:string;last:string;places:{id?:string;name:string;latitude:number;longitude:number}[];map:L.Map|null};
export function Itinerary({base,csrf,first,last,places,map,sync}:Props){
 const [day,setDay]=useState(first),[mode,setMode]=useState('walk'),[plan,setPlan]=useState<Plan|null>(null);
 const [pick,setPick]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[summary,setSummary]=useState(''),[retry,setRetry]=useState(0);
 const stops=plan?.items.filter(s=>s.day===day)??[];
 const routeKey=JSON.stringify(stops.map(s=>{const p=places.find(p=>p.id===s.place);return [s.place,p?.longitude,p?.latitude]}));
 useEffect(()=>{
  let active=true;
  fetch(base+'/itinerary').then(readApiResponse).then(data=>{if(active)setPlan(data)}).catch(e=>{if(active)setError(e.message)});
  return ()=>{active=false};
 },[base,sync]);
 useEffect(()=>{
  if(mode==='mixed'){setSummary('');return;}
  if(!map||JSON.parse(routeKey).length<2){setSummary('当天至少需要两个地点才能计算路线');return;}
  const abort=new AbortController();
  let line:L.GeoJSON|undefined;
  setSummary('正在计算道路路线…');
  const timer=setTimeout(async()=>{
   try{
    const data=await fetch(base+'/route?day='+day+'&mode='+mode,{signal:abort.signal}).then(readApiResponse);
    if(abort.signal.aborted)return;
    line=L.geoJSON(data.geometry,{style:{color:'#2472ab',weight:5}}).addTo(map);
    map.fitBounds(line.getBounds(),{padding:[24,24]});
    setSummary((data.distance/1000).toFixed(2)+' 公里 · 预计 '+Math.ceil(data.duration/60)+' 分钟'+(data.roads.length?' · '+data.roads.join('、'):''));
   }catch(e){if(!abort.signal.aborted)setSummary((e as Error).message)}
  },400);
  return ()=>{clearTimeout(timer);abort.abort();line?.remove()};
 },[base,day,mode,map,routeKey,retry]);
 async function save(items:Stop[]){
  if(!plan||busy)return;
  setBusy(true);setError('');
  try{setPlan(await fetch(base+'/itinerary',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({items,version:plan.version})}).then(readApiResponse))}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 function change(id:string,patch:Partial<Stop>){if(plan)void save(plan.items.map(s=>s.id===id?{...s,...patch}:s))}
 function move(from:string,to:string){
  if(!plan||from===to)return;
  const a=stops.findIndex(s=>s.id===from),b=stops.findIndex(s=>s.id===to);
  if(a<0||b<0)return;
  const ordered=[...stops];ordered.splice(b,0,ordered.splice(a,1)[0]);
  void save([...plan.items.filter(s=>s.day!==day),...ordered]);
 }
 return <section><h3>每日行程</h3><label>行程日期<input type="date" min={first} max={last} value={day} onChange={e=>{if(e.target.value>=first&&e.target.value<=last)setDay(e.target.value)}}/></label>
 <fieldset disabled={busy||!plan}><label>已保存地点<select value={pick} onChange={e=>setPick(e.target.value)}><option value="">请选择</option>{places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <button disabled={!pick} onClick={()=>plan&&save([...plan.items,{id:crypto.randomUUID(),day,place:pick,start:'',end:''}])}>加入当天行程</button>
 <ol>{stops.map((s,i)=><li key={s.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',s.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();move(e.dataTransfer.getData('text/plain'),s.id)}}>
 <strong>{places.find(p=>p.id===s.place)?.name}</strong>
 <div className="dates">{(['start','end'] as const).map(k=><label key={k}>{k==='start'?'开始时间':'结束时间'}<input type="time" value={s[k]} onChange={e=>change(s.id,{[k]:e.target.value})}/></label>)}</div>
 <button disabled={!i} onClick={()=>move(s.id,stops[i-1].id)}>上移</button><button disabled={i===stops.length-1} onClick={()=>move(s.id,stops[i+1].id)}>下移</button>
 <button onClick={()=>plan&&save(plan.items.filter(item=>item.id!==s.id))}>移除本次停留</button>
 <label>移动到日期<input type="date" min={first} max={last} value={day} onChange={e=>change(s.id,{day:e.target.value})}/></label></li>)}</ol></fieldset>
 {error&&<p role="alert">{error}</p>}
 <label>道路路线<select value={mode} onChange={e=>setMode(e.target.value)}><option value="mixed">分段规划（含公交地铁）</option><option value="walk">步行</option><option value="drive">驾车</option><option value="bike">骑行</option></select></label><p aria-live="polite">{summary}</p> {mode==='mixed'&&stops.slice(1).map((to,i)=>{
  const from=stops[i];
  const name=(s:Stop)=>places.find(p=>p.id===s.place)?.name??'地点';
  return <Leg key={from.id+to.id+routeKey} title={name(from)+' → '+name(to)} map={map} url={base+'/leg?'+new URLSearchParams({day,from:from.id,to:to.id,time:from.end||from.start})}/>;
 })}
 {mode!=='mixed'&&stops.length>=2&&<button onClick={()=>setRetry(retry+1)}>重新计算</button>}</section>
}
