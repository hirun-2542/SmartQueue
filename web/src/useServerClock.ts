import {useEffect,useState} from 'react';

export function useServerClock(serverTime:string):number{
  const [anchor,setAnchor]=useState(()=>({server:new Date(serverTime).getTime(),local:Date.now()}));const [tick,setTick]=useState(Date.now());
  useEffect(()=>{setAnchor({server:new Date(serverTime).getTime(),local:Date.now()});},[serverTime]);
  useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(timer);},[]);
  return anchor.server+(tick-anchor.local);
}
