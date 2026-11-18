import {Leg} from './Leg';
import {useEffect,useState} from 'react';
import L from 'leaflet';
import {readApiResponse} from './api';
const colors=['#006d77','#b84a17','#7246a2','#2359a0'];
type Stop={id:string;place:string;day:string;start:string;end:string};
type Plan={items:Stop[];version:number};
type Props={sync:number;base:string;csrf:string;first:string;last:string;places:{id?:string;name:string;latitude:number;longitude:number}[];map:L.Map|null};
export function Itinerary({base,csrf,first,last,places,map,sync}:Props){
 const [day,setDay]=useState(first),[mode,setMode]=useState('walk'),[plan,setPlan]=useState<Plan|null>(null);
 const [pick,setPick]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[summary,setSummary]=useState(''),[retry,setRetry]=useState(0);
 const stops=plan?.items.filter(s=>s.day===day)??[];
 const [segment,setSegment]=useState('first');
 const index=segment==='all'&&mode!=='mixed'?-1:Math.max(0,stops.slice(0,-1).findIndex(s=>s.id===segment));
 const from=stops[index],to=stops[index+1];
 const name=(s:Stop)=>places.find(p=>p.id===s.place)?.name??'未知地点';

 const color=index<0?'#356a52':colors[index%colors.length];
 const legQuery=from&&to?new URLSearchParams({day,from:from.id,to:to.id}).toString():'';
 const routeKey=JSON.stringify(stops.map(s=>{const p=places.find(p=>p.id===s.place);return [s.place,p?.longitude,p?.latitude]}));
 const mapStops=JSON.stringify(stops.map(s=>{const place=places.find(p=>p.id===s.place);return {id:s.id,name:name(s),lat:place?.latitude,lng:place?.longitude}}));
 useEffect(()=>{
  if(!map)return;
  const points:{id:string;name:string;lat?:number;lng?:number}[]=JSON.parse(mapStops);
  if(points.length<2)return;
  const control=new L.Control({position:'bottomleft'});
  control.onAdd=()=>{
   const select=document.createElement('select');
   select.className='map-segment-picker';
   select.setAttribute('aria-label','地图路线分段');
   if(mode!=='mixed')select.add(new Option('全天总览','all'));
   points.slice(1).forEach((end,i)=>select.add(new Option((i+1)+' → '+(i+2)+' · '+points[i].name+' → '+end.name,points[i].id)));
   select.value=index<0?'all':points[index].id;
   select.onchange=()=>setSegment(select.value);
   L.DomEvent.disableClickPropagation(select);
   L.DomEvent.disableScrollPropagation(select);
   return select;
  };
  control.addTo(map);
  const labels=L.layerGroup().addTo(map);
  points.forEach((point,i)=>{
   if(point.lat===undefined||point.lng===undefined||(index>=0&&i!==index&&i!==index+1))return;
   const icon=L.divIcon({className:'route-stop-number',html:String(i+1),iconSize:[22,22],iconAnchor:[-7,23]});
   L.marker([point.lat,point.lng],{icon,interactive:false,zIndexOffset:600}).addTo(labels);
  });
  return ()=>{control.remove();labels.remove()};
 },[map,mapStops,index,mode]);
 useEffect(()=>{
  let active=true;
  fetch(base+'/itinerary').then(readApiResponse).then(data=>{if(active)setPlan(data)}).catch(e=>{if(active)setError(e.message)});
  return ()=>{active=false};
 },[base,sync]);
 useEffect(()=>{
  if(mode==='mixed'){setSummary('');return;}
  if(!map||JSON.parse(routeKey).length<2){setSummary('当天至少需要两个地点才能计算路线');return;}
  const abort=new AbortController();
  const lines=L.featureGroup().addTo(map);
  setSummary('正在计算道路路线…');
  const timer=setTimeout(async()=>{
   try{
    const points:{id:string;name:string}[]=JSON.parse(mapStops);
    const indices=index<0?points.slice(1).map((_,i)=>i):[index];
    if(indices.length>49)throw Error('每天最多计算 50 站');
    let distance=0,duration=0;
    for(const i of indices){
     const start=points[i],end=points[i+1];
     const query=new URLSearchParams({day,from:start.id,to:end.id,mode});
     const rows=await fetch(base+'/leg?'+query,{signal:abort.signal}).then(readApiResponse);
     if(abort.signal.aborted)return;
     const data=rows[0];
     const line=L.geoJSON(data.geometry,{style:{color:colors[i%colors.length],weight:5,dashArray:index<0&&i%2?'9 6':undefined}}).addTo(lines);
     const label=document.createElement('span');
     label.textContent=(i+1)+' → '+(i+2)+' · '+start.name+' → '+end.name;
     line.bindTooltip(label,{sticky:true});
     distance+=data.distance;duration+=data.duration;
    }
    if(lines.getBounds().isValid())map.fitBounds(lines.getBounds(),{padding:[24,24]});
    setSummary(distance.toFixed(0)+' 米 · 预计 '+Math.ceil(duration/60)+' 分钟');
   }catch(e){if(!abort.signal.aborted)setSummary((e as Error).message)}
  },400);
  return ()=>{clearTimeout(timer);abort.abort();lines.remove()};
 },[base,day,mode,map,routeKey,retry,index,mapStops]);
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
 return <section className="daily-plan"><header><h3>每日行程</h3><span>第 {1+Math.round((Date.parse(day)-Date.parse(first))/86400000)} 天 · {stops.length} 站</span></header><label>行程日期<input type="date" min={first} max={last} value={day} onChange={e=>{if(e.target.value>=first&&e.target.value<=last)setDay(e.target.value)}}/></label>
 {plan&&!stops.length&&<p>当天还没有停留地点。</p>}
 <fieldset disabled={busy||!plan}>
 <ol className="daily-timeline">{stops.map((s,i)=><li key={s.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',s.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();move(e.dataTransfer.getData('text/plain'),s.id)}}>
 <span className="stop-number">{i+1}</span><div className="stop-card"><strong>{name(s)}</strong><small>{[s.start,s.end].filter(Boolean).join(" — ")||"时间待定"}</small><details><summary>编辑停留</summary>
 <div className="dates">{(['start','end'] as const).map(k=><label key={k}>{k==='start'?'开始时间':'结束时间'}<input type="time" value={s[k]} onChange={e=>change(s.id,{[k]:e.target.value})}/></label>)}</div>
 <button disabled={!i} onClick={()=>move(s.id,stops[i-1].id)}>上移</button><button disabled={i===stops.length-1} onClick={()=>move(s.id,stops[i+1].id)}>下移</button>
 <button onClick={()=>plan&&save(plan.items.filter(item=>item.id!==s.id))}>移除本次停留</button>
 <label>移动到日期<input type="date" min={first} max={last} value={day} onChange={e=>change(s.id,{day:e.target.value})}/></label></details></div></li>)}</ol> <label>已保存地点<select value={pick} onChange={e=>setPick(e.target.value)}><option value="">请选择</option>{places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <button disabled={!pick} onClick={()=>plan&&save([...plan.items,{id:crypto.randomUUID(),day,place:pick,start:'',end:''}])}>加入当天行程</button>
</fieldset>
 {error&&<p role="alert">{error}</p>}
 {index<0&&<ul className="route-legend">{stops.slice(1).map((end,i)=><li key={end.id}><button onClick={()=>setSegment(stops[i].id)}><span style={{borderColor:colors[i%colors.length],borderTopStyle:i%2?'dashed':'solid'}}/>{i+1} → {i+2} · {name(stops[i])} → {name(end)}</button></li>)}</ul>}
 {stops.length>1&&<label>地图显示<select value={index<0?"all":from.id} onChange={e=>setSegment(e.target.value)}>{mode!=="mixed"&&<option value="all">全天总览</option>}{stops.slice(1).map((end,i)=><option key={end.id} value={stops[i].id}>第 {i+1} 段 · {name(stops[i])} → {name(end)}</option>)}</select></label>}
 <label>交通方式<select value={mode} onChange={e=>setMode(e.target.value)}><option value="mixed">分段规划（含公交地铁）</option><option value="walk">步行</option><option value="drive">驾车</option><option value="bike">骑行</option></select></label><p aria-live="polite">{summary}</p> {mode==='mixed'&&from&&to&&<Leg key={legQuery+routeKey} color={color} title={name(from)+' → '+name(to)} map={map} url={base+'/leg?'+legQuery}/>}
 {mode!=='mixed'&&stops.length>=2&&<button onClick={()=>setRetry(retry+1)}>重新计算</button>}</section>
}
