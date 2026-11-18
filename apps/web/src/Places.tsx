import {LocationPanel} from './LocationPanel';
import {GuideImport} from './GuideImport';
import {Itinerary} from './Itinerary';
import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {readApiResponse} from './api';

const icons:Record<string,string>={景点:'★',酒店:'宿',餐厅:'食',交通:'站',其他:'●'};
type Place={id?:string,name:string,category:string,latitude:number,longitude:number,notes:string};
type Result=Place & {address:string};
const blank={name:'',category:'景点',notes:''};

export function Places({trip,csrf,first,last,sync,user}:{user:string,sync:number,trip:string,csrf:string,first:string,last:string}){
 const host=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null);
 const [places,setPlaces]=useState<Place[]>([]),[draft,setDraft]=useState<Place|null>(null);
 const [query,setQuery]=useState(''),[results,setResults]=useState<Result[]>([]),[message,setMessage]=useState(''),[tileError,setTileError]=useState(false);
 const [revision,setRevision]=useState(0);
 const requestId=useRef(crypto.randomUUID());
 const [panel,setPanel]=useState(false);
 const [filter,setFilter]=useState('全部');
 const visible=places.filter(p=>filter==='全部'||p.category===filter);
 const base='/api/trips/'+trip;
 useEffect(()=>{
  let active=true;
  fetch(base+'/places').then(readApiResponse).then(rows=>{if(active)setPlaces(rows)}).catch(e=>{if(active)setMessage(e.message)});
  return ()=>{active=false};
 },[base,revision,sync]);
 useEffect(()=>{
  const m=L.map(host.current!).setView([26,105],3);
  map.current=m;
  const env=import.meta.env;
  L.tileLayer(env.VITE_TILE_URL||'/api/tiles/{z}/{x}/{y}.png',{attribution:env.VITE_TILE_ATTRIBUTION||'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).on('tileerror',()=>setTileError(true)).addTo(m);
  m.on('click',(event:L.LeafletMouseEvent)=>{setDraft({...blank,latitude:event.latlng.lat,longitude:event.latlng.wrap().lng});setMessage('');});
  return ()=>{m.remove();map.current=null};
 },[]);
 useEffect(()=>{
  const m=map.current!;
  const layer=L.layerGroup().addTo(m);
  for(const p of places.filter(p=>filter==="全部"||p.category===filter)){
   const label=document.createElement('span');label.textContent=p.name;
   L.marker([p.latitude,p.longitude],{title:p.name,icon:L.divIcon({className:'place-pin',html:icons[p.category],iconSize:[28,28]})}).bindTooltip(label).on('click',()=>setDraft(p)).addTo(layer);
  }
  if(places.length)m.fitBounds(L.latLngBounds(places.map(p=>[p.latitude,p.longitude])),{padding:[32,32],maxZoom:15});
  return ()=>{layer.remove()};
 },[places,filter]);
 useEffect(()=>{
  if(!draft)return;
  const m=map.current!;
  m.setView([draft.latitude,draft.longitude],Math.max(m.getZoom(),14));
  const pin=L.circleMarker([draft.latitude,draft.longitude],{radius:19,color:'#c46b29',fill:false,interactive:false}).addTo(m);
  return ()=>{pin.remove()};
 },[draft?.latitude,draft?.longitude,draft?.id]);
 async function search(){
  setResults([]);setMessage('搜索中…');
  try{const rows=await fetch(base+'/search?q='+encodeURIComponent(query)).then(readApiResponse);setResults(rows);setMessage(rows.length?'请选择匹配地点':'没有找到匹配地点');}
  catch(e){setMessage((e as Error).message)}
 }
 async function save(){
  try{const row=await fetch(base+'/places',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({...draft,requestId:requestId.current})}).then(readApiResponse);
   requestId.current=crypto.randomUUID();setPlaces(old=>[...old.filter(p=>p.id!==row.id),row]);setDraft(row);setMessage('地点已保存');
  }catch(e){setMessage((e as Error).message)}
 }
 return <section className="places"><div className="atlas-map"><div className="atlas-heading"><h2>旅行地图</h2><button disabled={!visible.length} onClick={()=>map.current?.fitBounds(L.latLngBounds(visible.map(p=>[p.latitude,p.longitude])),{padding:[32,32],maxZoom:15})}>查看全图</button></div><form className="atlas-search" onSubmit={e=>{e.preventDefault();void search()}}><label>搜索地点<input required minLength={2} value={query} placeholder="城市、景点或地址" onChange={e=>setQuery(e.target.value)}/></label><button className="primary">搜索</button></form>
 <p role="status">{message}</p>{results.map((r,i)=><button key={i} onClick={()=>{setDraft({...blank,name:r.name,latitude:r.latitude,longitude:r.longitude});setResults([]);setMessage('')}}>{r.address}</button>)}
 <div ref={host} style={{height:360}} aria-label="旅行地点地图"/>
 {tileError&&<p>部分底图瓦片加载失败，请检查网络或地图服务。</p>}
 <small>点击地图添加地点 · 搜索数据 © OpenStreetMap contributors</small></div><div className="atlas-plan"><div className="atlas-heading"><h3>已存地点</h3><select aria-label="筛选地点类型" value={filter} onChange={e=>setFilter(e.target.value)}>{["全部",...Object.keys(icons)].map(c=><option key={c}>{c}</option>)}</select></div><div className="place-list">
 
 {visible.map(p=><button key={p.id} aria-pressed={draft?.id===p.id} onClick={()=>setDraft(p)}>{icons[p.category]} {p.name}</button>)}
 {!visible.length&&<small>暂无匹配地点</small>}</div>{draft&&<form onSubmit={e=>{e.preventDefault();void save()}}><label>地点名称<input required maxLength={180} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
 <label>类别<select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}>{Object.keys(icons).map(c=><option key={c}>{c}</option>)}</select></label>
 <label>备注<textarea maxLength={2000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
 <p>经度 {draft.longitude.toFixed(5)} · 纬度 {draft.latitude.toFixed(5)}</p><button className="primary">保存地点</button></form>}<LocationPanel user={user} sync={sync} trip={trip} csrf={csrf} map={map.current}/><GuideImport base={base} csrf={csrf} first={first} last={last} places={places} map={map.current} onDone={()=>setRevision(n=>n+1)}/><button className="agenda-toggle" aria-expanded={panel} onClick={()=>setPanel(!panel)}>{panel?"收起每日行程":"展开每日行程"}</button><div className={panel?"agenda-panel open":"agenda-panel"}><Itinerary sync={sync} key={revision} base={base} csrf={csrf} first={first} last={last} places={places} map={map.current}/></div></div></section>
}
