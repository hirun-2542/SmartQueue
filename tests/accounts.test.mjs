import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, emailLink, uniqueEmail, password } from './client.mjs';

test('an Owner cannot sign in before verifying the delivered email and can recover access', async () => {
  const api = new ApiClient();
  await api.session();
  const email = uniqueEmail();
  assert.equal((await api.post('/api/account/register',{email,password,language:'en'})).status,200);
  assert.equal((await api.post('/api/account/login',{email,password})).status,401);
  const verification = await emailLink(email,'verify');
  assert.equal((await api.post('/api/account/verify',{userId:verification.searchParams.get('userId'),code:'invalid-code'})).status,400);
  assert.equal((await api.post('/api/account/verify',{userId:verification.searchParams.get('userId'),code:verification.searchParams.get('code')})).status,200);
  assert.equal((await api.post('/api/account/login',{email,password})).status,200);
  const session = await api.session();
  assert.equal(session.owner.email,email);
  assert.equal((await api.post('/api/account/logout',{})).status,200);
  assert.equal((await api.session()).owner,null);
  assert.equal((await api.post('/api/account/forgot-password',{email,language:'en'})).status,200);
  const reset = await emailLink(email,'reset');
  assert.equal((await api.post('/api/account/reset-password',{email,code:reset.searchParams.get('code'),password:'ChangedQueuePass123!'})).status,200);
  assert.equal((await api.post('/api/account/login',{email,password})).status,401);
  assert.equal((await api.post('/api/account/login',{email,password:'ChangedQueuePass123!'})).status,200);
});
