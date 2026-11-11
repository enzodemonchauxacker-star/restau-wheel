const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync(require('node:path').join(__dirname,'../public/js/meta-consent.js'),'utf8');
function run(saved,href='https://restauwheel.com/',broken=false){
 const scripts=[], cookies=[];let reloads=0;
 const buttons=['denied','granted'].map(value=>({dataset:{choice:value},addEventListener(_,fn){this.click=fn},focus(){}}));
 const panel={setAttribute(){},querySelectorAll(){return buttons},querySelector(){return buttons[0]}};
 const document={head:{appendChild(s){scripts.push(s)}},body:{append(){}},createElement(tag){return tag==='section'?panel:{addEventListener(){}}},set cookie(v){cookies.push(v)}};
 const storage={};if(saved)storage.rw_ads_consent_v1=JSON.stringify(saved);
 const context={document,URL,Date,window:{},location:{href,hostname:'restauwheel.com',reload(){reloads++}},localStorage:{getItem(k){if(broken)throw Error();return storage[k]},setItem(k,v){if(broken)throw Error();storage[k]=v}}};
 vm.runInNewContext(code,context);
 return {scripts,buttons,panel,context,cookies,get reloads(){return reloads}};
}
test('no script before consent; refusal preserves access',()=>{const r=run();assert.equal(r.scripts.length,0);r.buttons[0].click();assert.equal(r.scripts.length,0);assert.equal(r.panel.hidden,true)});
test('accept loads once and queues PageView',()=>{const r=run();r.buttons[1].click();r.buttons[1].click();assert.equal(r.scripts.length,1);assert.equal(r.context.window.fbq.queue[2][1],'PageView')});
test('withdrawal revokes, clears cookies and reloads',()=>{const r=run({value:'granted',at:Date.now()});r.buttons[0].click();assert.equal(r.reloads,1);assert.ok(r.cookies.length);assert.equal(r.context.window.fbq.queue.at(-1)[1],'revoke')});
test('expired consent does not load',()=>assert.equal(run({value:'granted',at:0}).scripts.length,0));
test('URLs with email, tokens or hashes are not sent',()=>{for(const tail of ['?email=x@example.com','?token=secret','#private'])assert.equal(run({value:'granted',at:Date.now()},'https://restauwheel.com/'+tail).scripts.length,0)});
test('storage unavailable fails closed until explicit acceptance',()=>{const r=run(null,undefined,true);assert.equal(r.scripts.length,0);r.buttons[1].click();assert.equal(r.scripts.length,1)});
test('campaign URLs allow attribution after consent only',()=>{const href='https://restauwheel.com/?utm_source=instagram&utm_campaign=france&fbclid=abc123';assert.equal(run(null,href).scripts.length,0);assert.equal(run({value:'granted',at:Date.now()},href).scripts.length,1)});
test('future consent is invalid',()=>assert.equal(run({value:'granted',at:Date.now()+60000}).scripts.length,0));
