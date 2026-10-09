import {useState,type FormEvent} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {LanguageSwitch,useLanguage} from './language';

export function TicketResumePage(){
  const {t}=useLanguage();const navigate=useNavigate();const saved=localStorage.getItem('smartqueue-last-ticket');const valid=saved!==null&&/^\/t\/[A-Za-z0-9_-]{43}$/.test(saved);const [input,setInput]=useState('');const [error,setError]=useState('');
  function open(event:FormEvent){
    event.preventDefault();setError('');
    try{const url=new URL(input.trim(),location.origin);if(url.origin!==location.origin||!/^\/t\/[A-Za-z0-9_-]{43}$/.test(url.pathname))throw new Error();navigate(url.pathname);}
    catch{setError(t('วางลิงก์คิวของ SmartQueue ร้านนี้ให้ครบ หรือใช้เส้นทาง /t/…','Paste a complete Ticket link from this SmartQueue site, or its /t/… path.'));}
  }
  return <main className="phone"><header className="brand-row"><Link className="brand" to="/">SmartQueue</Link><LanguageSwitch/></header><section className="stack-form"><h1>{t('กลับมาดูคิว','Return to your Ticket')}</h1>{valid?<><p>{t('เปิดลิงก์คิวล่าสุดที่อุปกรณ์นี้เคยดู ระบบจะตรวจสถานะและวันหมดอายุอีกครั้ง','Open the last Ticket viewed on this device. Its current state and expiry are checked again.')}</p><Link className="button primary" to={saved}>{t('เปิดคิวของฉัน','Open my Ticket')}</Link></>:<p>{t('แอปบนหน้าจอโฮมอาจไม่ใช้ที่เก็บข้อมูลเดียวกับ Safari วางลิงก์คิวที่คัดลอกไว้ด้านล่าง ไม่ต้องสมัครสมาชิก','The Home Screen app may not share Safari storage. Paste your copied Ticket link below; no account is required.')}</p>}<form className="stack-form" onSubmit={open}><label>{t('ลิงก์คิวที่ได้รับ','Received Ticket link')}<input type="text" inputMode="url" autoComplete="off" required value={input} onChange={event=>setInput(event.target.value)} placeholder="/t/…" aria-invalid={!!error} aria-describedby={error?'ticket-link-error':undefined}/></label>{error&&<p id="ticket-link-error" className="error" role="alert">{error}</p>}<button className="primary" type="submit">{t('เปิดลิงก์คิว','Open Ticket link')}</button></form><Link className="button outline" to="/owner">{t('สำหรับเจ้าของร้าน','For the Owner')}</Link><p className="muted small">{t('ลิงก์คิวคือสิทธิ์เข้าถึงคิว ระบบตรวจลิงก์จริงอีกครั้ง ไม่สามารถค้นหาคิวคนอื่นจากหน้านี้','The link grants access and is checked again by the server. This page cannot discover other Customers’ Tickets.')}</p></section></main>;
}
