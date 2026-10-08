import { RefreshCw } from 'lucide-react';
import { useLanguage } from './language';
import type { LiveStatus } from './useLive';
import './live.css';

const labels: Record<LiveStatus, [string, string]> = {
  off: ['ปิดการอัปเดตสด', 'Live updates off'],
  connecting: ['กำลังเชื่อมต่อ…', 'Connecting…'],
  live: ['อัปเดตสด', 'Live'],
  reconnecting: ['กำลังเชื่อมต่อใหม่…', 'Reconnecting…'],
  stale: ['ข้อมูลอาจไม่เป็นปัจจุบัน', 'Updates paused — state may be out of date'],
};

/**
 * Connection state for a live view. While the status is not `live` the Owner UI must keep unsafe
 * commands unavailable; the retry control gives one explicit 48px way back instead of silent retries.
 */
export function ConnectionStatus({ status, onRetry, className }: { status: LiveStatus; onRetry?: () => void; className?: string }) {
  const { t } = useLanguage();
  const [thai, english] = labels[status];
  return (
    <div className={`live-status ${status}${className ? ' ' + className : ''}`}>
      <span className="live-dot" aria-hidden="true" />
      <span className="live-label" role="status">{t(thai, english)}</span>
      {status !== 'live' && onRetry && (
        <button type="button" className="live-retry" onClick={onRetry} aria-label={t('เชื่อมต่อและอัปเดตทันที', 'Resync live updates now')}>
          <RefreshCw size={20} aria-hidden="true" />
          {t('อัปเดตเดี๋ยวนี้', 'Resync now')}
        </button>
      )}
    </div>
  );
}
