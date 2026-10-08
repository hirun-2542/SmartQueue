import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifiedOwner,ApiClient } from './client.mjs';
async function servingFixture(){
  const {api:owner}=await verifiedOwner();const shop=(await owner.post('/api/shops',{name:'Serving Shop'})).body;
  const services=[];for(const [name,prefix]of[['Cut','A'],['Wash','B']]){const service=(await owner.post(`/api/shops/${shop.id}/services`,{name,prefix,callTimeoutMinutes:10,nearTurnThreshold:2})).body;await owner.post(`/api/queues/${service.queue.id}/open`,{});services.push(service);}
  const guest=new ApiClient();await guest.session();const tickets=[];
  for(let i=0;i<3;i++)tickets.push((await guest.post(`/api/queues/${services[0].queue.id}/tickets`,{requestId:randomUUID(),confirmExtra:true,note:i===0?'Oldest private note':null})).body);
  return {owner,guest,shop,services,tickets};
}
async function consoleSnapshot(owner,shop,queue){const result=await owner.request(`/api/shops/${shop.id}/console?queueId=${queue}`);assert.equal(result.status,200,'Owner console must expose the real Waiting list and held Ticket');return result.body;}

test('FIFO Call Start Complete and Skip enforce lifecycle versions and free the Shop and quota',async()=>{
  const {owner,guest,shop,services,tickets}=await servingFixture();const queue=services[0].queue.id;
  let view=await consoleSnapshot(owner,shop,queue);assert.equal(view.waiting[0].id,tickets[0].ticket.id);
  const call=await owner.post(`/api/queues/${queue}/call`,{version:view.version});assert.equal(call.status,200);assert.equal(call.body.number,'A001');assert.equal(call.body.note,'Oldest private note');
  const customer=await guest.request('/api'+tickets[0].link);assert.equal(customer.body.status,'Called');assert.equal(JSON.stringify(customer.body).includes('Oldest private note'),false);
  const start=await owner.post(`/api/tickets/${call.body.id}/start`,{version:call.body.version});assert.equal(start.status,200);assert.equal(start.body.status,'InService');
  assert.equal((await owner.post(`/api/tickets/${call.body.id}/complete`,{version:call.body.version})).status,409);
  const complete=await owner.post(`/api/tickets/${call.body.id}/complete`,{version:start.body.version});assert.equal(complete.status,200);assert.equal(complete.body.status,'Completed');
  assert.equal((await owner.post(`/api/tickets/${call.body.id}/complete`,{version:complete.body.version})).status,409);
  const extra=await guest.post(`/api/queues/${queue}/tickets`,{requestId:randomUUID(),confirmExtra:true});assert.equal(extra.status,201);assert.equal(extra.body.ticket.number,'A004');
  view=await consoleSnapshot(owner,shop,queue);assert.equal(view.held,null);
  const next=await owner.post(`/api/queues/${queue}/call`,{version:view.version});assert.equal(next.body.number,'A002');
  const skipped=await owner.post(`/api/tickets/${next.body.id}/skip`,{version:next.body.version});assert.equal(skipped.status,200);assert.equal(skipped.body.status,'Skipped');
  assert.equal((await guest.request('/api'+tickets[1].link)).body.status,'Skipped');
});

test('simultaneous Calls across Queues leave one held Ticket while another Shop can serve independently',async()=>{
  const {owner,guest,shop,services}=await servingFixture();await guest.post(`/api/queues/${services[1].queue.id}/tickets`,{requestId:randomUUID()});
  const view=await consoleSnapshot(owner,shop,services[0].queue.id);
  const calls=await Promise.all(services.map(s=>owner.post(`/api/queues/${s.queue.id}/call`,{version:view.version})));
  assert.deepEqual(calls.map(x=>x.status).sort(),[200,409]);
  const current=await consoleSnapshot(owner,shop,services[0].queue.id);assert.equal(current.held.status,'Called');
  const other=(await owner.post('/api/shops',{name:'Independent Shop'})).body;
  const service=(await owner.post(`/api/shops/${other.id}/services`,{name:'Repair',prefix:'R',callTimeoutMinutes:5,nearTurnThreshold:2})).body;await owner.post(`/api/queues/${service.queue.id}/open`,{});await guest.post(`/api/queues/${service.queue.id}/tickets`,{requestId:randomUUID()});
  const otherView=await consoleSnapshot(owner,other,service.queue.id);assert.equal((await owner.post(`/api/queues/${service.queue.id}/call`,{version:otherView.version})).status,200);
});
