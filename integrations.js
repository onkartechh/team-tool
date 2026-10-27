const fs=require('node:fs');const path=require('node:path');const {createHash,randomUUID}=require('node:crypto');
const {valid,isTime}=require('./state');const M=require('./integration-model');const {createProviders,IntegrationError}=require('./integration-providers');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=value=>{const h=hash(value);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
function createIntegrations({read,persist,revision,dataDir,env=process.env,fetchImpl=fetch,now=()=>new Date(),startTimers=true}){
 const file=path.join(dataDir,'integrations.json'),providers=createProviders({env,fetchImpl});
 const defaults=()=>({timezone:'Asia/Kolkata',intervalMinutes:5,jira:{enabled:false,jql:env.DERQ_JIRA_JQL||'assignee = currentUser() ORDER BY updated DESC'},slack:{enabled:false,listId:env.DERQ_SLACK_LIST_ID||'',columns:{title:'name',owner:'assignee',due:'due_date',completed:'completed',status:''},statusMap:{}},reminders:{enabled:false,time:'09:00',recipients:[]}});
 let meta=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,settingsVersion:1,settings:defaults(),sources:{},deliveries:[]};
 if(meta.version!==1||!meta.settings||!Array.isArray(meta.deliveries)||!meta.sources)throw Error('Invalid integrations data; restore the integrations file before starting.');
 function saveMeta(){const temporary=file+'.'+randomUUID()+'.tmp',fd=fs.openSync(temporary,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(meta));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temporary,file);const dir=fs.openSync(dataDir,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
 for(const delivery of meta.deliveries)if(delivery.state==='pending'){delivery.state='unknown';delivery.error='The server restarted during delivery. Check Slack before sending again.';}
 meta.seen??={jira:[],slack:[]};saveMeta();const running=new Set(),sending=new Set();let processing=false,contacts=null,contactsUntil=0;
 const tag=()=>'"connections-'+meta.settingsVersion+'"';
 const asDate=()=>new Date(now()),iso=()=>asDate().toISOString();
 function snapshot(){const state=read();return {state,etag:revision(state)};}
 function status(){const configured=providers.configured();return {configured,settings:meta.settings,settingsTag:tag(),sources:meta.sources,deliveries:meta.deliveries.slice(-100).reverse().map(({fingerprint,...row})=>row),running:[...running],counts:{jira:read().tasks.filter(t=>t.externalSource==='jira').length,slack:read().tasks.filter(t=>t.externalSource==='slack').length,conflicts:read().tasks.filter(t=>Object.keys(M.parse(t.externalConflicts)).length).length,queued:meta.deliveries.filter(d=>d.state==='queued').length}};}
 function validateSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['timezone','intervalMinutes','jira','slack','reminders'].includes(k)))throw new IntegrationError('Send only connection settings. Tokens belong in the server environment.');
  const s=structuredClone(value);if(typeof s.timezone!=='string'||s.timezone.length>100)throw new IntegrationError('Choose a valid timezone.');try{new Intl.DateTimeFormat('en',{timeZone:s.timezone});}catch{throw new IntegrationError('Choose a valid timezone.');}
  if(!Number.isInteger(s.intervalMinutes)||s.intervalMinutes<1||s.intervalMinutes>60)throw new IntegrationError('Choose a sync interval between 1 and 60 minutes.');
  if(!s.jira||typeof s.jira.enabled!=='boolean'||typeof s.jira.jql!=='string'||!s.jira.jql.trim()||s.jira.jql.length>2000)throw new IntegrationError('Enter a Jira JQL query, up to 2,000 characters.');
  if(!s.slack||typeof s.slack.enabled!=='boolean'||typeof s.slack.listId!=='string'||(s.slack.listId&&!/^F[A-Z0-9]{5,}$/.test(s.slack.listId))||!s.slack.columns||Object.keys(s.slack.columns).some(k=>!['title','owner','due','completed','status'].includes(k))||Object.values(s.slack.columns).some(v=>typeof v!=='string'||v.length>120)||!s.slack.columns.title)throw new IntegrationError('Choose a valid Slack List ID and column mapping.');
  if(s.slack.statusMap!==undefined&&(!s.slack.statusMap||typeof s.slack.statusMap!=='object'||Array.isArray(s.slack.statusMap)||Object.keys(s.slack.statusMap).length>100||Object.entries(s.slack.statusMap).some(([key,value])=>!key||key.length>120||!['To do','In progress','Blocked','Done'].includes(value))))throw new IntegrationError('Map Slack status aliases to To do, In progress, Blocked or Done.');
  if(s.slack.enabled&&!s.slack.listId)throw new IntegrationError('Enter a Slack List ID before enabling automatic List sync.');
  if(!s.reminders||typeof s.reminders.enabled!=='boolean'||!isTime(s.reminders.time)||!Array.isArray(s.reminders.recipients)||s.reminders.recipients.length>200||s.reminders.recipients.some(id=>typeof id!=='string'||!read().people.some(p=>p.id===id)))throw new IntegrationError('Choose a reminder time and existing team members.');
  if(s.reminders.enabled&&(!providers.configured().slack||!s.reminders.recipients.length))throw new IntegrationError('Configure the Slack bot and select recipients before enabling reminders.');
  if(s.reminders.enabled&&s.reminders.recipients.some(id=>!/^([UW])[A-Z0-9]{6,}$/.test(read().people.find(p=>p.id===id)?.slackUserId||'')))throw new IntegrationError('Map a Slack user ID for every selected reminder recipient.');
  return {timezone:s.timezone,intervalMinutes:s.intervalMinutes,jira:{enabled:s.jira.enabled,jql:s.jira.jql.trim()},slack:{enabled:s.slack.enabled,listId:s.slack.listId,columns:{title:s.slack.columns.title,owner:s.slack.columns.owner||'',due:s.slack.columns.due||'',completed:s.slack.columns.completed||'',status:s.slack.columns.status||''},statusMap:s.slack.statusMap||{}},reminders:{enabled:s.reminders.enabled,time:s.reminders.time,recipients:[...new Set(s.reminders.recipients)]}};
 }
 async function test(source){
  if(!['jira','slack','lists'].includes(source))throw new IntegrationError('Choose Jira, Slack bot or Slack Lists.');
  const identity=await (source==='jira'?providers.jira.test():source==='lists'?providers.slack.testLists():providers.slack.test());
  meta.sources[source]={...(meta.sources[source]||{}),identity,verifiedAt:iso(),error:''};saveMeta();return {identity};
 }
 async function sync(source){
  if(!['jira','slack'].includes(source))throw new IntegrationError('Choose Jira or Slack Lists.');if(running.has(source))throw new IntegrationError('This source is already syncing.',409);
  const settings=structuredClone(meta.settings);running.add(source);meta.sources[source]={...(meta.sources[source]||{}),lastAttempt:iso()};saveMeta();
  try{
   let records;if(source==='jira'){const issues=await providers.jira.issues(settings.jira.jql);records=issues.map(issue=>M.jiraTask(issue,providers.configured().site,read().people,settings.timezone));}
   else{if(!settings.slack.listId)throw new IntegrationError('Choose a Slack List and save its column mapping first.');const identity=await providers.slack.testLists(),items=await providers.slack.items(settings.slack.listId);records=items.map(item=>M.slackTask(item,settings.slack,identity.teamId,read().people,settings.timezone));}
   if(hash(settings[source])!==hash(meta.settings[source])||settings.timezone!==meta.settings.timezone)throw new IntegrationError('The connection settings changed during sync. Run it again with the saved settings.',409);
   // Re-read after provider requests, so edits made while fetching are merged, not overwritten.
   const latest=read(),known=new Set(meta.seen[source]||[]),present=new Set(latest.tasks.map(t=>t.id)),hidden=records.filter(t=>known.has(t.id)&&!present.has(t.id));
   const result=M.applyImports(latest,records.filter(t=>!known.has(t.id)||present.has(t.id)),M.dayAt(asDate(),settings.timezone));if(Buffer.byteLength(JSON.stringify(result.state))>5_000_000)throw new IntegrationError('Sync would exceed the 5 MB workspace limit. Narrow the source query or archive old work before syncing.',422);if(!valid(result.state))throw new IntegrationError('The imported records failed validation. Your workspace was not changed.',422);persist(result.state);meta.seen[source]=[...new Set([...(meta.seen[source]||[]),...records.map(t=>t.id)])];
   meta.sources[source]={...(meta.sources[source]||{}),lastSuccess:iso(),error:'',records:records.length,hidden:hidden.length,created:result.created,updated:result.updated,conflicts:result.conflicts,nextAttempt:new Date(+asDate()+settings.intervalMinutes*60000).toISOString()};saveMeta();return {created:result.created,updated:result.updated,conflicts:result.conflicts,...snapshot()};
  }catch(error){meta.sources[source]={...(meta.sources[source]||{}),error:error instanceof IntegrationError?error.message:'The source returned records that could not be mapped. Check the field mapping.',nextAttempt:new Date(+asDate()+Math.max(error.retryAfter||0,settings.intervalMinutes*60)*1000).toISOString()};saveMeta();throw error instanceof IntegrationError?error:new IntegrationError(meta.sources[source].error,502);}
  finally{running.delete(source);}
 }
 function prune(){const cutoff=+asDate()-90*86400000;meta.deliveries=meta.deliveries.filter(d=>!['sent','failed','cancelled'].includes(d.state)||Date.parse(d.createdAt)>=cutoff);if(meta.deliveries.length>=5000)throw new IntegrationError('The delivery history is full. Export and archive completed history on the server before creating more messages.',409);}
 function queue(input,kind='manual',personId=''){
  if(!input||typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestId)||typeof input.user!=='string'||!/^([UW])[A-Z0-9]{6,}$/.test(input.user)||typeof input.text!=='string'||!input.text.trim()||input.text.length>3000)throw new IntegrationError('Choose a Slack person and enter 1–3,000 characters.');
  if(input.scheduledFor!==undefined&&typeof input.scheduledFor!=='string')throw new IntegrationError('Choose a valid send date and time.');const scheduled=input.scheduledFor?new Date(input.scheduledFor):null;if(scheduled&&Number.isNaN(+scheduled))throw new IntegrationError('Choose a valid send date and time.');
  const fingerprint=hash([input.user,input.text.trim(),scheduled?.toISOString()||'']),prior=meta.deliveries.find(d=>d.id===input.requestId);if(prior){if(prior.fingerprint!==fingerprint)throw new IntegrationError('This request ID belongs to a different message.',409);return prior;}
  if(!providers.configured().slack)throw new IntegrationError('Configure DERQ_SLACK_BOT_TOKEN on the server before sending.',503);
  if(scheduled&&(+scheduled<=+asDate()||+scheduled>+asDate()+30*86400000))throw new IntegrationError('Schedule messages in the next 30 days.');
  prune();const entry={id:input.requestId,fingerprint,user:input.user,text:input.text.trim(),kind,personId,state:'queued',scheduledFor:scheduled?.toISOString()||iso(),createdAt:iso(),attempts:0,error:''};meta.deliveries.push(entry);saveMeta();return entry;
 }
 async function deliver(id){
  const item=meta.deliveries.find(d=>d.id===id);if(!item||item.state!=='queued'||sending.has(id))return item;
  sending.add(id);item.state='pending';item.attempts++;saveMeta();
  try{const receipt=await providers.slack.send(item.user,item.text,uuid(item.id));Object.assign(item,receipt,{state:'sent',sentAt:iso(),error:''});}
  catch(error){if(error.retryAfter&&item.attempts<5){item.state='queued';item.scheduledFor=new Date(+asDate()+error.retryAfter*1000).toISOString();item.error='Slack rate limited this request; queued for a later attempt.';}
   else{item.state=error.ambiguous?'unknown':'failed';item.error=error.ambiguous?'Delivery could not be confirmed. Check Slack before sending again; this request will not be retried.':error instanceof IntegrationError?error.message:'The message could not be sent.';}}
  finally{saveMeta();sending.delete(id);}return item;
 }
 async function processDue(){if(processing)return;processing=true;try{for(const item of meta.deliveries.filter(d=>d.state==='queued'&&Date.parse(d.scheduledFor)<=+asDate()).slice(0,5))await deliver(item.id);}finally{processing=false;}}
 function reminders(){
  const s=meta.settings;if(!s.reminders.enabled||!providers.configured().slack)return;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:s.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(asDate()).map(p=>[p.type,p.value]));const minute=Number(parts.hour)*60+Number(parts.minute),[h,m]=s.reminders.time.split(':').map(Number),delta=minute-h*60-m;if(delta<0||delta>=60)return;
  const state=read(),day=M.dayAt(asDate(),s.timezone);for(const id of s.reminders.recipients){const person=state.people.find(p=>p.id===id);if(!person?.slackUserId)continue;const requestId=uuid(['daily',day,id,person.slackUserId]);if(meta.deliveries.some(d=>d.id===requestId))continue;const text=M.digest(state,person,day);if(text)queue({requestId,user:person.slackUserId,text},'daily',id);}
 }
 async function tick(){
  const jobs=[];for(const source of ['jira','slack'])if(meta.settings[source].enabled&&providers.configured()[source==='slack'?'lists':source]&&!running.has(source)&&(!meta.sources[source]?.nextAttempt||Date.parse(meta.sources[source].nextAttempt)<=+asDate()))jobs.push(sync(source).catch(()=>{}));
  await Promise.allSettled(jobs);try{reminders();await processDue();}catch{}
 }
 async function body(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>24000)throw new IntegrationError('Keep integration requests under 24 KB.',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new IntegrationError('Send a valid JSON request.');}}
 async function route(req,res,url){
  const reply=(code,value)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
  try{
   if(req.method==='GET'&&url==='/api/integrations')return reply(200,status());
   if(req.method==='GET'&&url==='/api/integrations/slack/people'){if(!contacts||contactsUntil<+asDate()){contacts=await providers.slack.users();contactsUntil=+asDate()+300000;}return reply(200,{people:contacts});}
   if(!['POST','PUT'].includes(req.method))return reply(405,{error:'Use POST or PUT for this integration action.'});
   let foreign=req.headers['sec-fetch-site']==='cross-site';if(req.headers.origin){try{foreign=foreign||new URL(req.headers.origin).host!==req.headers.host;}catch{foreign=true;}}if(foreign)return reply(403,{error:'Cross-site integration actions are not allowed.'});
   if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required.'});const input=await body(req);
   if(url==='/api/integrations/settings'&&req.method==='PUT'){if(req.headers['if-match']!==tag())throw new IntegrationError('Connection settings changed. Reload this page before saving.',409);meta.settings=validateSettings(input);meta.settingsVersion++;for(const source of ['jira','slack'])if(meta.sources[source])meta.sources[source].nextAttempt='';saveMeta();return reply(200,status());}
   if(url==='/api/integrations/restore-hidden'){if(!['jira','slack'].includes(input.source))throw new IntegrationError('Choose Jira or Slack Lists.');const present=new Set(read().tasks.map(t=>t.id));meta.seen[input.source]=(meta.seen[input.source]||[]).filter(id=>present.has(id));saveMeta();return reply(200,{restored:true});}
   if(url==='/api/integrations/test')return reply(200,await test(input.source));
   if(url==='/api/integrations/sync')return reply(200,await sync(input.source));
   if(url==='/api/integrations/slack/inspect'){if(!/^F[A-Z0-9]{5,}$/.test(input.listId||''))throw new IntegrationError('Enter the Slack List ID from its link.');return reply(200,await providers.slack.inspect(input.listId));}
   if(url==='/api/integrations/conflicts/resolve'){const state=read();if(req.headers['if-match']!==revision(state))throw new IntegrationError('The workspace changed. Refresh before resolving this conflict.',409);let next;try{next=M.resolveConflict(state,input.taskId,input.field,input.choice);}catch(error){throw new IntegrationError(error.message);}if(!valid(next))throw new IntegrationError('That choice would leave invalid task data. Review the related fields.');persist(next);return reply(200,snapshot());}
   if(url==='/api/integrations/messages'){const entry=queue(input);if(!input.scheduledFor&&entry.state==='queued'&&Date.parse(entry.scheduledFor)<=+asDate())await deliver(entry.id);const {fingerprint,...delivery}=entry;return reply(200,{delivery});}
   if(url==='/api/integrations/messages/cancel'){const entry=meta.deliveries.find(d=>d.id===input.id);if(!entry||entry.state!=='queued')throw new IntegrationError('Only queued messages can be cancelled.',409);entry.state='cancelled';saveMeta();return reply(200,{cancelled:true});}
   if(url==='/api/integrations/reminders/preview'){const person=read().people.find(p=>p.id===input.personId);if(!person)throw new IntegrationError('Choose a team member.');return reply(200,{text:M.digest(read(),person,M.dayAt(asDate(),meta.settings.timezone))||'No due or overdue tasks. No reminder would be sent.'});}
   return reply(404,{error:'Unknown integration action.'});
  }catch(error){return reply(error instanceof IntegrationError?error.status:500,{error:error instanceof IntegrationError?error.message:'The integration action could not finish. Check connection settings and delivery history before retrying.'});}
 }
 let timer,start;if(startTimers){timer=setInterval(()=>tick(),30000);timer.unref();start=setTimeout(()=>tick(),500);start.unref();}
 return {route,status,sync,tick,queue,deliver,processDue,test,settings:()=>structuredClone(meta.settings),stop:()=>{clearInterval(timer);clearTimeout(start);}};
}
module.exports={createIntegrations};
