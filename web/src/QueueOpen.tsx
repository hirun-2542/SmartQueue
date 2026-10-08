import { useState } from 'react';
import { post } from './api';
import type { QueueInfo } from './domain';
import { useOwner } from './OwnerState';
import { useLanguage,useErrorText } from './language';
export function QueueOpen({queue}:{queue:QueueInfo}){
  const {reload}=useOwner();const {t}=useLanguage();const errorText=useErrorText();const [pending,setPending]=useState(false);const [error,setError]=useState('');
  async function open(){setPending(true);try{await post(`/api/queues/${queue.id}/open`,{});await reload();setError('');}catch(f){setError(errorText(f));}finally{setPending(false);}}
  return <div className="queue-control"><span className={'queue-status '+(queue.status==='Open'?'open':'')}>{queue.status==='Open'?t('เปิดรับคิว','Open for Tickets'):queue.status==='Closing'?t('กำลังปิด','Closing'):t('ปิดอยู่','Closed')}</span>{queue.status==='Closed'&&<button type="button" className="text-action" onClick={open} disabled={pending}>{pending?t('กำลังเปิด…','Opening…'):t('เปิดคิว','Open Queue')}</button>}{error&&<p className="error" role="alert">{error}</p>}</div>;
}
