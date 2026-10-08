import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedOwner, ApiClient } from './client.mjs';

test('Owners can manage multiple Shops and Services without accessing another Owner data', async () => {
  const {api:a}=await verifiedOwner();const {api:b}=await verifiedOwner();
  const first=await a.post('/api/shops',{name:'Barber One'});
  assert.equal(first.status,201,'creating a Shop must persist and return the owned Shop');
  const second=await a.post('/api/shops',{name:'Barber Two'});assert.equal(second.status,201);
  const listing=await a.request('/api/shops');assert.equal(listing.status,200);assert.equal(listing.body.length,2);
  assert.equal((await b.request('/api/shops/'+first.body.id)).status,404);
  assert.equal((await b.post('/api/shops/'+first.body.id+'/services',{name:'Haircut',prefix:'A',callTimeoutMinutes:10,nearTurnThreshold:2})).status,404);
  const service=await a.post('/api/shops/'+first.body.id+'/services',{name:'Haircut',prefix:'A',callTimeoutMinutes:10,nearTurnThreshold:2});
  assert.equal(service.status,201);assert.equal(service.body.queue.status,'Closed');
  assert.equal((await a.post('/api/shops/'+first.body.id+'/services',{name:'Duplicate',prefix:'a',callTimeoutMinutes:10,nearTurnThreshold:2})).status,409);
  assert.equal((await a.request('/api/services/'+service.body.id,{method:'PUT',body:{name:'Haircut Updated',prefix:'A',callTimeoutMinutes:0,nearTurnThreshold:2}})).status,400);
  const updated=await a.request('/api/services/'+service.body.id,{method:'PUT',body:{name:'Haircut Updated',prefix:'O',callTimeoutMinutes:5,nearTurnThreshold:1}});
  assert.equal(updated.status,200);assert.equal(updated.body.prefix,'O');assert.equal(updated.body.callTimeoutMinutes,5);
  const refreshed=await a.request('/api/shops/'+first.body.id);assert.equal(refreshed.body.services[0].name,'Haircut Updated');
  const guest=new ApiClient();await guest.session();assert.equal((await guest.request('/api/shops')).status,401);
});
