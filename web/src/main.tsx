import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { session, type Session } from './api';
import { AccountPage, AccountOverview } from './AccountPages';
import { LanguageProvider, useLanguage } from './language';
import './styles.css';

function App(){
  const {t}=useLanguage();const [current,setCurrent]=useState<Session|null>(null);const [failed,setFailed]=useState(false);
  async function refresh(){setCurrent(await session());}
  useEffect(()=>{let active=true;session().then(v=>{if(active)setCurrent(v)}).catch(()=>{if(active)setFailed(true)});return()=>{active=false};},[]);
  if(!current)return <main className="phone"><h1>SmartQueue</h1><p role="status">{failed?t('เชื่อมต่อไม่ได้ โหลดหน้าใหม่เพื่อลองอีกครั้ง','Unable to connect. Reload this page to retry'):t('กำลังเชื่อมต่อ…','Connecting…')}</p></main>;
  return <Routes><Route path="/" element={current.owner?<AccountOverview owner={current.owner} onSignedOut={refresh}/>:<AccountPage mode="login" onSignedIn={refresh}/>}/><Route path="/owner/*" element={<AccountOverview owner={current.owner} onSignedOut={refresh}/>}/>{(['register','forgot','reset','verify'] as const).map(mode=><Route key={mode} path={`/account/${mode}`} element={<AccountPage key={mode} mode={mode} onSignedIn={refresh}/>}/>)}</Routes>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><LanguageProvider><BrowserRouter><App/></BrowserRouter></LanguageProvider></StrictMode>);
