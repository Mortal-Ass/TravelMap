import {useEffect,useState} from 'react';
import L from 'leaflet';
import {readApiResponse} from './api';
type Option={duration:number;walking?:number;transfers?:number;distance?:number;steps:string[];geometry:GeoJSON.Geometry};
export function Leg({title,url,map,color}:{color:string;title:string;url:string;map:L.Map|null}){
 const [mode,setMode]=useState('transit'),[strategy,setStrategy]=useState('8'),[attempt,setAttempt]=useState(0);
 const [options,setOptions]=useState<Option[]>([]),[selected,select]=useState(0),[message,setMessage]=useState('');
 useEffect(()=>{
  const abort=new AbortController();
  setOptions([]);select(0);setMessage('');
  if(!attempt)return;
  setMessage('正在查询…');
  fetch(url+'&mode='+mode+'&strategy='+strategy,{signal:abort.signal}).then(readApiResponse).then(rows=>{
   if(!abort.signal.aborted){setOptions(rows);setMessage(rows.length?'':'没有找到可用方案')}
  }).catch(e=>{if(!abort.signal.aborted)setMessage(e.message)});
  return ()=>abort.abort();
 },[url,mode,strategy,attempt]);
 useEffect(()=>{
  if(!map||!options[selected])return;
  const line=L.geoJSON(options[selected].geometry,{style:{color,weight:5}}).addTo(map);
  if(line.getBounds().isValid())map.fitBounds(line.getBounds(),{padding:[20,20]});
  return ()=>{line.remove()};
 },[map,options,selected,color]);
 return <section><h4>{title}</h4><label>本段交通<select value={mode} onChange={e=>setMode(e.target.value)}><option value="transit">公交与地铁换乘</option><option value="walk">步行</option><option value="bike">骑行</option><option value="drive">驾车</option></select></label>
 {mode==='transit'&&<label>换乘偏好<select value={strategy} onChange={e=>setStrategy(e.target.value)}><option value="8">时间最短</option><option value="2">少换乘</option><option value="3">少步行</option></select></label>}
 <button onClick={()=>setAttempt(a=>a+1)}>查询本段方案</button><p aria-live="polite">{message}</p>
 {options.map((o,i)=><button key={i} aria-pressed={i===selected} onClick={()=>select(i)}>方案 {i+1} · {Math.ceil(o.duration/60)} 分钟{o.transfers!==undefined&&' · 换乘 '+o.transfers+' 次 · 步行 '+o.walking+' 米'}</button>)}
 {options[selected]&&<ol>{options[selected].steps.map((step,i)=><li key={i}>{step}</li>)}</ol>}</section>
}
