import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Mail } from 'lucide-react';
import { post, type Owner } from './api';
import { LanguageSwitch, useErrorText, useLanguage } from './language';

export function AccountPage({mode,onSignedIn}:{mode:'login'|'register'|'forgot'|'reset'|'verify';onSignedIn:()=>Promise<void>}) {
  const {language,t}=useLanguage();const errorText=useErrorText();const navigate=useNavigate();const [params]=useSearchParams();
  const [email,setEmail]=useState(params.get('email')??'');const [password,setPassword]=useState('');const [pending,setPending]=useState(false);const [error,setError]=useState('');const [done,setDone]=useState(false);
  const titles={login:t('ให้ลูกค้ารับคิวเอง','Let customers take their own ticket'),register:t('สร้างบัญชีเจ้าของร้าน','Create your Owner account'),forgot:t('กลับเข้าใช้งานอีกครั้ง','Get back to your Shop'),reset:t('ตั้งรหัสผ่านใหม่','Set a new password'),verify:t('ยืนยันอีเมลของคุณ','Verify your email')};
  const buttons={login:t('เข้าสู่ระบบ','Sign in'),register:t('สมัครเจ้าของร้าน','Create account'),forgot:t('ส่งลิงก์ตั้งรหัสผ่าน','Send reset link'),reset:t('บันทึกรหัสผ่านใหม่','Save new password'),verify:t('ยืนยันอีเมล','Verify email')};
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setPending(true);setError('');
    try {
      if(mode==='verify') await post('/api/account/verify',{userId:params.get('userId'),code:params.get('code')});
      else if(mode==='reset') await post('/api/account/reset-password',{email,password,code:params.get('code')});
      else await post(`/api/account/${mode==='forgot'?'forgot-password':mode}`,{email,password,language});
      if(mode==='login'){await onSignedIn();navigate('/owner');}else setDone(true);
    }catch(failure){setError(errorText(failure));}finally{setPending(false);}
  }
  return <main className="phone auth-page"><header className="brand-row"><span className="brand-stub" aria-hidden="true"/><Link className="wordmark" to="/">SmartQueue</Link><LanguageSwitch/></header>
    <h1>{titles[mode]}</h1><p className="intro">{mode==='login'?t('คุณโฟกัสที่งานตรงหน้า จัดการคิวจากมือถือเครื่องเดียว','Focus on the work in front of you. Manage your Queue from one phone'):mode==='register'?t('สมัครแล้วเปิดอีเมลยืนยันก่อนเริ่มใช้งาน','Verify your email after registration before getting started'):mode==='verify'?t('เปิดจากลิงก์ในอีเมล แล้วกดยืนยันด้านล่าง','Opened from your email? Confirm below'):t('เราจะช่วยให้คุณกลับเข้าร้านอย่างปลอดภัย','Recover access to your Shop securely')}</p>
    {done?<section className="account-result" role="status">{mode==='register'||mode==='forgot'?<Mail size={32} aria-hidden="true"/>:<Check size={32} aria-hidden="true"/>}<h2>{mode==='register'||mode==='forgot'?t('ตรวจสอบกล่องจดหมาย','Check your inbox'):t('เรียบร้อยแล้ว','You are all set')}</h2><p>{mode==='register'?t('เปิดลิงก์ยืนยันในอีเมล แล้วกลับมาเข้าสู่ระบบ','Open the verification link in your email, then sign in'):mode==='forgot'?t('หากอีเมลนี้มีบัญชีที่ยืนยันแล้ว คุณจะได้รับลิงก์ตั้งรหัสผ่านใหม่','If this email has a verified account, you will receive a reset link'):t('คุณสามารถเข้าสู่ระบบได้แล้ว','You can now sign in')}</p><Link className="button primary" to="/">{t('เข้าสู่ระบบ','Sign in')}</Link></section>:
    <form onSubmit={submit} className="stack-form">{mode!=='verify'&&<label>{t('อีเมล','Email')}<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} disabled={pending}/></label>}
      {['login','register','reset'].includes(mode)&&<label>{t('รหัสผ่าน','Password')}<input required type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?undefined:8} value={password} onChange={e=>setPassword(e.target.value)} disabled={pending}/>{mode!=='login'&&<small>{t('อย่างน้อย 8 ตัว รวมตัวพิมพ์ใหญ่ เล็ก ตัวเลข และสัญลักษณ์','At least 8 characters with uppercase, lowercase, a number and a symbol')}</small>}</label>}
      {mode==='login'&&<Link className="text-action align-end" to="/account/forgot">{t('ลืมรหัสผ่าน?','Forgot password?')}</Link>}
      {error&&<p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={pending}>{pending?t('กำลังดำเนินการ…','Working…'):buttons[mode]}</button>
      {mode==='login'?<Link className="text-action centered" to="/account/register">{t('ยังไม่มีบัญชี? สมัครเจ้าของร้าน','New here? Create your Owner account')}</Link>:<Link className="text-action centered" to="/">{t('กลับไปเข้าสู่ระบบ','Back to sign in')}</Link>}
    </form>}
  </main>;
}

export function AccountOverview({owner,onSignedOut}:{owner:Owner|null;onSignedOut:()=>Promise<void>}){
  const {t}=useLanguage();const errorText=useErrorText();const [pending,setPending]=useState(false);const [error,setError]=useState('');
  if(!owner)return <Navigate to="/" replace/>;
  async function logout(){setPending(true);try{await post('/api/account/logout',{});await onSignedOut();}catch(failure){setError(errorText(failure));}finally{setPending(false);}}
  return <main className="phone"><header className="brand-row"><span className="brand-stub" aria-hidden="true"/><span className="wordmark">SmartQueue</span><LanguageSwitch/></header><h1>{t('บัญชีเจ้าของร้าน','Owner account')}</h1><p>{owner.email}</p><p className="status-word"><Check size={20} aria-hidden="true"/>{t('ยืนยันอีเมลแล้ว','Email verified')}</p>{error&&<p className="error" role="alert">{error}</p>}<button type="button" onClick={logout} disabled={pending} className="outline">{t('ออกจากระบบ','Sign out')}</button></main>;
}
