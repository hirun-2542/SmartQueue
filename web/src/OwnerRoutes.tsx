import { NavLink,Navigate,Route,Routes } from 'react-router-dom';
import { List,Store } from 'lucide-react';
import { useOwner } from './OwnerState';
import { useLanguage } from './language';
import { OwnerPage } from './OwnerPage';
import { QueuePage } from './QueuePage';
export function OwnerRoutes(){const {shop}=useOwner();const {t}=useLanguage();return <><Routes><Route index element={<Navigate to={shop?'queue':'shop'} replace/>}/><Route path="queue" element={<QueuePage/>}/><Route path="shop" element={<OwnerPage/>}/></Routes><nav className="owner-nav" aria-label={t('เมนูหลัก','Main navigation')}><NavLink to="/owner/queue"><List size={24} aria-hidden="true"/>{t('คิว','Queue')}</NavLink><NavLink to="/owner/shop"><Store size={24} aria-hidden="true"/>{t('ร้าน','Shop')}</NavLink></nav></>;}
