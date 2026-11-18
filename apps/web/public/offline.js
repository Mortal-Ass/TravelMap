/* global document, localStorage, location, window */
const key='travelmap.offline.agenda';
const section=document.querySelector('#saved');
const state=document.querySelector('#state');
const remove=document.querySelector('#remove');
function add(tag,text,parent=section){const el=document.createElement(tag);el.textContent=text;parent.append(el);return el}
function render(){
 section.replaceChildren();remove.hidden=true;
 let data;
 try{data=JSON.parse(localStorage.getItem(key))}catch{/* Unavailable storage or invalid snapshot. */}
 if(!data||location.search){state.textContent='此页面没有可用的离线行程。';return}
 state.textContent='本机只读副本 · 保存于 '+new Date(data.saved).toLocaleString();
 remove.hidden=false;add('h2',data.name);
 for(const day of [...new Set(data.items.map(s=>s.day))].sort()){
  add('h3',day);const list=add('ol','');
  for(const stop of data.items.filter(s=>s.day===day))add('li',[stop.start,stop.end].filter(Boolean).join('–')+' '+stop.name,list);
 }
 if(!data.items.length)add('p','保存时尚未安排地点。');
}
remove.onclick=()=>{localStorage.removeItem(key);render()};
document.querySelector('#retry').onclick=()=>location.replace(location.pathname==='/offline.html'?'/':location.href);
window.addEventListener('online',()=>location.replace(location.pathname==='/offline.html'?'/':location.href));
render();
