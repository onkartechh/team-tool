const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {once}=require('node:events');
test('serves assets, persists records across restart, rejects invalid and stale writes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'teamspace-test-'));
 let child;
 async function start(){child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3197',DATA_DIR:dir}});await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Startup failed');})]);}
 async function stop(){const ended=once(child,'exit');child.kill();await ended;}
 const url='http://127.0.0.1:3197';
 try{
 await start();
 for(const [asset,content] of [['/','Derq AI'],['/app.js','/api/state'],['/ids.js','getRandomValues'],['/state.js','TeamspaceState'],['/calendar.js','headerReminders'],['/notepad.js','DerqNotepad'],['/assistant-ui.js','Derq AI'],['/analytics.js','TeamspaceAnalytics'],['/reconcile.js','TeamspaceReconcile'],['/sync.js','TeamspaceSync'],['/offline.js','DerqSync'],['/leadership.js','DerqLeadership'],['/globe.js','TeamGlobe'],['/commands.js','TeamspaceCommands'],['/workspace-ui.js','DerqWorkspace'],['/integrations-ui.js','DerqIntegrations'],['/sw.js','/api/'],['/styles.css',':root']]){const res=await fetch(url+asset);assert.equal(res.status,200);assert.ok((await res.text()).includes(content));}
 assert.equal((await fetch(url+'/derq-logo.png')).status,200);
 assert.equal((await fetch(url+'/missing')).status,404);
 const initial=await fetch(url+'/api/state');const etag=initial.headers.get('etag');assert.deepEqual(await initial.json(),{people:[],tasks:[],activities:[]});
 const data={people:[{id:'p1',name:'Alex',strengths:'Systems thinking',notes:'Existing volume notes',customField:'Keep this legacy field'}],tasks:[{id:'t1',title:'Plan',person:'p1'}],activities:[{id:'a1',title:'Coffee'}]};
 const put=(body,tag=etag)=>fetch(url+'/api/state',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':tag},body:JSON.stringify(body)});
 assert.equal((await put({bad:true})).status,400);
 assert.equal((await put(data)).status,200);
 assert.equal((await put({people:[],tasks:[],activities:[]})).status,409);
 const current=await fetch(url+'/api/state');
 const extended={...data,timeEntries:[{id:'te',person:'p1',task:'t1',title:'Plan',date:'2026-10-24',minutes:'45',note:'Keep history'}],capacityHistory:[{id:'ch',person:'p1',date:'2026-10-24',capacity:'Available'}],notepad:'Prepare for tomorrow\n• Capture an idea 🤖\n<script>This stays plain text</script>',people:data.people.map(p=>({...p,checkin:'2026-10-24',checkinTime:'09:30'})),tasks:data.tasks.map(t=>({...t,createdDate:'2026-10-23',status:'Done',completedDate:'2026-10-24',completedBy:'p1',dependsOn:'[]'})),leaves:[{id:'l1',date:'2026-10-25',person:'p1',name:'Alex'}]};
 assert.equal((await put({...extended,tasks:[{...extended.tasks[0],dependsOn:'["missing"]'}]},current.headers.get('etag'))).status,400);
 assert.equal((await put({...extended,notepad:{text:'Invalid'}},current.headers.get('etag'))).status,400);
 assert.equal((await put({...extended,leaves:[{id:'bad',date:'2026-02-30',person:'p1'}]},current.headers.get('etag'))).status,400);
 assert.equal((await put({...extended,leaves:[...extended.leaves,{id:'duplicate',date:'2026-10-25',person:'p1'}]},current.headers.get('etag'))).status,400);
 assert.equal((await put(extended,current.headers.get('etag'))).status,200);
 await stop();await start();
 const restored=await fetch(url+'/api/state');assert.deepEqual(await restored.json(),extended);
 assert.equal((await put({people:[],tasks:[],activities:[]},restored.headers.get('etag'))).status,200);
 }finally{if(child&&child.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true});}
});
