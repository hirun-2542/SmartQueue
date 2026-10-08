import { useEffect, useState } from 'react';
import { useErrorText, useLanguage } from './language';
import { demoCountdown, demoErrorText, readDemoState, startDemo } from './demoApi';
import './demo.css';

/**
 * Labels the session as a demo and shows when the fixture expires. It stays hidden for real Owners.
 * The server keeps enforcing the expiry and removes the fixture; this only reports it.
 */
export function DemoBanner() {
  const { t } = useLanguage();
  const errorText = useErrorText();
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    readDemoState().then(value => { if (active) { setExpiresAt(value.expiresAt); setExpired(value.expired); } }).catch(() => { /* session stays hidden when it cannot be read */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  async function restart() {
    setPending(true);
    setError('');
    try {
      await startDemo();
      window.location.assign('/owner');
    } catch (failure) {
      setError(demoErrorText(failure, t) ?? errorText(failure));
      setPending(false);
    }
  }
  if (!expiresAt && !expired) return null;
  const remaining = expiresAt ? new Date(expiresAt).getTime() - now : 0;
  const over = expired || remaining <= 0;
  return <aside className="demo-banner" aria-label={t('โหมดสาธิต', 'Demo mode')}>
    <div className="demo-banner-copy">
      <strong>{over ? t('โหมดสาธิตหมดอายุ', 'Demo expired') : t('โหมดสาธิต', 'Demo mode')}</strong>
      <span>{over ? t('ข้อมูลตัวอย่างถูกลบแล้ว เริ่มสาธิตใหม่ได้ทันที', 'Sample data was removed. Start a new demo anytime') : t('ข้อมูลตัวอย่างจะถูกลบอัตโนมัติภายใน 24 ชั่วโมง', 'Sample data is removed automatically within 24 hours')}</span>
    </div>
    {!over && <span className="number demo-countdown" aria-hidden="true">{demoCountdown(remaining)}</span>}
    {over && <div className="demo-actions">
      <button className="primary" type="button" onClick={restart} disabled={pending}>{pending ? t('กำลังเตรียม…', 'Preparing…') : t('เริ่มสาธิตใหม่', 'Start demo again')}</button>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
  </aside>;
}
