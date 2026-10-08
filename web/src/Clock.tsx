import { useEffect, useState } from 'react';
export function Clock({deadline,startedAt,serverTime}:{deadline?:string|null;startedAt?:string|null;serverTime:string}){
  const [anchor,setAnchor]=useState(()=>({server:new Date(serverTime).getTime(),local:Date.now()}));const [tick,setTick]=useState(Date.now());
  useEffect(()=>{setAnchor({server:new Date(serverTime).getTime(),local:Date.now()});},[serverTime]);
  useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const now=anchor.server+(tick-anchor.local);
  const seconds=Math.max(0,Math.floor((deadline?new Date(deadline).getTime()-now:now-new Date(startedAt??serverTime).getTime())/1000));
  const text=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
  return <span className="number clock" aria-hidden="true">{text}</span>;
}
