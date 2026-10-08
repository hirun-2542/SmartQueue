import { useState } from 'react';
import { Plus } from 'lucide-react';
import { post } from './api';
import type { ConsoleQueue, OwnerTicket } from './consoleTypes';
import { useLanguage,useErrorText } from './language';
import { Sheet } from './Sheet';
import './walkin.css';

interface WalkinResult { ticket:OwnerTicket; joinedAhead:number }

export function WalkinTicket({queues,selectedQueueId,onIssued}:{queues:ConsoleQueue[];selectedQueueId?:string|null;onIssued?:()=>void|Promise<void>}){
  const {t}=useLanguage();const errorText=useErrorText();
  const openQueues=queues.filter(q=>q.status==='Open');
  const [form,setForm]=useState(false);const [queueId,setQueueId]=useState('');const [note,setNote]=useState('');const [pending,setPending]=useState(false);const [error,setError]=useState('');const [issued,setIssued]=useState<WalkinResult|null>(null);
  if(queues.length===0)return null;
  const chosen=openQueues.find(q=>q.id===queueId)??null;
  function start(){const preferred=openQueues.find(q=>q.id===selectedQueueId)??openQueues[0];setQueueId(preferred?.id??'');setNote('');setError('');setForm(true);}
  function dismiss(){setForm(false);setError('');}
  async function create(){
    if(!chosen)return;
    setPending(true);setError('');
    try{
      const result=await post<WalkinResult>(`/api/queues/${chosen.id}/walkin`,{note:note.trim()===''?null:note.trim()});
      setForm(false);setIssued(result);
      try{await onIssued?.();}catch(reloadError){setError(errorText(reloadError));}
    }catch(f){setError(errorText(f));}
    finally{setPending(false);}
  }
  function finish(){setIssued(null);setError('');}
  return <div className="walkin">
    <button type="button" className="icon-button walkin-open" onClick={start} aria-label={t('เพิ่มคิว Walk-in','Add Walk-in Ticket')}><Plus size={24} aria-hidden="true"/></button>
    {form&&<Sheet title={t('สร้างคิว Walk-in','Create Walk-in Ticket')} onClose={dismiss}>
      <p className="muted walkin-subtitle">{t('สำหรับลูกค้าที่ไม่มีมือถือ','For Customers who have no smartphone')}</p>
      <fieldset className="walkin-services"><legend>{t('บริการ','Service')}</legend>
        {queues.map(q=>{const accepting=q.status==='Open';return <label className={'walkin-service'+(accepting?'':' closed')} key={q.id}>
          <input type="radio" name="walkin-service" value={q.id} checked={queueId===q.id} disabled={!accepting} onChange={()=>setQueueId(q.id)}/>
          <span>{q.name}{accepting?null:<small>{t(' (ปิดรับคิวใหม่)',' (not accepting new Tickets)')}</small>}</span>
          <span className="number walkin-count" aria-hidden="true">{q.waitingCount}</span>
        </label>;})}
      </fieldset>
      {openQueues.length===0&&<p className="muted walkin-hint" role="status">{t('เปิดคิวจากหน้าร้านก่อนสร้างคิว Walk-in','Open a Queue on the Shop page before creating a Walk-in Ticket')}</p>}
      <label className="walkin-note">{t('ชื่อเล่นหรือหมายเหตุ (ไม่บังคับ)','Nickname or note (optional)')}
        <textarea value={note} rows={2} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder={t('เช่น คุณลุง — ตัดสั้น','e.g. Uncle — short cut')}/>
      </label>
      <p className="muted walkin-hint">{t('ไม่มีลิงก์คิว ลูกค้าดูเลขคิวจากจอหน้าร้าน','No Ticket link. The Customer reads the number on the Shop display.')}</p>
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="walkin-actions"><button type="button" className="outline" onClick={dismiss} disabled={pending}>{t('ยกเลิก','Cancel')}</button><button type="button" className="primary" onClick={create} disabled={pending||!chosen}>{pending?t('กำลังสร้าง…','Creating…'):t('สร้างคิว','Create Ticket')}</button></div>
    </Sheet>}
    {issued&&<Sheet title={t('สร้างคิวแล้ว','Walk-in Ticket created')} onClose={finish}>
      <div className="walkin-result" role="status" aria-live="polite">
        <strong className="number walkin-number">{issued.ticket.number}</strong>
        <p>{issued.ticket.serviceName} · {t(`ต่อจาก ${issued.joinedAhead} คิว`,`${issued.joinedAhead} ahead`)}</p>
        <p className="muted">{t('บอกลูกค้าให้ดูเลขนี้บนจอหน้าร้าน','Tell the Customer to watch this number on the Shop display')}</p>
      </div>
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="walkin-actions"><button type="button" className="primary" onClick={finish}>{t('เสร็จ','Done')}</button></div>
    </Sheet>}
  </div>;
}
