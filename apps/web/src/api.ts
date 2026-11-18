export async function readApiResponse(res:Response){
 const raw=await res.text();
 let data;
 try{data=raw?JSON.parse(raw):null;}catch{throw new Error('服务响应异常，请稍后重试');}
 if(!res.ok){
  const message=data?.message;
  throw new Error(typeof message==='string'?message:`无法连接账号服务（${res.status}），请确认后端已启动`);
 }
 if(data===null)throw new Error('服务返回空响应，请稍后重试');
 return data;
}
