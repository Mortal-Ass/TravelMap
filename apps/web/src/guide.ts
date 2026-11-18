export function parseGuide(source:string, first:string){
 let day=first;
 const rows=[];
 for(const raw of source.split(/\r?\n/)){
  let line=raw.trim().replace(/^(?:#{1,6}\s*|[-*+]\s+|\d+[.)、]\s*)/,'').replace(/\*\*/g,'').trim();
  const date=line.match(/^(\d{4}-\d{2}-\d{2})/);
  const relative=line.match(/^(?:Day\s*(\d+)|第([一二三四五六七八九十]|\d+)天)/i);
  const heading=date??relative;
  if(heading){
   if(date)day=date[1];
   else if(relative){
    const n=relative[1]??relative[2];
    const offset=Number(n)||'一二三四五六七八九十'.indexOf(n)+1;
    const timestamp=Date.parse(first)+(offset-1)*86400000;
    day=Number.isFinite(timestamp)&&offset<10000?new Date(timestamp).toISOString().slice(0,10):'';
   }
   line=line.slice(heading[0].length).replace(/^[\s:：]+/,'');
  }
  const time=line.match(/^(\d{1,2}[:：]\d{2})(?:\s*[-–~至]\s*(\d{1,2}[:：]\d{2}))?\s*/);
  const name=line.slice(time?.[0].length??0).trim();
  if(name)rows.push({id:crypto.randomUUID(),name,day,start:(time?.[1]??'').replace('：',':').padStart(time?5:0,'0'),end:(time?.[2]??'').replace('：',':').padStart(time?.[2]?5:0,'0')});
 }
 return rows;
}
