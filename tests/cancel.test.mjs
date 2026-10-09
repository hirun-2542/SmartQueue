import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { verifiedOwner, ApiClient } from './client.mjs';

const privateNote = 'Private cancellation note';

async function cancelFixture(count){
  const {api:owner}=await verifiedOwner();
  const shop=(await owner.post('/api/shops',{name:'Cancel Shop'})).body;
  const service=(await owner.post(`/api/shops/${shop.id}/services`,{name:'Cut',prefix:'A',callTimeoutMinutes:10,nearTurnThreshold:2})).body;
  assert.equal((await owner.post(`/api/queues/${service.queue.id}/open`,{})).status,200,'the Owner must open a Business day before the Customer can take a Ticket');
  const guest=new ApiClient();await guest.session();const issued=[];
  for(let i=0;i<count;i++)issued.push((await guest.post(`/api/queues/${service.queue.id}/tickets`,{requestId:randomUUID(),confirmExtra:true,note:i===0?privateNote:null})).body);
  return {owner,guest,shop,queue:service.queue.id,issued};
}

async function consoleSnapshot(owner,shop,queue){
  const result=await owner.request(`/api/shops/${shop.id}/console?queueId=${queue}`);
  assert.equal(result.status,200,'the Owner console must expose the real held Ticket and Waiting list');
  return result.body;
}

test('a bearer Ticket link cancels Waiting and Called Tickets from any device, releases the Shop hold and active quota, and keeps the final result visible',async()=>{
  const {owner,guest,shop,queue,issued}=await cancelFixture(3);
  const other=new ApiClient();await other.session();
  const waiting=await other.post('/api'+issued[0].link+'/cancel',{version:issued[0].ticket.version});
  assert.equal(waiting.status,200);assert.equal(waiting.body.status,'Cancelled');assert.equal(waiting.body.endReason,'cancelled');assert.ok(waiting.body.endedAt,'a cancelled Ticket records its terminal timestamp');
  assert.equal(waiting.body.id,issued[0].ticket.id);assert.equal(JSON.stringify(waiting.body).includes(privateNote),false);
  const final=await guest.request('/api'+issued[0].link);assert.equal(final.status,200);assert.equal(final.body.status,'Cancelled');assert.equal(JSON.stringify(final.body).includes(privateNote),false);
  const publicShop=await guest.request('/api/s/'+shop.publicId);
  assert.equal(publicShop.body.services[0].queue.deviceActiveCount,2,'a terminal Ticket must stop counting as active');
  assert.equal(publicShop.body.services[0].queue.waitingCount,2);
  const replacement=await guest.post(`/api/queues/${queue}/tickets`,{requestId:randomUUID(),confirmExtra:true});
  assert.equal(replacement.status,201,'the freed quota must allow a new Ticket');
  const repeat=await other.post('/api'+issued[0].link+'/cancel',{version:final.body.version});
  assert.equal(repeat.status,409);assert.equal(repeat.body.code,'not_cancellable');
  assert.equal((await guest.request('/api'+issued[0].link)).body.status,'Cancelled','a terminal Ticket must never return to active');
  
  const call=await owner.post(`/api/queues/${queue}/call`, {});
  assert.equal(call.status,200);assert.equal(call.body.id,issued[1].ticket.id);
  assert.equal((await consoleSnapshot(owner,shop,queue)).held.id,call.body.id);
  const called=await other.post('/api'+issued[1].link+'/cancel',{version:call.body.version});
  assert.equal(called.status,200);assert.equal(called.body.status,'Cancelled');assert.ok(called.body.calledAt,'the Ticket was Called before the Customer cancelled it');
  assert.equal((await consoleSnapshot(owner,shop,queue)).held,null,'cancelling a Called Ticket must release the Shop-wide hold');
  
  assert.equal((await owner.post(`/api/queues/${queue}/call`, {})).body.id,issued[2].ticket.id);
});

