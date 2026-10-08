import type { TicketStatus } from './ticketTypes';
export interface OwnerTicket {id:string;queueId:string;number:string;status:TicketStatus;version:number;serviceName:string;note:string|null;origin:'Customer'|'WalkIn';receivedAt:string;calledAt:string|null;startedAt:string|null;endedAt:string|null;deadline:string|null;endReason:string|null;serverTime:string}
export interface ConsoleQueue {id:string;serviceId:string;name:string;prefix:string;status:'Open'|'Closing'|'Closed';waitingCount:number}
export interface ConsoleSnapshot {shopId:string;version:number;selectedQueueId:string|null;queues:ConsoleQueue[];held:OwnerTicket|null;waiting:OwnerTicket[];serverTime:string}
