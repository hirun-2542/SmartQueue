import { useEffect,useState } from 'react';
import { ApiFailure,post } from './api';
import type { ConsoleQueue } from './consoleTypes';
import { useLanguage,useErrorText } from './language';
import { Sheet } from './Sheet';
import './close.css';

interface QueueState { queueId:string; status:'Open'|'Closing'|'Closed'; businessDayId:string|null; businessDayClosedAt:string|null; droppedCount:number; droppedTicketIds:string[]; serverTime:string }

/**
 * Owner controls for ending a Queue: stop accepting while the remaining Tickets are served, or Drop the
 * Waiting Tickets immediately after confirming. Both send the Shop version the console is showing, so a
 * stale tab is refused with the latest state instead of acting on a Queue that changed underneath it.
 */
export function QueueCloseControls({queue,shopVersion,onChanged,disabled=false}:{queue:ConsoleQueue|undefined;shopVersion:number;onChanged:()=>void|Promise<void>;disabled?:boolean}){
  const {t}=useLanguage();const errorText=useErrorText();
  const [confirming,setConfirming]=useState(false);const [pending,setPending]=useState<'stop'|'drop'|null>(null);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  useEffect(()=>{setNotice('');},[queue?.id,queue?.status]);
  if(!queue)return null;
  const queueId=queue.id;const waiting=queue.waitingCount;const accepting=queue.status==='Open';
  const alreadyClosing=t('คิวนี้กำลังปิดอยู่แล้ว เรียกคิวที่ค้างให้จบก่อน','This Queue is already closing. Finish the Tickets still held first.');

  async function run(kind:'stop'|'drop'){
    setPending(kind);setError('');
    try{
      const state=kind==='stop'
        ?await post<QueueState>(`/api/queues/${queueId}/stop`,{version:shopVersion})
        :await post<QueueState>(`/api/queues/${queueId}/drop`,{version:shopVersion,confirm:true});
      setConfirming(false);
      setNotice(kind==='drop'
        ?state.status==='Closed'
          ?t(`ปิดคิวทันทีแล้ว · ${state.droppedCount} คิวเป็น Dropped และจบรอบนี้`,`Closed now · ${state.droppedCount} Tickets Dropped and this Business day ended`)
          :t(`หยุดรับและ Drop ${state.droppedCount} คิวแล้ว · คิวที่กำลังทำต่อจนจบ`,`Stopped accepting · ${state.droppedCount} Tickets Dropped; the Ticket in progress continues`)
        :state.status==='Closed'
          ?t('ไม่มีคิวค้าง ปิดรับและจบรอบนี้ในครั้งเดียว','No Tickets were held; stopped accepting and ended this Business day in one step')
          :t('ปิดรับคิวแล้ว เรียกคิวที่เหลือต่อจนหมด','Stopped accepting. Keep calling the remaining Tickets.'));
      try{await onChanged();}catch(reloadError){setError(reloadError instanceof ApiFailure&&reloadError.code==='queue_closing'?alreadyClosing:errorText(reloadError));}
    }catch(f){
      setError(f instanceof ApiFailure&&f.code==='queue_closing'?alreadyClosing:errorText(f));
      try{await onChanged();}catch{/* the console refresh is best effort; the alert already explains the failure */}
    }finally{setPending(null);}
  }

  return <section className="close-controls" aria-label={t('ปิดรับคิวและปิดคิวทันที','Stop accepting and close the Queue')}>
    <div className="close-status-row"><span className={'close-status '+(queue.status==='Open'?'open':queue.status==='Closing'?'closing':'')} role="status">{queue.status==='Open'?t('เปิดรับคิว','Open for Tickets'):queue.status==='Closing'?t('กำลังปิด · ยังเรียกคิวที่เหลือ','Closing · still calling the remaining Tickets'):t('ปิดรอบแล้ว','Business day closed')}</span></div>
    <p className="close-hint">{accepting?t('ปิดรับคิวเพื่อเรียกคิวที่รอจนหมดก่อนจบรอบ','Stop accepting to serve the Waiting Tickets before the Business day ends'):queue.status==='Closing'?t('คิวนี้ปิดเองเมื่อไม่มีคิวค้าง ไม่มีตัวจับเวลาปิดอัตโนมัติ','This Queue closes when the last active Ticket ends — nothing closes it on a timer'):t('เปิดรอบใหม่ได้จากหน้าร้าน แล้วเลขคิวจะเริ่มที่ 1 อีกครั้ง','Open a new Business day from the Shop page; Ticket numbers start at 1 again')}</p>
    {(accepting||queue.status==='Closing')&&<div className="close-actions">
      {accepting&&<button type="button" className="outline" disabled={pending!==null||disabled} onClick={()=>void run('stop')}>{pending==='stop'?t('กำลังปิดรับ…','Stopping…'):t('ปิดรับคิว','Stop accepting')}</button>}
      <button type="button" className="close-drop" disabled={pending!==null||disabled} onClick={()=>{setError('');setNotice('');setConfirming(true);}}>{t('ปิดทันที','Close now')}</button>
    </div>}
    {notice&&<p className="close-notice" role="status" aria-live="polite">{notice}</p>}
    {error&&<p className="error close-alert" role="alert">{error}</p>}
    {confirming&&<Sheet title={t(`ปิดคิว ${queue.name} ทันที?`,`Close the ${queue.name} Queue now?`)} onClose={()=>{if(pending===null)setConfirming(false);}}>
      <div className="close-summary">
        <p>{t('ลูกค้าที่ยังรออยู่จะเสียคิว','The Customers still waiting lose their place')}</p>
        <small>{t('คิวที่กำลังเรียกหรือให้บริการทำต่อจนจบ ไม่ถูกปิดทันที','A Called or InService Ticket continues to the end; it is not ended here')}</small>
      </div>
      <ul className="close-effects">
        <li>{t(`${waiting} คิวที่รอ จะเปลี่ยนเป็น “ร้านปิดคิว” (Dropped)`,`${waiting} Waiting Ticket(s) become “Shop closed this Queue” (Dropped)`)}</li>
        <li>{t('ลูกค้าเห็นข้อความนี้ในลิงก์คิวและรับแจ้งเตือนเมื่อเปิดไว้','The Customer sees this in their Ticket link and is notified when they enabled it')}</li>
        <li>{t('ไม่นับรวมในอัตราข้ามหรืออัตรายกเลิกของร้าน','Counted separately from the Shop’s Skip and Cancel rates')}</li>
      </ul>
      <p className="close-sheet-hint">{t('หรือ “ปิดรับคิว” เพื่อเรียกต่อจนหมดก่อน','Or use “Stop accepting” to call the rest out first')}</p>
      {error&&<p className="error close-alert" role="alert">{error}</p>}
      <div className="close-sheet-actions">
        <button type="button" className="close-confirm" disabled={pending!==null||disabled} onClick={()=>void run('drop')}>{pending==='drop'?t('กำลังปิดคิว…','Closing the Queue…'):t('ปิดคิวทันที','Close the Queue now')}</button>
        <button type="button" className="close-cancel" disabled={pending!==null} onClick={()=>{setConfirming(false);setError('');}}>{t('ยกเลิก','Cancel')}</button>
      </div>
    </Sheet>}
  </section>;
}
