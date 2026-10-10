import { useEffect,useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { useOwner } from './OwnerState';
import { useLanguage,useErrorText } from './language';
import './statistics.css';
import { DemandCharts } from './DemandCharts';

type StatsRange='current'|'latest7'|'latest30';
interface StatsService { id:string;name:string;prefix:string;archived:boolean }
interface StatsBusinessDay { id:string;queueId:string;serviceId:string;serviceName:string;openedAt:string;closedAt:string|null;issued:number }
interface Statistics {
  shopId:string;range:StatsRange;serviceId:string|null;serviceName:string|null;
  issued:number;completed:number;skipped:number;cancelled:number;dropped:number;pending:number;terminal:number;
  averageWaitSeconds:number|null;waitSampleCount:number;
  averageServiceSeconds:number|null;serviceSampleCount:number;
  skippedRate:number|null;cancelledRate:number|null;
  businessDayCount:number;businessDays:StatsBusinessDay[];services:StatsService[];serverTime:string;
}

const ranges:StatsRange[]=['current','latest7','latest30'];

/**
 * Owner statistics for one Shop: issued Tickets, measured average wait and service durations, and the separate
 * Completed/Skipped/Cancelled/Dropped outcomes over a range of Business day rounds. The range filters by each
 * Service's own Queue rounds, never by calendar date, and the copy says so; an average or rate without a real
 * measurement reads “no data” instead of 0, because a missing measurement is not a zero-minute wait.
 */
export function StatisticsPage(){
  const {shop}=useOwner();const {t,language}=useLanguage();const errorText=useErrorText();
  const [range,setRange]=useState<StatsRange>('latest7');const [serviceId,setServiceId]=useState('');
  const [stats,setStats]=useState<Statistics|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
  const shopId=shop?.id;
  const number=(value:number)=>value.toLocaleString(language==='th'?'th-TH':'en-US');
  const roundName=stats?.serviceName??t('ทุกบริการ','All Services');
  const closedRounds=stats!==null&&stats.businessDays.length>0&&stats.businessDays.every(day=>day.closedAt!==null);
  const scope=stats===null?'':stats.range==='current'
    ? `${roundName} · ${closedRounds?t('รอบเปิดคิวล่าสุด ปิดรอบแล้ว','latest Business day round, already closed'):t('รอบเปิดคิวที่กำลังเปิดอยู่','the Business day round that is open now')}${stats.businessDayCount>1?t(` · ${stats.businessDayCount} รอบ`,` · ${stats.businessDayCount} rounds`):''}`
    : `${roundName} · ${t(`${stats.range==='latest7'?'7':'30'} รอบเปิดคิวล่าสุดของแต่ละบริการ ไม่ใช่วันปฏิทิน`,`the latest ${stats.range==='latest7'?'7':'30'} Business days of each Service — not calendar dates`)}${stats.businessDayCount>0?t(` · รวม ${stats.businessDayCount} รอบ`,` · ${stats.businessDayCount} rounds counted`):''}`;

  useEffect(()=>{setServiceId('');},[shopId]);

  useEffect(()=>{
    if(!shopId){setStats(null);return;}
    let active=true;setLoading(true);setError('');
    api<Statistics>(`/api/shops/${shopId}/statistics?range=${range}${serviceId?`&serviceId=${serviceId}`:''}`)
      .then(value=>{if(active)setStats(value);})
      .catch(failure=>{if(active){setStats(null);setError(errorText(failure));}})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[shopId,range,serviceId,revision]);

  if(!shop)return <><h1>{t('สถิติ','Statistics')}</h1><p>{t('สร้างร้านก่อนดูสถิติ','Create a Shop before reading statistics')}</p><Link className="button primary" to="/owner/shop">{t('สร้างร้าน','Create Shop')}</Link></>;

  const noData=t('ไม่มีข้อมูล','No data');
  const empty=stats!==null&&stats.issued===0;
  return <section className="statistics-page" aria-busy={loading}>
    <h1>{t('สถิติ','Statistics')}</h1>
    <div className="statistics-filters">
    <div className="stats-range" role="tablist" aria-label={t('ช่วงรอบเปิดคิว','Business day range')}>
      {ranges.map(value=><button key={value} type="button" role="tab" aria-selected={range===value} className={range===value?'active':''} onClick={()=>setRange(value)}>{value==='current'?t('รอบล่าสุด','Latest round'):value==='latest7'?t('7 รอบล่าสุด','7 rounds'):t('30 รอบล่าสุด','30 rounds')}</button>)}
    </div>
    <div className="stats-service">
      <label><span>{t('บริการ','Service')}</span>
        <select value={serviceId} onChange={event=>setServiceId(event.target.value)}>
          <option value="">{t('ทุกบริการ','All Services')}</option>
          {shop.services.map(service=><option key={service.id} value={service.id}>{service.archived?t(`${service.name} · เก็บถาวร`,`${service.name} · archived`):service.name}</option>)}
        </select>
      </label>
    </div>
    </div>
    {loading&&stats!==null&&<p className="stats-status" role="status">{t('กำลังอัปเดตสถิติ…','Updating statistics…')}</p>}
    {stats===null&&loading&&<p className="stats-status" role="status">{t('กำลังโหลดสถิติ…','Loading statistics…')}</p>}
    {error&&<div className="stats-error" role="alert"><p className="error">{error}</p><button type="button" className="stats-retry" onClick={()=>setRevision(value=>value+1)}>{t('ลองใหม่','Retry')}</button></div>}
    {stats&&<>
      <div className="statistics-workspace">
      <section className="statistics-summary">
      <div className="stats-hero">
        <strong className="number stats-hero-number">{number(stats.issued)}</strong>
        <p className="stats-hero-scope">{t('คิวที่รับเข้ามา','Tickets issued')} · {scope}</p>
      </div>
      {empty
        ? <p className="stats-empty" role="status">{t('ยังไม่มีคิวในรอบนี้ เลือกช่วงอื่นหรือเปิดคิวรับลูกค้าก่อน','No Tickets in this range yet. Choose another range or open a Queue to accept Customers.')}</p>
        : <dl className="stats-rows">
            <div className="stats-row">
              <dt>{t('เสร็จสิ้น','Completed')}<small>{t('จบงานครบ','finished Tickets')}</small></dt>
              <dd><span className="number stats-value">{number(stats.completed)}</span><span className="stats-unit">{t('คิว','Tickets')}</span></dd>
            </div>
            <div className="stats-row">
              <dt>{t('รอเฉลี่ย','Average wait')}<small>{t('จากรับคิวถึงถูกเรียก','from receiving to being called')}</small></dt>
              <dd>{stats.averageWaitSeconds===null?<span className="stats-missing">{noData}</span>:<><span className="number stats-value">{Math.round(stats.averageWaitSeconds/6)/10}</span><span className="stats-unit">{t('นาที','min')}</span></>}<small className="stats-samples">{t(`วัดจาก ${number(stats.waitSampleCount)} คิว`,`measured on ${number(stats.waitSampleCount)} Tickets`)}</small></dd>
            </div>
            <div className="stats-row">
              <dt>{t('ให้บริการเฉลี่ย','Average service')}<small>{t('จากเริ่มถึงเสร็จ','from start to completion')}</small></dt>
              <dd>{stats.averageServiceSeconds===null?<span className="stats-missing">{noData}</span>:<><span className="number stats-value">{Math.round(stats.averageServiceSeconds/6)/10}</span><span className="stats-unit">{t('นาที','min')}</span></>}<small className="stats-samples">{t(`วัดจาก ${number(stats.serviceSampleCount)} คิว`,`measured on ${number(stats.serviceSampleCount)} Tickets`)}</small></dd>
            </div>
            <div className="stats-row">
              <dt>{t('ข้าม','Skipped')}<small>{t(`${number(stats.skipped)} คิว`,`${number(stats.skipped)} Tickets`)}</small></dt>
              <dd>{stats.skippedRate===null?<span className="stats-missing">{noData}</span>:<><span className="number stats-value">{Math.round(stats.skippedRate*100)}</span><span className="stats-unit">%</span></>}<small className="stats-samples">{t('ของคิวที่จบแล้ว','of finished Tickets')}</small></dd>
            </div>
            <div className="stats-row">
              <dt>{t('ลูกค้ายกเลิก','Cancelled')}<small>{t(`${number(stats.cancelled)} คิว`,`${number(stats.cancelled)} Tickets`)}</small></dt>
              <dd>{stats.cancelledRate===null?<span className="stats-missing">{noData}</span>:<><span className="number stats-value">{Math.round(stats.cancelledRate*100)}</span><span className="stats-unit">%</span></>}<small className="stats-samples">{t('ของคิวที่จบแล้ว','of finished Tickets')}</small></dd>
            </div>
            <div className="stats-row">
              <dt>{t('ร้านปิดคิว','Shop closed')}<small>{t('แยกจากสองข้อบน','kept apart from Skip and Cancel')}</small></dt>
              <dd><span className="number stats-value">{number(stats.dropped)}</span><span className="stats-unit">{t('คิว','Tickets')}</span></dd>
            </div>
          </dl>}
      {!empty&&<p className="stats-note">{stats.pending>0?t(`${number(stats.pending)} คิวยังไม่จบ ไม่อยู่ในตัวหารของอัตรา`,`${number(stats.pending)} Tickets are still open and stay out of the rate denominator`):t('ทุกคิวในรอบนี้จบแล้ว','Every Ticket in this range has finished')}{t(` · อัตราคิดจาก ${number(stats.terminal)} คิวที่จบแล้ว`,` · rates use the ${number(stats.terminal)} finished Tickets`)}</p>}
      <details className="demand-values"><summary>{t('จำนวนคิวแยกตามรอบเปิดคิว','Ticket counts by Business day')}</summary><dl className="stats-rows">{stats.businessDays.map(day=><div className="stats-row" key={day.id}><dt>{day.serviceName}<small>{new Intl.DateTimeFormat(language==='th'?'th-TH':'en-GB',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(day.openedAt))} · {day.closedAt?t('ปิดแล้ว','Closed'):t('ยังเปิดอยู่','Open')}</small></dt><dd><span className="number stats-value">{number(day.issued)}</span><span className="stats-unit">{t('คิว','Tickets')}</span></dd></div>)}</dl></details>
      </section>
      <section className="statistics-demand">
      <DemandCharts shopId={shop.id} range={range} serviceId={serviceId} revision={revision}/>
      <button type="button" className="stats-refresh" onClick={()=>setRevision(value=>value+1)} disabled={loading}>{loading?t('กำลังอัปเดต…','Updating…'):t('อัปเดตสถิติ','Refresh statistics')}</button>
      </section>
      </div>
    </>}
  </section>;
}
