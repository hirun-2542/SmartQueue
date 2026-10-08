import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import { ApiFailure, post } from './api';
import type { ServiceInfo } from './domain';
import { useOwner } from './OwnerState';
import { Sheet } from './Sheet';
import { useLanguage, useErrorText } from './language';
import './archive.css';

/**
 * Owner control that hides a Service while keeping everything it already produced. The trigger is a plain
 * text button under the Service form; the confirmation sheet spells out exactly what is preserved so the
 * Owner never confuses hiding a Service with throwing away the Tickets still waiting. It sends the live Shop
 * version from the Owner scope, so a stale editor is refused with the latest state instead of acting on a
 * Service that changed underneath it. On success it reloads the Shop and closes the editor through
 * `onArchived`; on a version conflict it reloads first so the Owner can retry with current data.
 */
export function ArchiveService({ service, onArchived }: { service: ServiceInfo; onArchived: () => void | Promise<void> }) {
  const { t } = useLanguage(); const errorText = useErrorText(); const { shop, reload } = useOwner();
  const [confirming, setConfirming] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState('');

  async function archive() {
    setPending(true); setError('');
    try {
      await post(`/api/services/${service.id}/archive`, { version: shop?.version ?? 0 });
      setConfirming(false);
      await onArchived();
    } catch (failure) {
      setError(errorText(failure));
      if (failure instanceof ApiFailure && failure.code === 'state_changed') {
        try { await reload(); } catch { /* the alert already explains the conflict; the refresh is best effort */ }
      }
    } finally { setPending(false); }
  }

  return <section className="archive-controls">
    <button type="button" className="text-action archive-trigger" onClick={() => { setError(''); setConfirming(true); }} disabled={pending}>
      <EyeOff size={20} aria-hidden="true" />{t('ซ่อนบริการนี้','Hide this Service')}
    </button>
    <p className="archive-caption muted">{t('ลูกค้าจะไม่เห็น แต่คิวและประวัติเดิมยังอยู่','Customers will not see it, but its Tickets and history stay')}</p>
    {confirming && <Sheet title={t(`ซ่อนบริการ ${service.name}?`,`Hide the ${service.name} Service?`)} onClose={() => { if (!pending) setConfirming(false); }}>
      <div className="archive-summary">
        <p>{t('บริการนี้จะหายจากหน้ารับคิวของลูกค้า และเปิดรอบใหม่ให้ไม่ได้อีก','This Service disappears from the Customer join page and can no longer open a new Business day')}</p>
        <small>{t('ซ่อนแล้วย้อนกลับในแอปไม่ได้','Hiding it cannot be undone in the app')}</small>
      </div>
      <ul className="archive-effects">
        <li>{t('คิวที่รออยู่ยังถูกเรียกและให้บริการต่อจนจบ ไม่มีคิวไหนถูกทิ้ง','Tickets still waiting stay callable and are served to the end — none are thrown away')}</li>
        <li>{t('ลิงก์คิวและเลขคิวเดิมยังใช้ได้ และประวัติกับสถิติเดิมยังอยู่ครบ','Existing Ticket links and numbers keep working, and the history and statistics stay')}</li>
        <li>{t('ถ้าต้องการทิ้งคิวที่รอ ให้ใช้ “ปิดทันที” (Drop) ที่หน้าคิว ไม่ใช่ปุ่มนี้','To throw away the waiting Tickets, use “Close now” (Drop) on the Queue page — not this button')}</li>
      </ul>
      {error && <p className="error archive-alert" role="alert">{error}</p>}
      <div className="archive-sheet-actions">
        <button type="button" className="archive-confirm" disabled={pending} onClick={() => void archive()}>{pending ? t('กำลังซ่อน…','Hiding…') : t('ซ่อนบริการนี้','Hide this Service')}</button>
        <button type="button" className="archive-cancel" disabled={pending} onClick={() => { setConfirming(false); setError(''); }}>{t('ยกเลิก','Cancel')}</button>
      </div>
    </Sheet>}
  </section>;
}
