import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { ChevronDown, UserRound } from 'lucide-react';
import { api, post, type Owner } from './api';
import type { ShopInfo } from './domain';
import { LanguageSwitch, useErrorText, useLanguage } from './language';
import { Sheet } from './Sheet';
interface Scope { shops:ShopInfo[];shop:ShopInfo|null;select:(id:string)=>void;reload:(selectId?:string)=>Promise<void> }
const OwnerScope=createContext<Scope|null>(null);
export function useOwner(){const value=useContext(OwnerScope);if(!value)throw new Error('Owner scope missing');return value;}
export function OwnerProvider({owner,onSignedOut,children}:{owner:Owner|null;onSignedOut:()=>Promise<void>;children:ReactNode}){
  const {t}=useLanguage();const errorText=useErrorText();const [shops,setShops]=useState<ShopInfo[]>([]);const [selected,setSelected]=useState(localStorage.getItem('smartqueue-shop')??'');const [loaded,setLoaded]=useState(false);const [error,setError]=useState('');const [account,setAccount]=useState(false);const [pending,setPending]=useState(false);
  async function reload(selectId?:string){const values=await api<ShopInfo[]>('/api/shops');setShops(values);if(selectId){setSelected(selectId);localStorage.setItem('smartqueue-shop',selectId);}setLoaded(true);}
  useEffect(()=>{let active=true;if(owner)api<ShopInfo[]>('/api/shops').then(v=>{if(active){setShops(v);setLoaded(true);}}).catch(f=>{if(active)setError(errorText(f));});return()=>{active=false};},[owner?.id]);
  const shop=shops.find(x=>x.id===selected)??shops[0]??null;
  function select(id:string){setSelected(id);localStorage.setItem('smartqueue-shop',id);}
  async function logout(){setPending(true);try{await post('/api/account/logout',{});await onSignedOut();}catch(f){setError(errorText(f));}finally{setPending(false);}}
  if(!owner)return <Navigate to="/" replace/>;
  return <OwnerScope.Provider value={{shops,shop,select,reload}}><main className="phone owner-phone"><header className="owner-header"><div className="shop-select"><select aria-label={t('เลือกร้าน','Shop')} value={shop?.id??''} onChange={e=>select(e.target.value)}><option value="" disabled>{t('ร้านของคุณ','Your Shops')}</option>{shops.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select><ChevronDown size={20} aria-hidden="true"/></div><LanguageSwitch/><button type="button" className="icon-button account-button" onClick={()=>setAccount(true)} aria-label={t('บัญชีเจ้าของร้าน','Owner account')}><UserRound size={24} aria-hidden="true"/></button></header>{error?<p className="error" role="alert">{error}</p>:!loaded?<p role="status">{t('กำลังโหลดร้าน…','Loading Shops…')}</p>:children}</main>{account&&<Sheet title={t('บัญชีเจ้าของร้าน','Owner account')} onClose={()=>setAccount(false)}><p>{owner.email}</p><p className="status-word">{t('ยืนยันอีเมลแล้ว','Email verified')}</p><button className="outline" disabled={pending} onClick={logout}>{t('ออกจากระบบ','Sign out')}</button></Sheet>}</OwnerScope.Provider>;
}
