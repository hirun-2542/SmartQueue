import { useEffect,useRef,useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import { Copy,RefreshCw,Check,Clock3 } from 'lucide-react';
import { api } from './api';
import { LanguageSwitch,useErrorText,useLanguage } from './language';
import { Clock } from './Clock';
import { CancelTicket } from './CancelTicket';
import { useLive } from './useLive';
import { ConnectionStatus } from './ConnectionStatus';
import { EstimatedWait } from './EstimatedWait';
import { TicketAlerts } from './TicketAlerts';
import { PushToggle } from './PushToggle';
import type { CustomerTicket,TicketStatus } from './ticketTypes';
const statusWords:Record<TicketStatus,[string,string]>={Waiting:['รอเรียก','Waiting'],Called:['กำลังเรียก','Called'],InService:['กำลังให้บริการ','In service'],Completed:['เสร็จสิ้น','Completed'],Skipped:['ถูกข้ามแล้ว','Skipped'],Cancelled:['ยกเลิกแล้ว','Cancelled'],Dropped:['ร้านปิดคิว','Shop closed this Queue']};
export function CustomerTicketPage(){
  const {secret}=useParams();const {t}=useLanguage();const errorText=useErrorText();const [ticket,setTicket]=useState<CustomerTicket|null>(null);const [error,setError]=useState('');const [copied,setCopied]=useState(false);
  const activeSecret=useRef(secret);activeSecret.current=secret;
  async function reload(){const requested=secret;const value=await api<CustomerTicket>('/api/t/'+requested);if(activeSecret.current!==requested)return;localStorage.setItem('smartqueue-last-ticket','/t/'+requested);setTicket(previous=>previous?.id===value.id&&previous.version>value.version?previous:value);setError('');}
  const live=useLive({scope:secret?{kind:'ticket',secret}:null,onMessage:message=>{if(message.ticket)setTicket(previous=>previous?.id===message.ticket!.id&&previous.version>message.ticket!.version?previous:message.ticket!);else if(message.kind==='expired')void reload().catch(f=>setError(errorText(f)));},resync:()=>reload()});
  useEffect(()=>{let active=true;setTicket(null);setError('');api<CustomerTicket>('/api/t/'+secret).then(v=>{if(active){localStorage.setItem('smartqueue-last-ticket','/t/'+secret);setTicket(previous=>previous?.id===v.id&&previous.version>v.version?previous:v);}}).catch(f=>{if(active)setError(errorText(f))});return()=>{active=false};},[secret]);
  async function copy(){try{await navigator.clipboard.writeText(location.href);setCopied(true);}catch{setError(t('คัดลอกไม่ได้ กรุณาคัดลอกลิงก์จากแถบที่อยู่','Copy is unavailable. Copy the address from your browser'));}}
  const terminal=ticket&&['Completed','Skipped','Cancelled','Dropped'].includes(ticket.status);const called=ticket?.status==='Called';
  return <main className={'phone ticket-page '+(called?'your-turn':'')}><><header className="brand-row"><span className="brand-stub" aria-hidden="true"/><span className="shop-title">{ticket?.shopName??'SmartQueue'}</span><LanguageSwitch/></header><ConnectionStatus status={live.status} onRetry={live.retry}/></>{error?<section><h1>{t('ไม่สามารถเปิดคิวนี้','Cannot open this Ticket')}</h1><p role="alert" className="error">{error}</p><p className="muted">{t('สแกน QR ของร้านอีกครั้งเพื่อรับคิวใหม่','Scan the Shop QR again to take a new Ticket')}</p></section>:!ticket?<p role="status">{t('กำลังโหลดคิว…','Loading Ticket…')}</p>:<>
    {ticket.status==='Waiting'?<><section className="waiting-hero" aria-live="polite"><span>{t('ก่อนถึงคุณ','Ahead of you')}</span><strong className="number ahead-number">{ticket.ticketsAhead}</strong><h1>{t('คิวที่รออยู่ก่อนหน้า','Tickets in this Queue')}</h1><EstimatedWait ticketsAhead={ticket.ticketsAhead} estimatedWaitSeconds={ticket.estimatedWaitSeconds} sampleCount={ticket.estimateSampleCount}/></section>{ticket.currentCalled&&<div className="current-called ruled"><span>{t('กำลังเรียก','Currently Called')}</span><strong className="number">{ticket.currentCalled.number}</strong></div>}</>:
    called?<section className="called-heading" aria-live="assertive"><h1>{t('ถึงคิวคุณแล้ว','Your turn')}</h1><p>{t('เชิญที่เคาน์เตอร์ · ','Please come to the counter · ')}{ticket.serviceName}</p></section>:
    <section className="ticket-outcome" role="status">{ticket.status==='Completed'?<Check size={34} aria-hidden="true"/>:terminal?<Clock3 size={34} aria-hidden="true"/>:null}<h1>{t(...statusWords[ticket.status])}</h1><p className="muted">{ticket.status==='Skipped'?t('คุณต้องรับคิวใหม่ หากต้องการรออีกครั้ง','Take a new Ticket if you want to wait again'):ticket.status==='InService'?t('เจ้าของร้านเริ่มให้บริการแล้ว','The Owner has started serving your Ticket'):ticket.status==='Dropped'?t('ร้านหยุดให้บริการคิวที่ยังรออยู่','The Shop stopped serving the Waiting Tickets'):t('ดูผลสุดท้ายได้ 24 ชั่วโมงหลังคิวจบ','The final result remains visible for 24 hours')}</p></section>}
    <section className={'ticket-stub '+(called?'called-stub':'')} aria-label={t('หมายเลขคิวของคุณ','Your Ticket number')}><div><small>{t('หมายเลขคิวของคุณ','Your Ticket number')}</small><strong className="number ticket-number" style={{fontSize:`${Math.min(called?6.5:3.5,Math.max(1,(called?26:14)/ticket.number.length))}rem`}}>{ticket.number}</strong></div><div className="ticket-service"><small>{t('บริการ','Service')}</small><strong>{ticket.serviceName}</strong><span className="status-word">{t(...statusWords[ticket.status])}</span></div></section>
    {called&&<div className="customer-deadline"><span>{t('เหลือเวลามาที่เคาน์เตอร์','Time left to arrive')}</span><Clock deadline={ticket.deadline} serverTime={live.serverTime??ticket.serverTime}/><p>{t('ถ้าไม่มา คิวจะถูกข้ามอัตโนมัติเมื่อระบบยืนยันหมดเวลา','Your Ticket is auto-Skipped when the server confirms the timeout')}</p></div>}
    <CancelTicket secret={secret ?? ''} ticket={ticket} onChanged={setTicket} disabled={live.stale}/>
    <TicketAlerts status={ticket.status}/>
    {!terminal&&<PushToggle secret={secret??''}/>}
    {terminal&&<Link className="button primary" to={'/s/'+ticket.shopPublicId}>{t('รับคิวใหม่','Take a new Ticket')}</Link>}
    <button className="text-action link-row" type="button" onClick={copy}><Copy size={22} aria-hidden="true"/>{copied?t('คัดลอกลิงก์แล้ว','Link copied'):t('คัดลอกลิงก์คิวของฉัน','Copy my Ticket link')}</button><button className="text-action link-row" type="button" onClick={()=>{void reload().catch(f=>setError(errorText(f)));}} ><RefreshCw size={22} aria-hidden="true"/>{t('อัปเดตสถานะ','Refresh status')}</button><Link className="text-action centered" to={'/s/'+ticket.shopPublicId}>{t('กลับไปหน้าร้าน','Back to the Shop')}</Link>
  </>}</main>;
}
