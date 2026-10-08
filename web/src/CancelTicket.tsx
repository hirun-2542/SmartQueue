import { useState } from 'react';
import { X } from 'lucide-react';
import { ApiFailure, post } from './api';
import { useLanguage } from './language';
import { Sheet } from './Sheet';
import type { CustomerTicket } from './ticketTypes';
import './cancel.css';

export function CancelTicket({secret,ticket,onChanged,disabled=false}:{secret:string;ticket:CustomerTicket;onChanged:(ticket:CustomerTicket)=>void;disabled?:boolean}){
  const {t}=useLanguage();
  const [open,setOpen]=useState(false);const [pending,setPending]=useState(false);const [error,setError]=useState('');
  const available=ticket.status==='Waiting'||ticket.status==='Called';
  if(!available&&!open)return null;
  function explain(failure:unknown){
    const code=failure instanceof ApiFailure?failure.code:'request_failed';
    if(code==='not_cancellable')return t('คิวนี้เริ่มให้บริการแล้วหรือจบไปแล้ว จึงยกเลิกไม่ได้','This Ticket is being served or has already ended, so it cannot be cancelled');
    if(code==='ticket_changed')return t('คิวนี้เปลี่ยนสถานะแล้ว ตรวจสอบข้อมูลล่าสุดก่อนดำเนินการ','This Ticket changed. Check its latest state before acting');
    if(code==='ticket_expired')return t('ลิงก์นี้หมดอายุหลังคิวจบครบ 24 ชั่วโมง','This link expired 24 hours after the Ticket ended');
    if(code==='not_found')return t('ไม่พบคิวจริงจากลิงก์นี้','This link does not match a Ticket');
    return t('ยกเลิกไม่สำเร็จ โหลดข้อมูลล่าสุดแล้วลองอีกครั้ง','Cancelling failed. Refresh the latest state and try again');
  }
  async function cancel(){
    setPending(true);setError('');
    try{
      const updated=await post<CustomerTicket>('/api/t/'+encodeURIComponent(secret)+'/cancel',{version:ticket.version});
      setOpen(false);onChanged(updated);
    }catch(failure){
      setError(explain(failure));
      const raw=failure instanceof ApiFailure?failure.current:null;
      const current=raw&&typeof raw==='object'&&typeof (raw as Partial<CustomerTicket>).version==='number'&&typeof (raw as Partial<CustomerTicket>).status==='string'?raw as CustomerTicket:null;
      if(current)onChanged(current);
    }finally{setPending(false);}
  }
  return <>
    {available&&<button type="button" className="danger cancel-ticket" disabled={disabled} onClick={()=>{setError('');setOpen(true)}}><X size={22} aria-hidden="true"/>{t('ยกเลิกคิวนี้','Cancel this Ticket')}</button>}
    {open&&<Sheet title={t('ยกเลิกคิวนี้','Cancel this Ticket')} onClose={()=>setOpen(false)}>
      <p className="cancel-summary"><small>{t('หมายเลขคิว','Ticket number')}</small><strong className="number">{ticket.number}</strong></p>
      <p className="cancel-copy">{ticket.status==='Called'?t('ร้านกำลังเรียกคุณอยู่ ถ้ายกเลิกตอนนี้ร้านจะว่างและเรียกคิวถัดไปได้ทันที','The Shop is calling you now. Cancelling frees the counter at once so the next Ticket can be called.'):t('การยกเลิกเป็นผลสุดท้าย คิวนี้จะไม่กลับมาและไม่นับเป็นคิวที่รออยู่','Cancelling is final. This Ticket will not return and stops counting as a Waiting Ticket.')}</p>
      <p className="cancel-note">{t('ถ้าร้านยังเปิดรับคิว คุณรับคิวใหม่ได้ตามปกติหลังยกเลิก','You can take a new Ticket afterwards while the Shop is still accepting.')}</p>
      {error&&<p role="alert" className="error cancel-alert">{error}</p>}
      <div className="cancel-actions">
        <button type="button" className="outline" disabled={pending} onClick={()=>setOpen(false)}>{available?t('ไม่ยกเลิก เก็บคิวนี้ไว้','Keep my Ticket'):t('ปิด','Close')}</button>
        {available&&<button type="button" className="danger cancel-confirm" disabled={pending||disabled} aria-busy={pending} onClick={cancel}>{pending?t('กำลังยกเลิก…','Cancelling…'):t('ยืนยันยกเลิกคิว','Yes, cancel my Ticket')}</button>}
      </div>
      <p role="status" aria-live="polite" className="muted cancel-status">{pending?t('กำลังยกเลิกคิว…','Cancelling your Ticket…'):''}</p>
    </Sheet>}
  </>;
}
