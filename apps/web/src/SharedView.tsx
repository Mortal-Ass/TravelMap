import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {readApiResponse} from './api';
type Shared={name:string;destination:string;start:string;end:string;places:{id:string;name:string;latitude:number;longitude:number}[];items:{day:string;start:string;end:string;place:string}[]};
export function SharedView({code,onLogin}:{code:string;onLogin:()=>void}){
 const [data,setData]=useState<Shared|null>(null),[error,setError]=useState('');const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{let active=true;async function load(){try{const r=await fetch('/api/shared/'+encodeURIComponent(code));if(!active)return;if(r.status===401){onLogin();return}const d=await readApiResponse(r);if(active){setData(d);setError('')}}catch(e){if(active){setData(null);setError((e as Error).message)}}}void load();const t=setInterval(load,15000);return()=>{active=false;clearInterval(t)}},[code]);
 const points=JSON.stringify(data?.places??[]);
 useEffect(()=>{if(!ref.current)return;const m=L.map(ref.current).setView([35,105],3);
 L.tileLayer(import.meta.env.VITE_TILE_URL||'/api/tiles/{z}/{x}/{y}.png',{attribution:import.meta.env.VITE_TILE_ATTRIBUTION||'© OpenStreetMap contributors'}).addTo(m);
 const bounds=L.latLngBounds([]);for(const p of JSON.parse(points)){const el=document.createElement('span');el.textContent=p.name;L.circleMarker([p.latitude,p.longitude]).addTo(m).bindTooltip(el);bounds.extend([p.latitude,p.longitude])}
 if(bounds.isValid())m.fitBounds(bounds,{maxZoom:14});return()=>{m.remove()};
 },[points,!!data]);
 return <main className="app">{data?<><h1>{data.name}</h1><p>{data.destination} · {data.start} — {data.end}</p><div ref={ref} style={{height:360}}/><h2>每日行程</h2><ol>{data.items.map((s,i)=><li key={i}>{s.day} {s.start} {s.end} · {data.places.find(p=>p.id===s.place)?.name}</li>)}</ol></>:<p>{error||'正在读取分享…'}</p>}</main>
}
