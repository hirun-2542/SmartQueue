import { useLanguage } from './language';
import './estimates.css';

/**
 * Estimated wait for a Waiting Ticket or a Shop Service row.
 *
 * `ticketsAhead` is the only value that is always shown. `estimatedWaitSeconds` is null whenever the
 * Service has fewer than five usable Completed jobs, and then the component states that the time is
 * unknown instead of inventing a zero-minute average. When a time is shown it is always labelled as an
 * approximation. Zero Tickets ahead means next in this Queue; it is never presented as "served now"
 * because the Owner may be holding a Ticket from another Queue.
 */
export function EstimatedWait({ ticketsAhead, estimatedWaitSeconds, sampleCount }: { ticketsAhead: number; estimatedWaitSeconds: number | null; sampleCount: number }) {
  const { t } = useLanguage();
  if (ticketsAhead <= 0) return <section className="wait-estimate next-in-queue" role="status">
    <p className="estimate-value">{t('คุณอยู่ลำดับถัดไปในคิวนี้', 'You are next in this Queue')}</p>
    <p className="estimate-note">{t('ยังไม่รับประกันว่าเจ้าของร้านจะว่างทันที เพราะอาจให้บริการคิวจากบริการอื่นอยู่', 'Not a promise of immediate service: the Owner may be serving a Ticket from another Service')}</p>
  </section>;
  if (estimatedWaitSeconds === null) return <section className="wait-estimate unknown-history" role="status">
    <p className="estimate-value">{t('ยังประเมินเวลาไม่ได้', 'Wait time is not estimated yet')}</p>
    <p className="estimate-note">{t(`(ต้องมีงานที่ให้บริการเสร็จอย่างน้อย 5 งาน ตอนนี้ ${sampleCount} งาน)`, `(Needs at least 5 Completed jobs; ${sampleCount} so far)`)}</p>
  </section>;
  return <section className="wait-estimate" role="status">
    <p className="estimate-value">{duration(t, estimatedWaitSeconds)}</p>
    <p className="estimate-note">{t('(ประมาณการจากเวลาให้บริการล่าสุด)', '(Estimated from recent service durations)')}</p>
  </section>;
}

function duration(t: (th: string, en: string) => string, seconds: number) {
  if (seconds < 60) return t('ประมาณไม่ถึง 1 นาที', 'About less than a minute');
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return t(`ประมาณ ${minutes} นาที`, `About ${minutes} minutes`);
  const hours = Math.round(minutes / 6) / 10;
  return t(`ประมาณ ${hours} ชั่วโมง`, `About ${hours} hours`);
}
