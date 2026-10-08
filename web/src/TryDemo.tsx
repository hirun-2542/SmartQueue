import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useErrorText, useLanguage } from './language';
import { demoErrorText, startDemo } from './demoApi';
import './demo.css';

/**
 * Try demo entry. It asks the server for a session-bound demo Shop, then refreshes the account session
 * so the Owner shell can open it. Without an `onSignedIn` hook it reloads so the new session is picked up.
 */
export function TryDemo({ onSignedIn }: { onSignedIn?: () => Promise<void> }) {
  const { t } = useLanguage();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function start() {
    setPending(true);
    setError('');
    try {
      await startDemo();
      if (onSignedIn) {
        await onSignedIn();
        navigate('/owner', { replace: true });
      } else {
        window.location.assign('/owner');
      }
    } catch (failure) {
      setError(demoErrorText(failure, t) ?? errorText(failure));
    } finally {
      setPending(false);
    }
  }
  return <section className="demo-entry" aria-labelledby="demo-entry-title">
    <h2 id="demo-entry-title">{t('ลองใช้โหมดสาธิต', 'Try the demo')}</h2>
    <p>{t('เข้าเป็นเจ้าของร้านตัวอย่างได้ทันที ไม่ต้องสมัคร ข้อมูลตัวอย่างแยกจากบัญชีจริงและถูกลบอัตโนมัติภายใน 24 ชั่วโมง', 'Open a sample Shop as its Owner without registering. Sample data stays separate from real accounts and is removed automatically within 24 hours.')}</p>
    <button className="primary demo-start" type="button" onClick={start} disabled={pending}>
      <Sparkles size={20} aria-hidden="true" />{pending ? t('กำลังเตรียมข้อมูลตัวอย่าง…', 'Preparing sample data…') : t('เข้าโหมดสาธิต', 'Enter demo mode')}
    </button>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
