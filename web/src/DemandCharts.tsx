import { Fragment,useEffect,useState } from 'react';
import { api } from './api';
import { useErrorText,useLanguage } from './language';
import './demand.css';

interface DemandSnapshot { issued:number;businessDayCount:number;timeZone:string;hourly:number[];weekdayHours:number[][];peakHours:number[] }
const hours=Array.from({length:24},(_,hour)=>hour);
const dayNames=[['จ','Mon'],['อ','Tue'],['พ','Wed'],['พฤ','Thu'],['ศ','Fri'],['ส','Sat'],['อา','Sun']] as const;
const hourLabel=(hour:number)=>`${String(hour).padStart(2,'0')}:00`;

export function DemandCharts({shopId,range,serviceId,revision}:{shopId:string;range:string;serviceId:string;revision:number}){
  const {t}=useLanguage();const errorText=useErrorText();const [data,setData]=useState<DemandSnapshot|null>(null);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;setData(null);setError('');
    const query=new URLSearchParams({range});if(serviceId)query.set('serviceId',serviceId);
    api<DemandSnapshot>(`/api/shops/${shopId}/demand?${query}`).then(value=>{if(active)setData(value);}).catch(failure=>{if(active)setError(errorText(failure));});
    return()=>{active=false;};
  },[shopId,range,serviceId,revision,retry]);
  if(error)return <section className="demand-section"><h2>{t('ช่วงรับคิว','Ticket demand')}</h2><p className="error" role="alert">{error}</p><button className="outline" onClick={()=>setRetry(value=>value+1)}>{t('ลองใหม่','Retry')}</button></section>;
  if(!data)return <section className="demand-section"><p role="status">{t('กำลังโหลดช่วงรับคิว…','Loading Ticket demand…')}</p></section>;
  if(data.issued===0)return <section className="demand-section"><h2>{t('ช่วงรับคิว','Ticket demand')}</h2><p>{t('ยังไม่มีคิวที่รับเข้ามาในรอบที่เลือก','No Tickets were received in these selected rounds')}</p><p className="muted small">{t('นับจากเวลารับคิวตามเวลาไทย ไม่ใช่เวลาเรียกหรือเสร็จงาน','Counts use Bangkok receive time, not Call or completion time')}</p></section>;
  const maximum=Math.max(...data.hourly);const cellMaximum=Math.max(...data.weekdayHours.flat());
  const peaks=data.peakHours.map(hourLabel).join(', ');
  return <section className="demand-section">
    <h2>{t('ช่วงรับคิว','Ticket demand')}</h2>
    <p className="demand-explanation">{t(`รับคิวมากที่สุดช่วง ${peaks}`,`Busiest receive hours: ${peaks}`)}</p>
    <p className="muted small">{t('เวลาประเทศไทย (Asia/Bangkok) · รวมลูกค้าและ Walk-in · นับตามเวลารับคิว','Asia/Bangkok · Customer and Walk-in · counted when received')}</p>
    <figure className="demand-hourly">
      <figcaption>{t('คิวที่รับแต่ละชั่วโมง','Tickets received by hour')}</figcaption>
      <div className="demand-bars" role="img" aria-label={t(`กราฟจำนวนคิว ${data.issued} คิว ช่วงสูงสุด ${peaks}`,`Demand chart of ${data.issued} Tickets; peak hours ${peaks}`)}>
        {hours.map(hour=><div className="demand-bar-column" key={hour} aria-hidden="true"><span className="demand-bar" style={{height:`${data.hourly[hour]/maximum*100}%`}}/><span className="demand-bar-hour">{hour%6===0||hour===23?String(hour).padStart(2,'0'):''}</span></div>)}
      </div>
      <details className="demand-values"><summary>{t('ดูจำนวนแต่ละชั่วโมง','Read hourly counts')}</summary><table><caption>{t('จำนวนคิวตามเวลารับ','Tickets by receive time')}</caption><thead><tr><th>{t('เวลา','Hour')}</th><th>{t('คิว','Tickets')}</th></tr></thead><tbody>{hours.map(hour=><tr key={hour}><th scope="row">{hourLabel(hour)}</th><td className="number">{data.hourly[hour]}</td></tr>)}</tbody></table></details>
    </figure>
    <h3>{t('รูปแบบตามวันในสัปดาห์','Weekday patterns')}</h3>
    <p className="demand-legend">{t('สีเข้ม = รับคิวมาก · ตัวเลข = จำนวนคิว · จุด = 0 คิว','Darker = busier · numbers = Tickets · dot = zero')}</p>
    {[0,12].map(start=><section className="demand-halfday" key={start} aria-label={t(`เวลา ${hourLabel(start)}–${hourLabel(start+11)}`,`${hourLabel(start)}–${hourLabel(start+11)}`)}><h4>{hourLabel(start)}–{hourLabel(start+11)}</h4><div className="demand-grid"><span aria-hidden="true"/>{hours.slice(start,start+12).map(hour=><span className="demand-grid-hour" key={hour}>{String(hour).padStart(2,'0')}</span>)}{dayNames.map((day,index)=><Fragment key={index}><span className="demand-day">{t(day[0],day[1])}</span>{hours.slice(start,start+12).map(hour=>{const count=data.weekdayHours[index][hour];return <span key={hour} className="demand-cell" style={{background:count?`color-mix(in srgb, var(--terra) ${15+count/cellMaximum*40}%, var(--paper))`:'var(--paper)'}} aria-label={t(`${day[0]} ${hourLabel(hour)} ${count} คิว`,`${day[1]} ${hourLabel(hour)}: ${count} Tickets`)} title={`${t(day[0],day[1])} ${hourLabel(hour)}: ${count}`}>{count||'·'}</span>;})}</Fragment>)}</div></section>)}
  </section>;
}
