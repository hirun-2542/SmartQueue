import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiFailure } from './api';
import { useErrorText, useLanguage } from './language';
import { useLive } from './useLive';
import { ConnectionStatus } from './ConnectionStatus';
import { ShopQr } from './ShopQr';
import { ShopTime } from './ShopTime';
import './board.css';

export interface BoardTicket { number: string; serviceName: string; status: string }
export interface BoardService { id: string; name: string; prefix: string; queueStatus: string; waiting: string[] }
export interface BoardSnapshot {
  shopName: string;
  publicId: string;
  version: number;
  currentCalled: BoardTicket | null;
  recent: BoardTicket[];
  services: BoardService[];
  serverTime: string;
}

const statusLabels: Record<string, [string, string]> = {
  Called: ['เรียกแล้ว', 'Called'],
  InService: ['กำลังให้บริการ', 'In service'],
  Completed: ['เสร็จแล้ว', 'Done'],
  Skipped: ['ข้าม', 'Skipped'],
  Cancelled: ['ยกเลิก', 'Cancelled'],
  Dropped: ['ปิดร้าน', 'Dropped'],
};

/**
 * Anonymous read-only Display board for a Shop, sized for a landscape screen. It loads a committed
 * snapshot, then resyncs on every public fan-out and reconnect; a snapshot that predates the applied
 * version is dropped so a phase change (a Call that ended, a Shop that closed) never stays as a current
 * Call. It renders only the board projection, so no Customer note or Ticket link can appear.
 */
export function DisplayBoard() {
  const { publicId } = useParams();
  const { t } = useLanguage();
  const errorText = useErrorText();
  const [board, setBoard] = useState<BoardSnapshot | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const requested = useRef(publicId);
  requested.current = publicId;

  async function load() {
    if (!publicId) return;
    try {
      const value = await api<BoardSnapshot>(`/api/board/${encodeURIComponent(publicId)}`);
      if (requested.current !== publicId) return;
      setBoard(previous => previous && previous.publicId === value.publicId && previous.version > value.version ? previous : value);
      setMissing(false);
      setError('');
    } catch (failure) {
      if (requested.current !== publicId) return;
      if (failure instanceof ApiFailure && failure.status === 404) { setMissing(true); setBoard(null); setError(''); }
      else setError(errorText(failure));
    }
  }

  const live = useLive({
    scope: publicId ? { kind: 'public', publicId } : null,
    onMessage: message => { if (!message.publicId || message.publicId === publicId) void load(); },
    resync: () => load(),
  });

  // Reload on a new Shop link; every later fan-out and reconnect resyncs through `load` above.
  useEffect(() => { setBoard(null); setMissing(false); setError(''); void load(); }, [publicId]);

  if (!publicId) return <main className="display-board board-centered" role="alert">
    <h1>{t('ลิงก์บอร์ดไม่ถูกต้อง', 'This board link is not valid')}</h1>
    <p>{t('ขอ QR ใหม่จากเจ้าของร้าน', 'Ask the Owner for a fresh QR')}</p>
  </main>;

  if (missing) return <main className="display-board board-centered" role="alert">
    <h1>{t('ไม่พบร้านนี้', 'Shop not found')}</h1>
    <p>{t('QR หรือลิงก์อาจไม่ถูกต้อง ขอ QR ใหม่จากเจ้าของร้าน', 'The QR or link may be wrong. Ask the Owner for a fresh QR')}</p>
  </main>;

  if (!board) return <main className="display-board board-centered" role="status">
    <p>{t('กำลังโหลดบอร์ด…', 'Loading board…')}</p>
    {error && <p className="board-error" role="alert">{error}</p>}
  </main>;

  const waitingServices = board.services.filter(service => service.waiting.length > 0);

  return <main className="display-board">
    <header className="board-head">
      <span className="board-mark" aria-hidden="true" />
      <h1 className="board-shop">{board.shopName}</h1>
      <ConnectionStatus status={live.status} onRetry={live.retry} className="board-live" />
      <ShopTime serverTime={live.serverTime??board.serverTime}/>
    </header>
    {error && <p className="board-error" role="alert">{error}</p>}
    <div className="board-grid">
      <div className="board-main">
        <section className="board-current" aria-live="polite" aria-label={t('กำลังเรียก', 'Now calling')}>
          <h2 className="board-label">{t('กำลังเรียก', 'Now calling')}</h2>
          {board.currentCalled
            ? <div className="board-current-card">
                <strong className="number board-current-number" style={{fontSize:`min(168px, ${150/board.currentCalled.number.length}cqi)`}}>{board.currentCalled.number}</strong>
                <span className="board-current-service">{board.currentCalled.serviceName}</span>
                <span className="board-current-hint">{t('เชิญที่เคาน์เตอร์', 'Please come to the counter')}</span>
              </div>
            : <div className="board-current-card board-current-empty">
                <strong>{t('ยังไม่มีคิวที่ถูกเรียก', 'No Ticket is being called')}</strong>
                <span className="board-current-hint">{t('คิวถัดไปที่ร้านเรียกจะแสดงที่นี่', 'The next Called Ticket appears here')}</span>
              </div>}
        </section>
        <section className="board-waiting" aria-label={t('คิวถัดไป', 'Next Tickets')}>
          <h2 className="board-label">{t('คิวถัดไป', 'Next Tickets')}</h2>
          {waitingServices.length === 0
            ? <p className="board-empty">{t('ยังไม่มีคิวที่รออยู่', 'No Tickets are waiting')}</p>
            : <div className="board-waiting-groups">
                {waitingServices.map(service => <div className="board-waiting-group" key={service.id}>
                  <h3 className="board-waiting-service">
                    <span>{service.name}</span>
                    <span className={`board-queue-state ${service.queueStatus.toLowerCase()}`}>{service.queueStatus === 'Open' ? t('เปิด', 'Open') : service.queueStatus === 'Closing' ? t('หยุดรับ · เรียกคิวที่เหลือ', 'Closing · serving remaining Tickets') : t('ปิด', 'Closed')}</span>
                    <span className="number board-waiting-count">{service.waiting.length}</span>
                  </h3>
                  <ol className="board-waiting-list">
                    {service.waiting.map((number, index) => <li className="number" key={`${service.id}-${number}-${index}`}>{number}</li>)}
                  </ol>
                </div>)}
              </div>}
        </section>
      </div>
      <aside className="board-side">
        <section className="board-recent" aria-label={t('เรียกล่าสุด', 'Recently called')}>
          <h2 className="board-label">{t('เรียกล่าสุด', 'Recently called')}</h2>
          {board.recent.length === 0
            ? <p className="board-empty">{t('ยังไม่มีประวัติการเรียก', 'No recent Calls yet')}</p>
            : <ol className="board-recent-list">
                {board.recent.map((ticket, index) => {
                  const label = statusLabels[ticket.status] ?? statusLabels.Called;
                  return <li className="board-recent-item" key={`${ticket.number}-${index}`}>
                    <strong className="number">{ticket.number}</strong>
                    <span className="board-recent-service">{ticket.serviceName}</span>
                    <span className={`board-status ${ticket.status.toLowerCase()}`}>{t(label[0], label[1])}</span>
                  </li>;
                })}
              </ol>}
        </section>
        <ShopQr publicId={board.publicId} shopName={board.shopName} variant="board" size={168} />
      </aside>
    </div>
  </main>;
}
