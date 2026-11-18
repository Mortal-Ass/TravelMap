import {useEffect,useState} from 'react';
import L from 'leaflet';
import {readApiResponse} from './api';
import {parseGuide} from './guide';
type Point={name:string;latitude:number;longitude:number;address?:string;id?:string};
type Draft=ReturnType<typeof parseGuide>[number]&{point?:Point};
function Review({row,places,base,map,update,remove}:{row:Draft;places:Point[];base:string;map:L.Map|null;update:(patch:Partial<Draft>)=>void;remove:()=>void}){
 const [results,setResults]=useState<Point[]>([]),[feedback,setFeedback]=useState('');
 useEffect(()=>{
  if(!row.point||!map)return;
  const marker=L.circleMarker([row.point.latitude,row.point.longitude],{color:'#b26425',radius:9}).addTo(map);
  const label=document.createElement('span');label.textContent=row.point.name;
  marker.bindTooltip(label);
  return ()=>{marker.remove()};
 },[map,row.point]);
 function choose(point:Point){update({point});map?.setView([point.latitude,point.longitude],16);setResults([]);setFeedback('')}
 async function search(){
  setFeedback('搜索中…');setResults([]);
  try{const found=await fetch(base+'/search?q='+encodeURIComponent(row.name)).then(readApiResponse);setResults(found);setFeedback(found.length?'请选择匹配地点':'没有找到，请修改名称或选择已有地点')}
  catch(e){setFeedback((e as Error).message)}
 }
 return <li><label>地点关键词<input required value={row.name} onChange={e=>{update({name:e.target.value,point:undefined});setResults([])}}/></label>
 <label>日期<input required type="date" value={row.day} onChange={e=>update({day:e.target.value})}/></label>
 <div className="dates">{(['start','end'] as const).map(k=><label key={k}>{k==='start'?'抵达':'离开'}<input type="time" value={row[k]} onChange={e=>update({[k]:e.target.value})}/></label>)}</div>
 <label>匹配已有地点<select value={row.point?.id??''} onChange={e=>{const p=places.find(p=>p.id===e.target.value);if(p)choose(p);else update({point:undefined})}}><option value="">请选择</option>{places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <button onClick={search}>搜索真实地点</button><button onClick={remove}>删除此项</button>
 <p>{feedback}</p>{results.map((p,i)=><button key={i} onClick={()=>choose(p)}>{p.address??p.name}</button>)}
 <p>{row.point?'已选：'+row.point.name+' · '+(row.point.address??[row.point.longitude,row.point.latitude].join(', ')):'待确认地点'}</p></li>
}
export function GuideImport({base,csrf,first,last,places,map,onDone}:{base:string;csrf:string;first:string;last:string;places:Point[];map:L.Map|null;onDone:()=>void}){
 const [source,setSource]=useState(''),[rows,setRows]=useState<Draft[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 function edit(value:string){setSource(value);setRows([]);setMessage('')}
 async function commit(){
  setBusy(true);
  try{const result=await fetch(base+'/import',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({rows:rows.map(r=>({...r,point:undefined,place:r.point?.id,name:r.point?.name,longitude:r.point?.longitude,latitude:r.point?.latitude}))})}).then(readApiResponse);
   edit('');setMessage('已导入 '+result.count+' 站');onDone();
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 return <details><summary>攻略导入</summary><fieldset disabled={busy}><label>粘贴攻略（每行一站）<textarea rows={5} maxLength={50000} value={source} onChange={e=>edit(e.target.value)} placeholder={'第一天\n09:00-10:00 沈阳故宫\n12:00 中街'}/></label>
 <label>读取 TXT 或 Markdown<input type="file" accept=".txt,.md,.markdown" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>50000||!(/\.(txt|md|markdown)$/i).test(file.name))throw Error('请选择 50 KB 以内的 TXT 或 Markdown 文件');edit(await file.text())}catch(err){setMessage((err as Error).message)}}}/></label>
 <button disabled={!source.trim()} onClick={()=>{const parsed=parseGuide(source,first);if(!parsed.length||parsed.length>100){setRows([]);setMessage('每次需有 1 至 100 个地点');return}setRows(parsed);setMessage('核对日期、时间和地点后确认导入')}}>生成草稿</button>
 <ol>{rows.map(row=><Review key={row.id} {...{base,places,map,row}} remove={()=>setRows(old=>old.filter(r=>r.id!==row.id))} update={patch=>setRows(old=>old.map(r=>r.id===row.id?{...r,...patch}:r))}/>)}</ol>
 {rows.length>0&&<button className="primary" disabled={rows.some(r=>!r.point||r.day<first||r.day>last||(r.start&&r.end&&r.end<r.start))} onClick={commit}>确认导入 {rows.length} 站</button>}</fieldset><p aria-live="polite">{message}</p></details>
}
