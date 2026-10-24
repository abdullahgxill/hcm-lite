import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import {createRequire} from 'node:module';
const backendRequire=createRequire(new URL('../../../backend/package.json',import.meta.url));
const mongoose=backendRequire('mongoose');
const {MongoMemoryReplSet}=backendRequire('mongodb-memory-server');
const request=backendRequire('supertest');
import expressApp from '../../../backend/src/app.js';
import * as models from '../../../backend/src/models/index.js';
let db, vite, dom, React, createRoot, MemoryRouter, AuthProvider, App, root, api;
const copied = [];
let uiAdminToken;
const pdfDownloads = [];
before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'ui-integration-test-secret-at-least-32-characters';
  db = await MongoMemoryReplSet.create({ replSet: {count: 1}, instanceOpts: [{ args: process.platform === 'win32' ? [] : ['--nounixsocket'] }] });
  process.env.MONGODB_URI = db.getUri('hcm_ui_test');
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all(Object.values(models).map(m => m.init()));
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {url: 'http://localhost:5173'});
  for (const key of ['window','document','HTMLElement','Event','MouseEvent','KeyboardEvent','sessionStorage','navigator'])
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:dom.window[key]});
  Object.defineProperty(navigator,'clipboard',{value:{writeText: async value => copied.push(value)}});
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import('react');
  ({createRoot} = await import('react-dom/client'));
  
  vite = await createServer({root:fileURLToPath(new URL('../..',import.meta.url)),server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,entries:[],include:[]},appType:'custom',ssr:{resolve:{conditions:['import'],externalConditions:['import']}}});
  ({MemoryRouter} = await vite.ssrLoadModule('react-router-dom'));
  ({AuthProvider} = await vite.ssrLoadModule('/src/contexts/AuthContext.jsx'));
  ({default:App} = await vite.ssrLoadModule('/src/App.jsx'));
  ({api} = await vite.ssrLoadModule('/src/services/api.js'));
  // Keep real React forms, Axios interceptors, Express validation and MongoDB.
  // Only HTTP transport is replaced with supertest, so no browser binary is needed.
  api.defaults.adapter = async config => {
    let req = request(expressApp)[config.method || 'get'](`/api${config.url}`);
    for (const [key,value] of Object.entries(config.headers.toJSON())) if(value != null) req.set(key,String(value));
    if(config.data) req = req.send(typeof config.data === 'string' ? JSON.parse(config.data) : config.data);
    if(config.responseType === 'blob') req = req.buffer(true).parse((res,callback)=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>callback(null,Buffer.concat(chunks)));});
    const res = await req;
    const response = {data:config.responseType === 'blob' ? new Blob([res.body]) : res.body,status:res.status,headers:res.headers,config};
    if(res.status >= 400) throw {response,config,isAxiosError:true};
    return response;
  };
}, {timeout:60000});
after(async () => {
  if(root) await React.act(async () => root.unmount());
  await vite?.close(); dom?.window.close(); await mongoose.disconnect(); await db?.stop();
});
async function settle(check, message) {
  for(let i=0;i<150;i++) {
    await React.act(async () => { await new Promise(r=>setTimeout(r,20)); });
    if(check()) return;
  }
  assert.fail(`${message}\n${document.body.textContent}`);
}
async function mount(path='/') {
  if(root) await React.act(async()=>root.unmount());
  root=createRoot(document.getElementById('root'));
  await React.act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(AuthProvider,null,React.createElement(App)))));
}
const input = label => [...document.querySelectorAll('label')].find(e=>e.querySelector('span')?.textContent.replace(/\s*\*\s*$/,'').trim()===label)?.querySelector('input');
async function fill(label,value) {
  const field=input(label); assert.ok(field,`Missing field ${label}`);
  await React.act(async()=>{
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(field,value);
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
  });
}
async function click(text, within=document) {
  const button=[...within.querySelectorAll('button')].find(e=>(e.textContent.trim()===text || e.getAttribute('aria-label')===text));
  assert.ok(button,`Missing button ${text}`);
  await React.act(async()=>button.click());
}
async function submit() { await React.act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))); }
test('real forms: Admin creates HR, copies credentials, resets HR, fresh session logs in and changes password',async()=>{
  const setup=await request(expressApp).post('/api/auth/setup').send({companyName:'UI Verification',name:'Admin',email:'admin@ui.test',password:'AdminSecure123!'});
  assert.equal(setup.status,201,JSON.stringify(setup.body));
  uiAdminToken=setup.body.token;
  sessionStorage.setItem('hcm-token',setup.body.token);
  await mount('/users');
  await settle(()=>document.body.textContent.includes('Company logins'),'Admin users screen');
  await click('Create HR login');
  await fill('HR full name','Sana Ahmed');
  await fill('Work email','hr@ui.test');
  await fill('Temporary password (optional)','FirstTemporary123!');
  await submit();
  await settle(()=>!!input('Login email'),'HR credentials shown');
  assert.equal(input('Login email').value,'hr@ui.test');
  assert.equal(input('Temporary password').value,'FirstTemporary123!');
  await click('Copy password');
  assert.equal(copied.at(-1),'FirstTemporary123!');
  await click('Done');
  await settle(()=>[...document.querySelectorAll('tr')].some(r=>r.textContent.includes('hr@ui.test')),'HR table row');
  const row=[...document.querySelectorAll('tr')].find(r=>r.textContent.includes('hr@ui.test'));
  await click('Reset password',row);
  await fill('New temporary password (optional)','ResetTemporary456!');
  await click('Confirm reset');
  await settle(()=>!!input('Temporary password'),'Reset credentials shown');
  assert.equal(input('Temporary password').value,'ResetTemporary456!');
  let old; await React.act(async () => {old=await request(expressApp).post('/api/auth/login').send({email:'hr@ui.test',password:'FirstTemporary123!'});});
  assert.equal(old.status,401);
  sessionStorage.clear();
  await mount();
  await settle(()=>!!input('Work email'),'Fresh HR login form');
  await fill('Work email','HR@UI.TEST');
  await fill('Password','ResetTemporary456!');
  await click('Show Password');
  assert.equal(input('Password').type,'text');
  await submit();
  await settle(()=>document.body.textContent.includes('Set your own password'),'HR first password page');
  assert.equal(input('Signed-in email').value,'hr@ui.test');
  await fill('Temporary password from HR / Admin','ResetTemporary456!');
  await fill('New password','PersonalSecure789!');
  await fill('Confirm new password','PersonalSecure789!');
  await submit();
  await settle(()=>!document.body.textContent.includes('Set your own password') && document.body.textContent.includes('Sana Ahmed'),'HR workspace after password change');
  await React.act(async()=>root.unmount()); root=null;
  const newLogin=await request(expressApp).post('/api/auth/login').send({email:'  HR@UI.TEST  ',password:'PersonalSecure789!'});
  assert.equal(newLogin.status,200,JSON.stringify(newLogin.body));
  assert.equal(newLogin.body.user.role,'HR');
  assert.equal(newLogin.body.user.mustChangePassword,false);
  // Reset again after the user has changed password, then verify generated credentials.
  const reset=await request(expressApp).patch(`/api/organization/users/${newLogin.body.user.id}`).set('Authorization',`Bearer ${setup.body.token}`).send({reset:true});
  assert.equal(reset.status,200);
  const generated=await request(expressApp).post('/api/auth/login').send({email:'hr@ui.test',password:reset.body.temporaryPassword});
  assert.equal(generated.status,200,JSON.stringify(generated.body));
  assert.equal(generated.body.user.mustChangePassword,true);
},{timeout:30000});

