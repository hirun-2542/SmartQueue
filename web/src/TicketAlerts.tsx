import { useEffect,useRef,useState } from 'react';
import { Volume2,VolumeX } from 'lucide-react';
import { useLanguage } from './language';
import type { TicketStatus } from './ticketTypes';
export function TicketAlerts({status}:{status:TicketStatus}){
  const {t}=useLanguage();const audio=useRef<AudioContext|null>(null);const previous=useRef<TicketStatus|null>(null);const [armed,setArmed]=useState(false);const [error,setError]=useState('');
  async function toggle(){if(armed){setArmed(false);return;}try{audio.current??=new AudioContext();await audio.current.resume();setArmed(audio.current.state==='running');setError('');}catch{setError(t('เบราว์เซอร์ไม่อนุญาตเสียง ยังดูสถานะและรับแจ้งเตือนได้ตามปกติ','Sound is unavailable. Ticket status and optional notifications still work'));}}
  useEffect(()=>{if(status==='Called'&&previous.current!=='Called'&&armed){const context=audio.current;if(context?.state==='running'){const oscillator=context.createOscillator();const gain=context.createGain();oscillator.connect(gain);gain.connect(context.destination);oscillator.frequency.value=660;gain.gain.setValueAtTime(.06,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.35);oscillator.start();oscillator.stop(context.currentTime+.35);}navigator.vibrate?.([150,80,150]);}previous.current=status;},[status,armed]);
  useEffect(()=>()=>{if(audio.current)void audio.current.close();},[]);
  if(status!=='Waiting'&&status!=='Called')return null;
  return <><button type="button" className="text-action link-row" aria-pressed={armed} onClick={toggle}>{armed?<Volume2 size={22} aria-hidden="true"/>:<VolumeX size={22} aria-hidden="true"/>}{armed?t('เปิดเสียงเมื่อถึงคิวแล้ว','Called sound enabled'):t('เปิดเสียงและสั่นเมื่อถึงคิว','Enable Called sound and vibration')}</button>{error&&<p className="error" role="status">{error}</p>}</>;
}
