import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ApiClient,verifiedOwner} from './client.mjs';

async function demo(){const api=new ApiClient();await api.session();const result=await api.post('/api/demo/session',{});assert.equal(result.status,201);await api.session();const shop=(await api.request('/api/shops')).body[0];return {api,shop,service:shop.services.find(s=>s.prefix==='A')};}

test('a demo Customer simulation uses the normal FIFO, intent replay, quota and private Ticket link',async()=>{
  const {api,shop,service}=await demo();const context=await api.request('/api/demo/context');assert.equal(context.status,200);assert.equal(context.body.shopId,shop.id);
  const intent={requestId:randomUUID(),note:'Simulator private note',confirmExtra:false};
  const [first,replay]=await Promise.all([api.post(`/api/demo/queues/${service.queue.id}/tickets`,intent),api.post(`/api/demo/queues/${service.queue.id}/tickets`,intent)]);
  assert.deepEqual([first.status,replay.status].sort(),[200,201]);assert.equal(first.body.ticket.id,replay.body.ticket.id);assert.equal(first.body.link,replay.body.link);assert.equal(first.body.ticket.number,'A003');
  const privateView=await api.request('/api'+first.body.link);assert.equal(privateView.status,200);assert.equal(privateView.body.status,'Waiting');assert.equal(JSON.stringify(privateView.body).includes('Simulator private note'),false);
  const console=(await api.request(`/api/shops/${shop.id}/console?queueId=${service.queue.id}`)).body;assert.equal(console.waiting.at(-1).origin,'Customer');assert.equal(console.waiting.at(-1).note,'Simulator private note');assert.equal(console.waiting.length,3);
  const board=(await api.request(`/api/board/${shop.publicId}`)).body;assert.equal(board.services.find(s=>s.prefix==='A').waiting.at(-1),'A003');assert.equal(JSON.stringify(board).includes('Simulator private note'),false);
  const extra=await api.post(`/api/demo/queues/${service.queue.id}/tickets`,{requestId:randomUUID()});assert.equal(extra.status,409);assert.equal(extra.body.code,'extra_confirmation');
  for(let i=0;i<2;i++)assert.equal((await api.post(`/api/demo/queues/${service.queue.id}/tickets`,{requestId:randomUUID(),confirmExtra:true})).status,201);
  const over=await api.post(`/api/demo/queues/${service.queue.id}/tickets`,{requestId:randomUUID(),confirmExtra:true});assert.equal(over.status,409);assert.equal(over.body.code,'device_limit');
  const issuedReplay=await api.post(`/api/demo/queues/${service.queue.id}/tickets`,intent);assert.equal(issuedReplay.status,200);assert.equal(issuedReplay.body.ticket.id,first.body.ticket.id);
});

test('simulation cannot mutate another demo session or any real Shop',async()=>{
  const first=await demo();const second=await demo();const {api:real}=await verifiedOwner();const realShop=(await real.post('/api/shops',{name:'Real simulator isolation'})).body;const realService=(await real.post(`/api/shops/${realShop.id}/services`,{name:'Repair',prefix:'R',callTimeoutMinutes:10,nearTurnThreshold:2})).body;await real.post(`/api/queues/${realService.queue.id}/open`,{});
  for(const queueId of [second.service.queue.id,realService.queue.id])assert.equal((await first.api.post(`/api/demo/queues/${queueId}/tickets`,{requestId:randomUUID()})).status,404);
  assert.equal((await real.post(`/api/demo/queues/${realService.queue.id}/tickets`,{requestId:randomUUID()})).status,403);
  const anonymous=new ApiClient();await anonymous.session();assert.equal((await anonymous.post(`/api/demo/queues/${first.service.queue.id}/tickets`,{requestId:randomUUID()})).status,401);
  assert.equal((await second.api.request(`/api/shops/${second.shop.id}/console?queueId=${second.service.queue.id}`)).body.waiting.length,2);
  assert.equal((await real.request(`/api/shops/${realShop.id}/console?queueId=${realService.queue.id}`)).body.waiting.length,0);
});
