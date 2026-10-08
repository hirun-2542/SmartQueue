import { api, post } from './api';

export interface PushState { enabled: boolean; publicKey: string | null; ticketId: string }

const DB_NAME = 'smartqueue-push';
const STORE = 'tickets';

/** IndexedDB completes through event handlers, which is the only completion channel it offers. */
function idbRequest<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
  return idbRequest(request);
}

/**
 * Stores the private Ticket link inside the service worker's own storage, keyed by the opaque Ticket id the
 * payload carries. The payload itself never holds the secret, so only a device that opted in can turn a
 * notification back into the correct Ticket link.
 */
export async function rememberTicket(ticketId: string, secret: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve,reject)=>{const transaction=database.transaction(STORE,'readwrite');transaction.objectStore(STORE).put(secret,ticketId);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
  database.close();
}

export async function forgetTicket(ticketId: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve,reject)=>{const transaction=database.transaction(STORE,'readwrite');transaction.objectStore(STORE).delete(ticketId);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
  database.close();
}

async function rememberedTicket(ticketId:string):Promise<string|null>{
  const database=await openDatabase();const value=await idbRequest(database.transaction(STORE,'readonly').objectStore(STORE).get(ticketId));database.close();return typeof value==='string'?value:null;
}

export async function hasLocalPush(ticketId:string):Promise<boolean>{
  const registration=await navigator.serviceWorker.getRegistration('/');
  if(!registration||!await registration.pushManager.getSubscription())return false;
  return (await rememberedTicket(ticketId))!==null;
}

function decodeApplicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/**
 * Turns a real browser permission and a real PushManager subscription into a stored association. Throws
 * 'push_denied' when the user or the browser refuses, and 'push_unavailable' when the server has no VAPID
 * identity; neither case touches the Ticket, so the caller only has to report it.
 */
export async function enablePush(secret: string, language: string): Promise<PushState> {
  // Safari only honours the permission prompt while the user gesture is still current, so it is the first call.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('push_denied');
  const state = await api<PushState>(`/api/t/${secret}/push`);
  if (!state.publicKey) throw new Error('push_unavailable');
  const worker = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  await navigator.serviceWorker.ready;
  const current = await worker.pushManager.getSubscription();
  const subscription = current ?? (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeApplicationServerKey(state.publicKey) }));
  const json = subscription.toJSON();
  const previous=await rememberedTicket(state.ticketId);
  await rememberTicket(state.ticketId,secret);
  try{return await post<PushState>(`/api/t/${secret}/push`, { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, language });}
  catch(failure){if(previous)await rememberTicket(state.ticketId,previous);else await forgetTicket(state.ticketId);throw failure;}
}

/** Withdraws this Ticket only; a shared browser endpoint still serves other active Tickets. */
export async function disablePush(secret: string, ticketId: string): Promise<void> {
  const worker = await navigator.serviceWorker.getRegistration('/');
  const subscription = worker ? await worker.pushManager.getSubscription() : null;
  if (subscription) {
    await post(`/api/t/${secret}/push/remove`, { endpoint: subscription.endpoint });
  }
  await forgetTicket(ticketId);
}