async function server(method,url,token,body,status=200) {
  let res;
  await React.act(async()=>{
    let req=request(expressApp)[method](`/api${url}`);
    if(token)req=req.set('Authorization',`Bearer ${token}`);
    res=await (body ? req.send(body) : req);
  });
  assert.equal(res.status,status,`${method} ${url}: ${JSON.stringify(res.body)}`);
  return res.body;
}
async function asRole(token,path) {
  if(root){await React.act(async()=>root.unmount());root=null;}
  sessionStorage.setItem('hcm-token',token);
  await mount(path);
}
async function textarea(label,value) {
  const field=[...(document.querySelector('[role="dialog"]') || document).querySelectorAll('label')].find(e=>e.querySelector('span')?.textContent.replace(/\s*\*\s*$/,'').trim()===label)?.querySelector('textarea');
  assert.ok(field,`Missing textarea ${label}`);
  await React.act(async()=>{
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(field,value);
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
  });
}
async function choose(label,value) {
  const field=[...(document.querySelector('[role="dialog"]') || document).querySelectorAll('label')].find(e=>e.querySelector('span')?.textContent.replace(/\s*\*\s*$/,'').trim()===label)?.querySelector('select');
  assert.ok(field,`Missing select ${label}`);
  await React.act(async()=>{field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}));});
}
const hasButton=text=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===text);
test('complete real forms: HR employee registration, Employee attendance/leave, HR approval/draft, Admin lock and Employee PDF',async()=>{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const month=today.slice(0,7);
  const future=n=>new Date(Date.parse(`${today}T12:00:00Z`)+n*86400000).toISOString().slice(0,10);
  const company=await server('get','/organization',uiAdminToken);
  await server('put','/organization',uiAdminToken,{...company,departments:['Engineering','Operations'],designations:['Developer','HR Officer'],weekends:[]});
  const hrCreated=await server('post','/organization/users',uiAdminToken,{name:'Workflow HR',email:'workflow.hr@ui.test',temporaryPassword:'WorkflowTemp123!'},201);
  const hrFirst=await server('post','/auth/login',null,{email:hrCreated.user.email,password:hrCreated.temporaryPassword});
  const hr=await server('post','/auth/password',hrFirst.token,{currentPassword:hrCreated.temporaryPassword,newPassword:'WorkflowHRPrivate456!'});
  await asRole(hr.token,'/employees');
  await settle(()=>hasButton('Add employee'),'HR register employee control');
  await click('Add employee');
  await fill('Full name','Ali UI Test');
  await fill('Employee code','UI-EMP-001');
  await fill('Work email','ali.ui@ui.test');
  await fill('Joining date',`${month}-01`);
  await choose('Department','Engineering');
  await choose('Designation','Developer');
  await fill('Monthly basic salary (PKR)','50000');
  await submit();
  await settle(()=>!!input('Temporary password'),'Employee login created by HR form');
  const employeeTemporary=input('Temporary password').value;
  assert.ok(employeeTemporary.length>=10);
  await click('Done');
  await settle(()=>document.body.textContent.includes('UI-EMP-001'),'Registered employee visible in directory');
  const directory=await server('get','/employees',hr.token);
  const employee=directory.items.find(e=>e.code==='UI-EMP-001');
  assert.ok(employee);
  const second=await server('post','/employees',hr.token,{name:'Scope UI Test',code:'UI-EMP-002',email:'scope.ui@ui.test',department:'Operations',designation:'Developer',joiningDate:`${month}-01`,basic:80000},201);
  assert.ok(second.employee);
  if(root){await React.act(async()=>root.unmount());root=null;}
  sessionStorage.clear();
  await mount();
  await settle(()=>!!input('Work email'),'Employee sign-in form');
  await fill('Work email','ali.ui@ui.test');
  await fill('Password',employeeTemporary);
  await submit();
  await settle(()=>!!input('Signed-in email'),'Employee must change temporary password');
  assert.equal(input('Signed-in email').value,'ali.ui@ui.test');
  await fill('Temporary password from HR / Admin',employeeTemporary);
  await fill('New password','EmployeePrivate789!');
  await fill('Confirm new password','EmployeePrivate789!');
  await submit();
  await settle(()=>document.body.textContent.includes('Ali UI Test')&&!document.body.textContent.includes('Set your own password'),'Employee workspace after password change');
  const employeeToken=sessionStorage.getItem('hcm-token');
  await asRole(employeeToken,'/attendance');
  await settle(()=>hasButton('Check in'),'Employee attendance control');
  await click('Check in');
  await settle(()=>hasButton('Check out'),'Employee server-stamped check-in');
  const duplicate=await server('post','/attendance/check-in',employeeToken,{},409);
  assert.match(duplicate.message,/already checked in/);
  await click('Check out');
  await settle(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Check out'&&b.disabled),'Check-out button locks after recording');
  const attendance=await server('get',`/attendance?start=${today}&end=${today}`,employeeToken);
  assert.equal(attendance.length,1);
  assert.equal(attendance[0].status,'half_day');
  assert.ok(attendance[0].checkIn&&attendance[0].checkOut);
  await asRole(employeeToken,'/leave');
  await settle(()=>hasButton('Apply for leave'),'Employee leave screen');
  await click('Apply for leave');
  await choose('Leave type','casual');
  await fill('Start date',future(1));
  await fill('End date',future(2));
  await textarea('Reason','Personal family commitment for workflow verification.');
  await submit();
  await settle(()=>!document.querySelector('[role="dialog"]')&&document.body.textContent.includes('pending'),'Leave application persisted');
  const leaveRequests=await server('get','/leaves',employeeToken);
  assert.equal(leaveRequests.length,1);
  assert.equal(leaveRequests[0].days.length,2);
  await server('post','/leaves',employeeToken,{type:'casual',start:future(1),end:future(2),reason:'Overlap must be refused'},422);
  await asRole(hr.token,'/leave');
  await settle(()=>hasButton('Review'),'HR sees pending leave');
  await click('Review');
  await textarea('Decision comment','Approved for the workflow regression.');
  await click('Approve leave');
  await settle(()=>!document.querySelector('[role="dialog"]')&&document.body.textContent.includes('approved'),'HR leave approval visible');
  const balances=await server('get','/leaves/balance',employeeToken);
  assert.equal(balances.find(b=>b.type==='casual').remaining,8);
  await asRole(hr.token,'/payroll');
  await settle(()=>hasButton('Calculate draft'),'HR payroll draft form');
  await fill('Payroll month',month);
  await click('Calculate draft');
  await settle(()=>!!document.querySelector('[role="dialog"]')&&document.body.textContent.includes('After finalization'),'Payroll review opens with draft');
  const draftRuns=await server('get','/payroll',hr.token);
  const draft=draftRuns.find(p=>p.month===month);
  assert.ok(draft);
  assert.equal(draft.status,'draft');
  assert.equal(draft.lines.length,2);
  assert.equal(draft.lines.find(l=>l.employeeId===employee._id).grossCents,7500000);
  await server('post',`/payroll/${draft._id}/finalize`,hr.token,{revision:draft.revision},403);
  await asRole(uiAdminToken,'/payroll');
  await settle(()=>hasButton('Details'),'Admin payroll review list');
  await click('Details');
  await click('Finalize this month');
  await click('Confirm & lock payroll');
  await settle(()=>document.body.textContent.includes('Locked'),'Admin finalization locks payroll');
  await server('post','/payroll',hr.token,{month},409);
  await asRole(employeeToken,'/payroll');
  await settle(()=>hasButton('Details'),'Employee receives finalized payslip');
  await click('Details');
  assert.ok(document.body.textContent.includes('Ali UI Test'));
  assert.ok(!document.body.textContent.includes('Scope UI Test'));
  URL.createObjectURL=blob=>{pdfDownloads.push(blob);return 'blob:ui-test-payslip';};
  URL.revokeObjectURL=()=>{};
  let downloadedName='';
  window.HTMLAnchorElement.prototype.click=function(){downloadedName=this.download;};
  await click('Download payslip for Ali UI Test');
  await settle(()=>pdfDownloads.length===1,'Employee PDF download completed');
  const bytes=Buffer.from(await pdfDownloads[0].arrayBuffer());
  assert.equal(bytes.subarray(0,4).toString(),'%PDF');
  assert.ok(bytes.length>1000);
  assert.equal(downloadedName,`payslip-UI-EMP-001-${month}.pdf`);
  await server('get',`/payroll/${draft._id}/payslip/${second.employee._id}`,employeeToken,null,403);
  const employeeRuns=await server('get','/payroll',employeeToken);
  assert.equal(employeeRuns[0].lines.length,1);
  assert.equal(employeeRuns[0].lines[0].employeeId,employee._id);
  const notices=await server('get','/notifications',employeeToken);
  assert.ok(notices.some(n=>n.title==='Your payslip is ready'));
  assert.ok(notices.some(n=>/leave/i.test(n.title)));
  await asRole(uiAdminToken,'/audit');
  await settle(()=>document.body.textContent.toLowerCase().includes('finalize'),'Audit shows payroll finalization');
  if(root){await React.act(async()=>root.unmount());root=null;}
},{timeout:45000});
