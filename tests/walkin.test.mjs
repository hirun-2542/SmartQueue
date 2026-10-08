import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifiedOwner,ApiClient } from './client.mjs';

async function shopFixture(){
  const {api:owner}=await verifiedOwner();
  const shop=(await owner.post('/api/shops',{name:'Walk-in Shop'})).body;
  const services=[];
  for(const [name,prefix] of [['Cut','A'],['Wash','B']]){
    const service=(await owner.post(`/api/shops/${shop.id}/services`,{name,prefix,callTimeoutMinutes:10,nearTurnThreshold:2})).body;
    services.push(service);
  }
  return {owner,shop,services};
}
async function consoleView(owner,shop,queue){
  const result=await owner.request(`/api/shops/${shop.id}/console?queueId=${queue}`);
  assert.equal(result.status,200,'Owner console must expose the real Waiting list for Walk-in Tickets');
  return result.body;
}

test('Walk-in Tickets share the Business-day counter and FIFO with Customer Tickets',async()=>{
  const {owner,shop,services}=await shopFixture();const queue=services[0].queue.id;
  await owner.post(`/api/queues/${queue}/open`,{});
  const guest=new ApiClient();await guest.session();
  assert.equal((await guest.post(`/api/queues/${queue}/tickets`,{requestId:randomUUID()})).body.ticket.number,'A001');
  const walkin=await owner.post(`/api/queues/${queue}/walkin`,{note:'Khun Lung — short cut'});
  assert.equal(walkin.status,201);
  assert.equal(walkin.body.ticket.number,'A002');
  assert.equal(walkin.body.ticket.origin,'WalkIn');
  assert.equal(walkin.body.ticket.status,'Waiting');
  assert.equal(walkin.body.ticket.version,1);
  assert.equal(walkin.body.ticket.note,'Khun Lung — short cut');
  assert.equal(walkin.body.ticket.serviceName,'Cut');
  assert.equal(walkin.body.joinedAhead,1);
  assert.equal((await guest.post(`/api/queues/${queue}/tickets`,{requestId:randomUUID(),confirmExtra:true})).body.ticket.number,'A003');
  let view=await consoleView(owner,shop,queue);
  assert.deepEqual(view.waiting.map(x=>x.number),['A001','A002','A003']);
  assert.equal(view.waiting[1].origin,'WalkIn');
  assert.equal(view.waiting[1].note,'Khun Lung — short cut');
  const first=await owner.post(`/api/queues/${queue}/call`,{version:view.version});
  assert.equal(first.body.number,'A001');
  const started=await owner.post(`/api/tickets/${first.body.id}/start`,{version:first.body.version});
  assert.equal(started.body.status,'InService');
  assert.equal((await owner.post(`/api/tickets/${first.body.id}/complete`,{version:started.body.version})).body.status,'Completed');
  view=await consoleView(owner,shop,queue);
  const walkinCall=await owner.post(`/api/queues/${queue}/call`,{version:view.version});
  assert.equal(walkinCall.body.number,'A002');
  assert.equal(walkinCall.body.origin,'WalkIn');
  const walkinStart=await owner.post(`/api/tickets/${walkinCall.body.id}/start`,{version:walkinCall.body.version});
  assert.equal(walkinStart.body.status,'InService');
  const walkinComplete=await owner.post(`/api/tickets/${walkinCall.body.id}/complete`,{version:walkinStart.body.version});
  assert.equal(walkinComplete.body.status,'Completed');
  assert.equal(walkinComplete.body.endReason,'completed');
  view=await consoleView(owner,shop,queue);
  assert.equal((await owner.post(`/api/queues/${queue}/call`,{version:view.version})).body.number,'A003');
});

