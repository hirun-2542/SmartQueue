import {Link} from 'react-router-dom';
import {LanguageSwitch,useLanguage} from './language';

export function TicketResumePage(){
  const {t}=useLanguage();const path=localStorage.getItem('smartqueue-last-ticket');const valid=path!==null&&/^\/t\/[A-Za-z0-9_-]{43}$/.test(path);
  return <main className="phone"><header className="brand-row"><Link className="brand" to="/">SmartQueue</Link><LanguageSwitch/></header><section className="stack-form"><h1>{t('กลับมาดูคิว','Return to your Ticket')}</h1>{valid?<><p>{t('เปิดลิงก์คิวล่าสุดที่อุปกรณ์นี้เคยดู ระบบจะตรวจสถานะและวันหมดอายุอีกครั้ง','Open the last Ticket link viewed on this device. Its current state and expiry are checked again.')}</p><Link className="button primary" to={path}>{t('เปิดคิวของฉัน','Open my Ticket')}</Link></>:<p>{t('ยังไม่มีลิงก์คิวบนอุปกรณ์นี้ สแกน QR ของร้านหรือเปิดลิงก์คิวที่ได้รับ','There is no saved Ticket link on this device. Scan the Shop QR or open your received Ticket link.')}</p>}<Link className="button outline" to="/owner">{t('สำหรับเจ้าของร้าน','For the Owner')}</Link><p className="muted small">{t('ลิงก์คิวคือสิทธิ์เข้าถึงคิว ไม่ต้องสมัครสมาชิก และไม่สามารถเปิดคิวคนอื่นได้จากหน้านี้','The Ticket link grants access without registration. This page cannot discover another Customer’s Ticket.')}</p></section></main>;
}
