import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiFailure } from './api';
type Language = 'th' | 'en';
const LanguageContext = createContext<{language:Language;setLanguage:(v:Language)=>void;t:(th:string,en:string)=>string} | null>(null);
export function LanguageProvider({children}:{children:ReactNode}) {
  const [language,setLanguage] = useState<Language>(localStorage.getItem('smartqueue-language') === 'en' ? 'en' : 'th');
  useEffect(()=>{localStorage.setItem('smartqueue-language',language);document.documentElement.lang=language;},[language]);
  return <LanguageContext.Provider value={{language,setLanguage,t:(th,en)=>language==='th'?th:en}}>{children}</LanguageContext.Provider>;
}
export function useLanguage(){ const value=useContext(LanguageContext);if(!value)throw new Error('LanguageProvider missing');return value; }
export function LanguageSwitch(){const {language,setLanguage}=useLanguage();return <div className="language-switch" aria-label="Language"><button type="button" aria-pressed={language==='th'} onClick={()=>setLanguage('th')}>TH</button><button type="button" aria-pressed={language==='en'} onClick={()=>setLanguage('en')}>EN</button></div>;}
const errors:Record<string,[string,string]>={
  invalid_credentials:['อีเมลหรือรหัสผ่านไม่ถูกต้อง','Email or password is incorrect'],
  email_not_verified:['ยืนยันอีเมลจากกล่องจดหมายก่อนเข้าสู่ระบบ','Verify the email in your inbox before signing in'],
  account_locked:['บัญชีถูกพักชั่วคราว ลองใหม่ภายหลัง','Account temporarily locked. Try again later'],
  invalid_token:['ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว','This link is invalid or has expired'],
  account_required:['กรอกอีเมลและรหัสผ่าน','Enter your email and password'],
  invalid_account:['ตรวจสอบอีเมลและรหัสผ่าน รหัสผ่านอย่างน้อย 8 ตัว รวมตัวพิมพ์ใหญ่ เล็ก ตัวเลขและสัญลักษณ์','Check your email and password. Use at least 8 characters including uppercase, lowercase, a number and a symbol'],
  invalid_csrf:['เซสชันเปลี่ยนไป โหลดหน้าใหม่แล้วลองอีกครั้ง','Your session changed. Reload this page and try again'],
  request_failed:['ไม่สามารถเชื่อมต่อได้ ลองใหม่อีกครั้ง','Unable to connect. Try again'],
  unauthenticated:['เข้าสู่ระบบก่อนดำเนินการ','Sign in to continue'],
  prefix_exists:['ตัวอักษรนำหน้านี้ใช้กับบริการอื่นในร้านแล้ว','This Prefix is already used by another Service in this Shop'],
  invalid_name:['กรอกชื่อที่ไม่ว่างและไม่เกิน 160 ตัวอักษร','Enter a name of up to 160 characters'],
  invalid_service:['ตรวจสอบ Prefix, เวลาเรียกที่มากกว่า 0 และจำนวนคิวที่ไม่ติดลบ','Use a letter Prefix, positive Call timeout and a non-negative notification threshold'],
  not_found:['ไม่พบข้อมูลนี้ หรือคุณไม่มีสิทธิ์เข้าถึง','This resource was not found or is not accessible'],
};
export function useErrorText(){const {t}=useLanguage();return (error:unknown)=>{const code=error instanceof ApiFailure?error.code:'request_failed';const pair=errors[code];return pair?t(pair[0],pair[1]):t('ดำเนินการไม่สำเร็จ โหลดข้อมูลล่าสุดแล้วลองอีกครั้ง','Action could not be completed. Refresh the latest state and try again');};}
