import {useLanguage} from './language';
import {useServerClock} from './useServerClock';

export function ShopTime({serverTime}:{serverTime:string}){
  const {language,t}=useLanguage();const now=useServerClock(serverTime);const text=new Intl.DateTimeFormat(language==='th'?'th-TH':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}).format(new Date(now));
  return <span className="board-clock number" aria-label={t('เวลาของร้าน','Shop time')}>{text}</span>;
}
