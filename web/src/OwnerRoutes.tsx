import { NavLink,Navigate,Route,Routes } from 'react-router-dom';
import { ChartColumn,List,Store } from 'lucide-react';
import { useOwner } from './OwnerState';
import { useLanguage } from './language';
import { OwnerPage } from './OwnerPage';
import { QueuePage } from './QueuePage';
import { DemoBanner } from './DemoBanner';
import { StatisticsPage } from './StatisticsPage';
export function OwnerRoutes(){const {shop}=useOwner();const {t}=useLanguage();return <><DemoBanner/><Routes><Route index element={<Navigate to={shop?'queue':'shop'} replace/>}/><Route path="queue" element={<QueuePage/>}/><Route path="shop" element={<OwnerPage/>}/><Route path="statistics" element={<StatisticsPage/>}/></Routes><nav className="owner-nav" aria-label={t('เมนูหลัก','Main navigation')}><NavLink to="/owner/queue"><List size={24} aria-hidden="true"/>{t('คิว','Queue')}</NavLink><><NavLink to="/owner/statistics"><ChartColumn size={24} aria-hidden="true"/>{t('สถิติ','Statistics')}</NavLink><NavLink to="/owner/shop"><Store size={24} aria-hidden="true"/>{t('ร้าน','Shop')}</NavLink></></nav></>;}
