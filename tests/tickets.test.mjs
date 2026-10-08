import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifiedOwner, ApiClient } from './client.mjs';

async function queueFixture(){
  const {api:owner}=await verifiedOwner();
  const shop=(await owner.post('/api/shops',{name:'Ticket Shop'})).body;
  const service=(await owner.post(`/api/shops/${shop.id}/services`,{name:'Haircut',prefix:'A',callTimeoutMinutes:10,nearTurnThreshold:2})).body;
  assert.equal((await owner.post(`/api/queues/${service.queue.id}/open`,{})).status,200,'Owner must open a real Business day before taking Tickets');
  return {owner,shop,service};
}

test('anonymous Tickets survive cross-device links and enforce extra-ticket confirmation and quota',async()=>{
  const {owner,shop,service}=await queueFixture();const guest=new ApiClient();await guest.session();
  const requestId=randomUUID();const note='Private customer remark';
  const first=await guest.post(`/api/queues/${service.queue.id}/tickets`,{requestId,note,confirmExtra:false});
  assert.equal(first.status,201);assert.equal(first.body.ticket.number,'A001');assert.equal(first.body.ticket.status,'Waiting');
  const repeat=await guest.post(`/api/queues/${service.queue.id}/tickets`,{requestId,note,confirmExtra:false});
  assert.equal(repeat.body.ticket.id,first.body.ticket.id);assert.equal(repeat.body.link,first.body.link);
  const otherDevice=new ApiClient();await otherDevice.session();
  const linked=await otherDevice.request('/api'+first.body.link);assert.equal(linked.status,200);assert.equal(linked.body.number,'A001');
  assert.equal(JSON.stringify(linked.body).includes(note),false);
  assert.equal((await guest.post(`/api/queues/${service.queue.id}/tickets`,{requestId:randomUUID(),confirmExtra:false})).body.code,'extra_confirmation');
  for(let i=0;i<2;i++)assert.equal((await guest.post(`/api/queues/${service.queue.id}/tickets`,{requestId:randomUUID(),confirmExtra:true})).status,201);
  assert.equal((await guest.post(`/api/queues/${service.queue.id}/tickets`,{requestId:randomUUID(),confirmExtra:true})).body.code,'device_limit');
  const publicShop=await guest.request('/api/s/'+shop.publicId);assert.equal(publicShop.body.services[0].queue.waitingCount,3);assert.equal(JSON.stringify(publicShop.body).includes(note),false);
  const second=(await owner.post(`/api/shops/${shop.id}/services`,{name:'Wash',prefix:'B',callTimeoutMinutes:5,nearTurnThreshold:2})).body;
  assert.equal((await guest.post(`/api/queues/${second.queue.id}/tickets`,{requestId:randomUUID()})).status,409);
  await owner.post(`/api/queues/${second.queue.id}/open`,{});
  const separate=await guest.post(`/api/queues/${second.queue.id}/tickets`,{requestId:randomUUID()});assert.equal(separate.status,201);assert.equal(separate.body.ticket.number,'B001');
});

test('concurrent joins allocate unique numbers and a shared device cannot race past three active Tickets',async()=>{
  const {shop,service}=await queueFixture();const clients=Array.from({length:8},()=>new ApiClient());await Promise.all(clients.map(c=>c.session()));
  const issued=await Promise.all(clients.map(c=>c.post(`/api/queues/${service.queue.id}/tickets`,{requestId:randomUUID()})));
  assert.deepEqual(issued.map(x=>x.status),Array(8).fill(201));
  assert.deepEqual(issued.map(x=>x.body.ticket.number).sort(),['A001','A002','A003','A004','A005','A006','A007','A008']);
  assert.equal(new Set(issued.map(x=>x.body.ticket.id)).size,8);
  const shared=new ApiClient();await shared.session();
  const racing=await Promise.all(Array.from({length:4},()=>shared.post(`/api/queues/${service.queue.id}/tickets`,{requestId:randomUUID(),confirmExtra:true})));
  assert.equal(racing.filter(x=>x.status===201).length,3);assert.equal(racing.filter(x=>x.body.code==='device_limit').length,1);
  const snapshot=await shared.request('/api/s/'+shop.publicId);assert.equal(snapshot.body.services[0].queue.waitingCount,11);
});

test('unknown API resources and malformed Ticket links return safe errors rather than the SPA document',async()=>{
  const guest=new ApiClient();await guest.session();
  const unknown=await guest.request('/api/does-not-exist');
  assert.equal(unknown.status,404);
  assert.equal(unknown.body.code,'not_found');
  const malformed=await guest.request('/api/t/'+encodeURIComponent('ก'.repeat(40)));
  assert.equal(malformed.status,404);
  assert.equal(malformed.body.code,'not_found');
});
