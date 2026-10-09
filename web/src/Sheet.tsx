import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from './language';
export function Sheet({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  const dialog=useRef<HTMLDialogElement>(null);const {t}=useLanguage();
  const opener=useRef(document.activeElement instanceof HTMLElement?document.activeElement:null);
  useEffect(()=>{const element=dialog.current;if(element&&!element.open)element.showModal();return()=>{element?.close();if(opener.current?.isConnected)opener.current.focus();};},[]);
  return <dialog ref={dialog} className="sheet" onCancel={e=>{e.preventDefault();onClose();}} aria-label={title}><div className="sheet-handle" aria-hidden="true"/><header className="sheet-heading"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label={t('ปิด','Close')}><X aria-hidden="true"/></button></header>{children}</dialog>;
}