test('InService and terminal Tickets refuse Cancel with the current snapshot and stay final',async()=>{
  const {owner,guest,shop,queue,issued}=await cancelFixture(1);
  
  const call=await owner.post(`/api/queues/${queue}/call`, {});assert.equal(call.status,200);
  const start=await owner.post(`/api/tickets/${call.body.id}/start`,{version:call.body.version});
  assert.equal(start.status,200);assert.equal(start.body.status,'InService');
  const fresh=await guest.post('/api'+issued[0].link+'/cancel',{version:start.body.version});
  assert.equal(fresh.status,409);assert.equal(fresh.body.code,'not_cancellable');assert.equal(fresh.body.current.status,'InService');
  const stale=await guest.post('/api'+issued[0].link+'/cancel',{version:call.body.version});
  assert.equal(stale.status,409);assert.equal(stale.body.code,'not_cancellable');assert.equal(stale.body.current.status,'InService');
  assert.equal((await guest.request('/api'+issued[0].link)).body.status,'InService','a rejected Cancel must not overwrite InService');
  const complete=await owner.post(`/api/tickets/${call.body.id}/complete`,{version:start.body.version});
  assert.equal(complete.status,200);assert.equal(complete.body.status,'Completed');
  const terminal=await guest.post('/api'+issued[0].link+'/cancel',{version:complete.body.version});
  assert.equal(terminal.status,409);assert.equal(terminal.body.code,'not_cancellable');assert.equal(terminal.body.current.status,'Completed');
  const outcome=await guest.request('/api'+issued[0].link);assert.equal(outcome.status,200);assert.equal(outcome.body.status,'Completed','the Completed result stays visible through the Ticket link');
  assert.equal((await consoleSnapshot(owner,shop,queue)).held,null);
});

test('wrong bearer links and stale versions never touch committed state or expose private details',async()=>{
  const {guest,issued}=await cancelFixture(2);
  const unknown=await guest.post('/api/t/'+'a'.repeat(43)+'/cancel',{version:1});
  assert.equal(unknown.status,404);assert.equal(unknown.body.code,'not_found');
  assert.equal('number' in unknown.body,false);
  const stale=await guest.post('/api'+issued[0].link+'/cancel',{version:issued[0].ticket.version+5});
  assert.equal(stale.status,409);assert.equal(stale.body.code,'ticket_changed');
  assert.equal(stale.body.current.status,'Waiting');assert.equal(stale.body.current.version,issued[0].ticket.version);
  assert.equal((await guest.request('/api'+issued[0].link)).body.status,'Waiting','a stale version must not overwrite the Waiting state');
  assert.equal((await guest.request('/api'+issued[1].link)).body.status,'Waiting','another Ticket link must be untouched');
  const ok=await guest.post('/api'+issued[0].link+'/cancel',{version:issued[0].ticket.version});
  assert.equal(ok.status,200);assert.equal(ok.body.status,'Cancelled');
  const replay=await guest.post('/api'+issued[0].link+'/cancel',{version:ok.body.version});
  assert.equal(replay.status,409);assert.equal(replay.body.code,'not_cancellable');assert.equal(replay.body.current.status,'Cancelled');
  assert.equal(JSON.stringify(replay.body).includes(privateNote),false);
  assert.equal((await guest.request('/api'+issued[1].link)).body.status,'Waiting');
});

test('Cancel racing Call commits exactly one transition, keeps the winner, and leaves no stuck hold',async()=>{
  const {owner,guest,shop,queue,issued}=await cancelFixture(1);
  
  const [call,cancel]=await Promise.all([
    owner.post(`/api/queues/${queue}/call`, {}),
    guest.post('/api'+issued[0].link+'/cancel',{version:issued[0].ticket.version})
  ]);
  assert.deepEqual([call.status,cancel.status].sort(),[200,409],'exactly one of Cancel and Call must commit');
  const after=await guest.request('/api'+issued[0].link);
  if(call.status===200){
    assert.equal(call.body.status,'Called');assert.equal(after.body.status,'Called','the losing stale Cancel must not overwrite the Called Ticket');
    assert.equal(cancel.body.code,'ticket_changed');assert.equal(cancel.body.current.status,'Called');
  }else{
    assert.equal(cancel.body.status,'Cancelled');assert.equal(after.body.status,'Cancelled');
    assert.equal(call.body.current.held,null,'a cancelled Ticket must not leave a held Ticket behind');
  }
  if(after.body.status==='Called'){
    const released=await guest.post('/api'+issued[0].link+'/cancel',{version:after.body.version});
    assert.equal(released.status,200,'after refresh the Customer may still Cancel a Called Ticket');assert.equal(released.body.status,'Cancelled');
  }
  assert.equal((await consoleSnapshot(owner,shop,queue)).held,null);
  const second=await guest.post(`/api/queues/${queue}/tickets`,{requestId:randomUUID(),confirmExtra:true});
  assert.equal(second.status,201,'the Customer may take a new Ticket once the racing Ticket ended');
  
  const next=await owner.post(`/api/queues/${queue}/call`, {});
  assert.equal(next.status,200);assert.equal(next.body.id,second.body.ticket.id);
});
