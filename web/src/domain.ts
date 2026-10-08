export interface QueueInfo { id:string;status:'Open'|'Closing'|'Closed';businessDayId:string|null }
export interface ServiceInfo { id:string;shopId:string;name:string;prefix:string;callTimeoutMinutes:number;nearTurnThreshold:number;archived:boolean;queue:QueueInfo }
export interface ShopInfo { id:string;name:string;publicId:string;version:number;services:ServiceInfo[];serverTime:string }
