const {createHash}=require('node:crypto');
const {isDay}=require('./state');
const A=require('./analytics');
const fields=['title','person','date','due','priority','status','completedDate'];
const parse=(value,fallback={})=>{try{return JSON.parse(value||'');}catch{return fallback;}};
function dayAt(value,timezone='Asia/Kolkata'){
 const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;
}
const unique=items=>items.length===1?items[0]:undefined;
const identifier=(source,scope,id)=>source+'-'+createHash('sha256').update(JSON.stringify([scope,id])).digest('hex').slice(0,28);
function status(value,category=''){
 const text=String(value||'').toLowerCase();if(category==='done')return 'Done';if(/block|imped|on hold/.test(text))return 'Blocked';
 if(category==='done'||/^(done|complete|completed|closed|resolved)$/.test(text))return 'Done';
 if(category==='indeterminate'||/progress|doing|review|testing/.test(text))return 'In progress';return 'To do';
}
function jiraTask(issue,site,people,timezone){
 const f=issue.fields||{},assignee=f.assignee,accounts=people.filter(p=>p.jiraAccountId&&p.jiraAccountId===assignee?.accountId),person=accounts.length?unique(accounts):unique(people.filter(p=>p.email&&assignee?.emailAddress&&p.email.toLowerCase()===assignee.emailAddress.toLowerCase()));
 if(!issue.id||!issue.key||typeof f.summary!=='string')throw Error('Jira returned an issue without an ID, key or title.');
 if(f.duedate&&!isDay(f.duedate))throw Error('Jira returned an invalid due date.');
 const taskStatus=status(f.status?.name,f.status?.statusCategory?.key),priority=/highest|high|critical|blocker/i.test(f.priority?.name||'')?'High':/lowest|low|minor|trivial/i.test(f.priority?.name||'')?'Low':'Medium';
 return {id:identifier('jira',site,issue.id),title:f.summary.slice(0,4000),person:person?.id||'',date:dayAt(f.created,timezone),createdDate:dayAt(f.created,timezone),due:isDay(f.duedate)?f.duedate:'',priority,status:taskStatus,completedDate:taskStatus==='Done'&&f.resolutiondate?dayAt(f.resolutiondate,timezone):'',externalSource:'jira',externalScope:site,externalId:String(issue.id),externalKey:issue.key,externalUrl:site+'/browse/'+encodeURIComponent(issue.key),externalAssignee:assignee?.displayName||'',externalOwnerId:assignee?.accountId||'',externalStatus:f.status?.name||'',externalUpdated:f.updated||''};
}
function richText(value){
 if(typeof value==='string'){try{return richText(JSON.parse(value));}catch{return value;}}
 if(Array.isArray(value))return value.map(richText).join('');
 if(value&&typeof value==='object'){if(value.type==='text')return value.text||'';if(value.type==='link')return value.text||value.url||'';return richText(value.elements||value.rich_text||'');}return '';
}
function slackField(item,key){return (item.fields||[]).find(f=>f.column_id===key||f.key===key);}
function textField(f){if(!f)return '';return String(f.text||richText(f.rich_text??f.value??''));}
function slackTask(item,settings,team,people,timezone){
 const mapping=settings.columns,title=textField(slackField(item,mapping.title)),owner=slackField(item,mapping.owner),due=slackField(item,mapping.due),check=slackField(item,mapping.completed),customStatus=slackField(item,mapping.status),owners=owner?.user||parse(owner?.value,[]),first=Array.isArray(owners)?owners[0]:'',person=unique(people.filter(p=>p.slackUserId&&p.slackUserId===first));
 if(!item.id||!title.trim())throw Error('A Slack List item has no title. Check the Name column mapping before syncing.');
 const checked=check?.checkbox===true||check?.value===true||check?.value==='true',rawStatus=textField(customStatus)||(customStatus?.select||[])[0]||'',mapped=Object.entries(settings.statusMap||{}).find(([key])=>key.toLowerCase()===rawStatus.toLowerCase())?.[1],taskStatus=checked?'Done':mapped|| (rawStatus?status(rawStatus):'To do'),dueText=textField(due),dueValue=Array.isArray(due?.date)?due.date[0]:isDay(dueText)?dueText:parse(due?.value,[])[0]||'';
 if(!checked&&rawStatus&&!mapped&&!/^(open|to[ _-]?do|not[ _-]?started|pending|backlog|planned|done|complete(d)?|closed|resolved|in[ _-]?progress|work[ _-]?in[ _-]?progress|doing|review|in[ _-]?review|testing|blocked|on[ _-]?hold)$/i.test(rawStatus))throw Error('Map the Slack status field to a workspace status before syncing.');
 if(dueValue&&!isDay(dueValue))throw Error('Check the Slack due-date column mapping.');
 return {id:identifier('slack',team+':'+settings.listId,item.id),title:title.trim().slice(0,4000),person:person?.id||'',date:dayAt(Number(item.date_created)*1000,timezone),createdDate:dayAt(Number(item.date_created)*1000,timezone),due:isDay(dueValue)?dueValue:'',priority:'Medium',status:taskStatus,completedDate:'',externalSource:'slack',externalScope:team+':'+settings.listId,externalId:item.id,externalKey:item.id,externalUrl:`https://app.slack.com/client/${encodeURIComponent(team)}/lists/${encodeURIComponent(settings.listId)}`,externalAssignee:person?.name||first||'',externalOwnerId:first||'',externalOwners:JSON.stringify(Array.isArray(owners)?owners:[]),externalStatus:checked?'Completed':rawStatus||'Open',externalUpdated:String(item.updated_timestamp||'')};
}
function mergeTask(before,incoming,day){
 const original=before?{...before}:null,baseline=parse(before?.externalSnapshot),next={...(before||{}),id:incoming.id},pending={},conflicts={};
 // A completion first observed after a previously open Slack item is dated today.
 // Existing completed items receive no invented historical completion date.
 if(before?.externalSource==='slack'&&baseline.status&&baseline.status!=='Done'&&incoming.status==='Done'&&!incoming.completedDate){incoming={...incoming,completedDate:day,completionDateOrigin:'observed'};}
 if(before?.externalSource==='slack'&&baseline.status==='Done'&&incoming.status==='Done'&&!incoming.completedDate)incoming={...incoming,completedDate:baseline.completedDate||''};
 for(const field of fields){
  const remote=incoming[field]||'',local=before?.[field]||'',base=baseline[field]||'';
  if(!before||local===base||local===remote){next[field]=remote;baseline[field]=remote;}
  else if(remote===base){next[field]=local;}
  else{next[field]=local;pending[field]=remote;conflicts[field]={base,local,remote};}
 }
 for(const [key,value]of Object.entries(incoming))if(!fields.includes(key)&&key!=='id'&&key!=='createdDate')next[key]=String(value);
 if(!before)next.createdDate=incoming.createdDate||incoming.date||'';
 if(next.status!=='Done'){next.completedDate='';next.completedBy='';}
 else if(!next.completedBy)next.completedBy=next.person||'';
 if(original?.status==='Done'&&next.status==='Done'&&original.completedBy)next.completedBy=original.completedBy;
 next.externalSnapshot=JSON.stringify(baseline);next.externalPending=JSON.stringify(pending);next.externalConflicts=JSON.stringify(conflicts);next.externalLastSynced=day;
 return next;
}
function applyImports(state,records,day){
 const next=structuredClone(state);let created=0,updated=0;
 for(const record of records){const i=next.tasks.findIndex(t=>t.id===record.id),before=i<0?null:next.tasks[i],task=mergeTask(before,record,day);if(i<0){next.tasks.push(task);created++;}else{if(JSON.stringify(task)!==JSON.stringify(before))updated++;next.tasks[i]=task;}}
 return {state:next,created,updated,conflicts:next.tasks.filter(t=>Object.keys(parse(t.externalConflicts)).length).length};
}
function resolveConflict(state,id,field,choice){
 if(!fields.includes(field)||!['local','source'].includes(choice))throw Error('Choose a field and either the local or source value.');
 const next=structuredClone(state),task=next.tasks.find(t=>t.id===id);if(!task)throw Error('This task no longer exists.');
 const conflicts=parse(task.externalConflicts),pending=parse(task.externalPending),snapshot=parse(task.externalSnapshot);if(!Object.hasOwn(conflicts,field))throw Error('This conflict was already resolved. Refresh the task.');
 if(choice==='source')task[field]=pending[field]||'';snapshot[field]=pending[field]||'';delete conflicts[field];delete pending[field];
 task.externalSnapshot=JSON.stringify(snapshot);task.externalPending=JSON.stringify(pending);task.externalConflicts=JSON.stringify(conflicts);
 if(task.status!=='Done'){task.completedDate='';task.completedBy='';}else if(!task.completedBy)task.completedBy=task.person||'';
 return next;
}
function digest(state,person,day){
 const tasks=state.tasks.filter(t=>t.person===person.id&&t.status!=='Done'&&isDay(t.due)&&t.due<=day);
 if(!tasks.length)return '';
 return `Hi ${person.name}, here is your task reminder for ${day}:\n\n`+tasks.slice(0,12).map(t=>`${t.due<day?'Overdue':'Due today'} · ${t.title.slice(0,130)} (${t.status||'To do'})`).join('\n')+(tasks.length>12?`\n+ ${tasks.length-12} more tasks in your workspace.`:'');
}
module.exports={dayAt,status,richText,textField,slackField,jiraTask,slackTask,mergeTask,applyImports,resolveConflict,digest,parse};
