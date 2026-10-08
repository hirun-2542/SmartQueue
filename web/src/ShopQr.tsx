import { useEffect, useRef, useState } from 'react';
import * as QRCode from 'qrcode';
import { Check, Copy, Download } from 'lucide-react';
import { useLanguage } from './language';
import './board.css';

/** Absolute join link for a Shop, used both as the QR payload and the copy/deep link. */
export function shopPublicUrl(publicId: string, origin?: string): string {
  const path = `/s/${encodeURIComponent(publicId)}`;
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  if (!base) return path;
  try { return new URL(path, base).href; } catch { return path; }
}

type QrStatus = 'idle' | 'copied' | 'copy_failed' | 'downloaded';

/**
 * Scannable Shop QR. It renders the real join link into a canvas (never a decorative sample pattern),
 * keeps the mandatory quiet zone and a light opaque background so phone cameras can lock on, and offers
 * copy-link and download-PNG with explicit success/error feedback. `board` variant drops the Owner
 * actions for the read-only Display board.
 */
export function ShopQr({ publicId, shopName, origin, variant = 'owner', size = 232 }: {
  publicId: string;
  shopName?: string;
  origin?: string;
  variant?: 'owner' | 'board';
  size?: number;
}) {
  const { t } = useLanguage();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<QrStatus>('idle');
  const [renderFailed, setRenderFailed] = useState(false);
  const url = shopPublicUrl(publicId, origin);
  const shopLabel = shopName?.trim() || t('ร้านนี้', 'this Shop');

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let active = true;
    setStatus('idle');
    QRCode.toCanvas(element, url, {
      width: size,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#1F1812', light: '#FFFDF9' },
    }).then(() => { if (active) setRenderFailed(false); })
      .catch(() => { if (active) setRenderFailed(true); });
    return () => { active = false; };
  }, [url, size]);

  async function copyLink() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else legacyCopy(url);
      setStatus('copied');
    } catch {
      setStatus('copy_failed');
    }
  }

  function downloadPng() {
    const element = canvas.current;
    if (!element) { setRenderFailed(true); return; }
    const link = document.createElement('a');
    link.href = element.toDataURL('image/png');
    link.download = `smartqueue-shop-${publicId}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus('downloaded');
  }

  const feedback = renderFailed
    ? t('สร้างรูป QR ไม่สำเร็จ ลองโหลดหน้าใหม่', 'Could not render the QR image. Reload this page')
    : status === 'copied' ? t('คัดลอกลิงก์แล้ว', 'Link copied')
    : status === 'downloaded' ? t('ดาวน์โหลดรูป QR แล้ว', 'QR image downloaded')
    : status === 'copy_failed' ? t('คัดลอกอัตโนมัติไม่ได้ เลือกลิงก์ด้านล่างแล้วคัดลอกเอง', 'Automatic copy failed — select the link below and copy it')
    : '';

  return <section className={`shop-qr ${variant}`} aria-label={t('QR รับคิวของร้าน', 'Shop join QR')}>
    <div className="shop-qr-frame">
      <canvas ref={canvas} role="img" aria-label={t(`QR เปิดร้าน ${shopLabel} แล้วรับคิว`, `QR to open ${shopLabel} and take a Ticket`)} />
    </div>
    <div className="shop-qr-copy">
      <p className="shop-qr-title">{t('สแกนเพื่อรับคิว', 'Scan to take a Ticket')}</p>
      <p className="shop-qr-hint">{t('ไม่ต้องสมัครสมาชิก', 'No account needed')}</p>
      {variant === 'owner' && <>
        <label className="shop-qr-link-label">
          {t('ลิงก์ร้าน', 'Shop link')}
          <input className="shop-qr-link" readOnly value={url} onFocus={event => event.currentTarget.select()} />
        </label>
        <div className="shop-qr-actions">
          <button type="button" className="outline" onClick={copyLink}>
            {status === 'copied' ? <Check size={20} aria-hidden="true" /> : <Copy size={20} aria-hidden="true" />}
            {status === 'copied' ? t('คัดลอกแล้ว', 'Copied') : t('คัดลอกลิงก์', 'Copy link')}
          </button>
          <button type="button" className="outline" onClick={downloadPng} disabled={renderFailed}>
            <Download size={20} aria-hidden="true" />
            {t('ดาวน์โหลด PNG', 'Download PNG')}
          </button>
        </div>
        <a className="button outline" href={`/board/${publicId}`}>{t('เปิดจอแสดงคิว', 'Open display board')}</a>
      </>}
      <p role="status" aria-live="polite" className={`shop-qr-status ${status}${renderFailed ? ' failed' : ''}`}>{feedback}</p>
    </div>
  </section>;
}

function legacyCopy(text: string) {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('copy_unavailable');
}
