import { useServerClock } from './useServerClock';
export function Clock({deadline,startedAt,serverTime}:{deadline?:string|null;startedAt?:string|null;serverTime:string}){
  const now=useServerClock(serverTime);
  const seconds=Math.max(0,Math.floor((deadline?new Date(deadline).getTime()-now:now-new Date(startedAt??serverTime).getTime())/1000));
  const text=`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
  return <span className="number clock" aria-hidden="true">{text}</span>;
}
