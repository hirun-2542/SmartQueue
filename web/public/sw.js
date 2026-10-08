// SmartQueue service worker: it delivers the optional Web Push notifications a Customer opted into and
// opens the correct private Ticket link when one is tapped. The payload it receives never contains the
// Ticket link secret, a Customer note or anything about the Owner, so the link is resolved from the
// device's own IndexedDB, written at opt-in time. A ticket ends by removing its association on the
// server, which is what stops these notifications; the worker only ever reports what it was sent.
const DATABASE = 'smartqueue-push';
const STORE = 'tickets';

const copy = {
  near_turn: { th: number => `ใกล้ถึงคิวแล้ว · ${number}`, en: number => `Almost your turn · ${number}` },
  called: { th: number => `ถึงคิวคุณแล้ว · ${number}`, en: number => `Your turn · ${number}` },
  dropped: { th: number => `ร้านปิดคิวนี้แล้ว · ${number}`, en: number => `The Shop dropped this Queue · ${number}` },
};

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  event.waitUntil(deliver(event));
});

async function deliver(event) {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (!payload || !payload.ticketId || !payload.event) return;
  const secret = await readTicket(payload.ticketId);
  if (!secret) return;
  const language = payload.language === 'en' ? 'en' : 'th';
  const body = (copy[payload.event] || copy.called)[language](payload.number || '');
  await self.registration.showNotification('SmartQueue', {
    body,
    tag: `smartqueue-${payload.ticketId}`,
    renotify: true,
    lang: language,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-192.png',
    data: { url: `/t/${secret}` },
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : '/', self.location.origin).href;
  event.waitUntil(openTicket(url));
});

async function openTicket(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (client.url === url && 'focus' in client) return client.focus();
  }
  return self.clients.openWindow(url);
}

function readTicket(ticketId) {
  return new Promise(resolve => {
    const open = indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE); };
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const request = open.result.transaction(STORE, 'readonly').objectStore(STORE).get(ticketId);
      request.onsuccess = () => { resolve(request.result || null); open.result.close(); };
      request.onerror = () => { resolve(null); open.result.close(); };
    };
  });
}