test('Walk-in Tickets carry no Ticket link or device quota and stay private to the Owner',async()=>{
  const {owner,shop,services}=await shopFixture();const queue=services[0].queue.id;
  await owner.post(`/api/queues/${queue}/open`,{});
  const guest=new ApiClient();await guest.session();
  for(let i=0;i<3;i++)assert.equal((await guest.post(`/api/queues/${queue}/tickets`,{requestId:randomUUID(),confirmExtra:true})).status,201);
  assert.equal((await guest.post(`/api/queues/${queue}/tickets`,{requestId:randomUUID(),confirmExtra:true})).body.code,'device_limit');
  const walkin=await owner.post(`/api/queues/${queue}/walkin`,{note:'No smartphone'});
  assert.equal(walkin.status,201,'Walk-in must not consume the mobile device quota');
  assert.equal(walkin.body.ticket.number,'A004');
  assert.equal('link' in walkin.body,false);
  const serialized=JSON.stringify(walkin.body);
  for(const forbidden of ['link','Link','deviceId','DeviceId','requestId','RequestId'])assert.equal(serialized.includes(forbidden),false,`Walk-in response must not expose ${forbidden}`);
  const publicShop=await guest.request('/api/s/'+shop.publicId);
  assert.equal(publicShop.body.services[0].queue.waitingCount,4,'Walk-in Tickets belong on the public waiting count');
  assert.equal(publicShop.body.services[0].queue.deviceActiveCount,3,'Owner Walk-ins must not change the device quota');
  assert.equal(JSON.stringify(publicShop.body).includes('No smartphone'),false);
  const view=await consoleView(owner,shop,queue);
  assert.equal(view.waiting.at(-1).origin,'WalkIn');
  assert.equal(view.waiting.at(-1).note,'No smartphone');
});

test('Walk-in creation requires an authenticated Owner and an Open Queue',async()=>{
  const {owner,shop,services}=await shopFixture();const queue=services[0].queue.id;
  const anonymous=new ApiClient();await anonymous.session();
  assert.equal((await anonymous.post(`/api/queues/${queue}/walkin`,{note:null})).status,401);
  assert.equal((await owner.post(`/api/queues/${queue}/walkin`,{note:null})).body.code,'queue_closed');
  const {api:other}=await verifiedOwner();
  await owner.post(`/api/queues/${queue}/open`,{});
  assert.equal((await other.post(`/api/queues/${queue}/walkin`,{note:null})).status,404);
  assert.equal((await other.request(`/api/shops/${shop.id}/console`)).status,404);
  assert.equal((await owner.post(`/api/queues/${queue}/walkin`,{note:'x'.repeat(501)})).body.code,'invalid_ticket');
  assert.deepEqual((await consoleView(owner,shop,queue)).waiting,[]);
  const blank=await owner.post(`/api/queues/${queue}/walkin`,{note:'   '});
  assert.equal(blank.status,201);
  assert.equal(blank.body.ticket.note,null);
});

test('Simultaneous Walk-ins allocate unique numbers and enter the same Call FIFO under the Call timeout',async()=>{
  const {owner,shop,services}=await shopFixture();const queue=services[0].queue.id;
  await owner.post(`/api/queues/${queue}/open`,{});
  const issued=await Promise.all(Array.from({length:6},(_,i)=>owner.post(`/api/queues/${queue}/walkin`,{note:i===0?'First walk-in':null})));
  assert.deepEqual(issued.map(x=>x.status),Array(6).fill(201));
  assert.deepEqual(issued.map(x=>x.body.ticket.number).sort(),['A001','A002','A003','A004','A005','A006']);
  assert.equal(new Set(issued.map(x=>x.body.ticket.id)).size,6);
  assert.equal(issued.filter(x=>x.body.ticket.origin==='WalkIn').length,6);
  const guest=new ApiClient();await guest.session();
  assert.equal((await guest.post(`/api/queues/${queue}/tickets`,{requestId:randomUUID()})).body.ticket.number,'A007');
  const view=await consoleView(owner,shop,queue);
  assert.equal(view.waiting.length,7);
  const call=await owner.post(`/api/queues/${queue}/call`,{version:view.version});
  assert.equal(call.body.number,'A001','Oldest Walk-in must be Called before later Tickets');
  assert.equal(call.body.origin,'WalkIn');
  assert.equal(new Date(call.body.deadline).getTime()-new Date(call.body.calledAt).getTime(),600000,'Walk-ins stay under the Service Call timeout');
  const stale=await owner.post(`/api/tickets/${call.body.id}/start`,{version:call.body.version+5});
  assert.equal(stale.status,409);
  assert.equal(stale.body.code,'ticket_changed');
  const skip=await owner.post(`/api/tickets/${call.body.id}/skip`,{version:call.body.version});
  assert.equal(skip.body.status,'Skipped');
  assert.equal(skip.body.endReason,'manual_skip');
  const after=await consoleView(owner,shop,queue);
  assert.equal((await owner.post(`/api/queues/${queue}/call`,{version:after.version})).body.number,'A002');
});
