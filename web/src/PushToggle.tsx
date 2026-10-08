import { useEffect, useRef, useState } from 'react';
import { BellOff, BellRing, Share, TriangleAlert } from 'lucide-react';
import { api } from './api';
import { useErrorText, useLanguage } from './language';
import { disablePush, enablePush, type PushState } from './push';
import './push.css';

type Capability = 'checking' | 'supported' | 'unsupported' | 'install';

/**
 * Which notification state this browsing context can actually offer. A non-installed iOS/iPadOS context is
 * reported as install guidance even though its Safari exposes no Push API, and an installed one that still
 * lacks the API is unsupported rather than promising delivery.
 */
function notificationCapability(): Capability {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!installed) return 'install';
  }
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window ? 'supported' : 'unsupported';
}

/**
 * The optional notification opt-in on the Customer Ticket view. It never gates the Ticket: joining, tracking
 * and cancelling keep working when notifications are off, denied or unsupported, and the control always
 * states which of those it is. An iOS Safari tab never claims notifications are available; it explains the
 * Home Screen installation the platform requires instead.
 */
export function PushToggle({ secret }: { secret: string }) {
  const { language, t } = useLanguage();
  const errorText = useErrorText();
  const [capability, setCapability] = useState<Capability>('checking');
  const [ticketId, setTicketId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const syncedLanguage = useRef(language);

  useEffect(() => {
    setCapability(notificationCapability());
  }, []);

  useEffect(() => {
    if (capability !== 'supported') return;
    let active = true;
    api<PushState>(`/api/t/${secret}/push`)
      .then(state => { if (!active) return; setTicketId(state.ticketId); setEnabled(state.enabled && Notification.permission === 'granted'); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [capability, secret]);

  // The stored language decides the notification copy, so an enabled Ticket follows the page language.
  useEffect(() => {
    if (!enabled || syncedLanguage.current === language) return;
    syncedLanguage.current = language;
    enablePush(secret, language).catch(() => undefined);
  }, [enabled, language, secret]);

  async function toggle() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (enabled) {
        await disablePush(secret, ticketId);
        setEnabled(false);
      } else {
        await enablePush(secret, language);
        syncedLanguage.current = language;
        setEnabled(true);
      }
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : '';
      if (code === 'push_denied') setError(t('เบราว์เซอร์ไม่อนุญาตการแจ้งเตือน เปิดได้ในการตั้งค่าเว็บไซต์', 'Your browser did not allow notifications. Allow them in site settings.'));
      else if (code === 'push_unavailable') setError(t('เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าการแจ้งเตือน ลองใหม่ภายหลัง', 'Notifications are not configured on the server yet. Try again later.'));
      else setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  return <section className="push-toggle" aria-labelledby="push-toggle-title">
    <h2 id="push-toggle-title">{t('การแจ้งเตือน', 'Notifications')}</h2>
    {capability === 'install' ? <>
      <p className="push-note"><Share size={20} aria-hidden="true"/>{t('บน iPhone และ iPad การแจ้งเตือนใช้ได้เฉพาะแอปที่ติดตั้งบนหน้าจอโฮม', 'On iPhone and iPad, notifications only work from the app installed on your Home Screen.')}</p>
      <ol className="push-steps">
        <li>{t('แตะปุ่มแชร์ใน Safari', 'Tap the Share button in Safari')}</li>
        <li>{t('เลือก “เพิ่มไปยังหน้าจอโฮม”', 'Choose “Add to Home Screen”')}</li>
        <li>{t('เปิด SmartQueue จากไอคอน แล้วเปิดการแจ้งเตือน', 'Open SmartQueue from the icon, then turn on notifications')}</li>
      </ol>
    </> : capability === 'unsupported' ? <p className="push-note"><TriangleAlert size={20} aria-hidden="true"/>{t('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน คิวของคุณยังใช้งานได้ตามปกติ', 'This browser does not support notifications. Your Ticket still works normally.')}</p>
      : capability === 'checking' ? <p role="status" className="push-note">{t('กำลังตรวจสอบการแจ้งเตือน…', 'Checking notification support…')}</p>
      : <>
        <button type="button" role="switch" aria-checked={enabled} className={'push-switch ' + (enabled ? 'on' : 'off')} aria-busy={busy} disabled={busy} onClick={() => void toggle()}>
          {enabled ? <BellRing size={22} aria-hidden="true"/> : <BellOff size={22} aria-hidden="true"/>}
          <span className="push-switch-label">{t('แจ้งเตือนเมื่อใกล้ถึงคิว', 'Notify me when my turn nears')}</span>
          <span className="push-switch-state">{enabled ? t('เปิดอยู่', 'On') : t('ปิดอยู่', 'Off')}</span>
        </button>
        <p className="push-note">{enabled
          ? t('จะแจ้งเตือนเมื่อใกล้ถึงคิว เมื่อถูกเรียก และเมื่อร้านปิดคิว', 'You will be notified when your turn nears, when you are Called, and when the Shop drops the Queue.')
          : t('เปิดได้ทุกเมื่อ การรับคิวยังทำงานได้โดยไม่ต้องอนุญาต', 'You can turn this on any time. Taking a Ticket never requires it.')}</p>
        {busy && <p role="status" className="push-note">{t('กำลังบันทึก…', 'Saving…')}</p>}
        {!enabled && Notification.permission === 'denied' && <p role="status" className="push-note blocked">{t('เบราว์เซอร์ปิดการแจ้งเตือนไว้ เปิดได้ในการตั้งค่าเว็บไซต์', 'Notifications are blocked in your browser. Allow them in site settings.')}</p>}
        {error && <p role="alert" className="error">{error}</p>}
      </>}
  </section>;
}
