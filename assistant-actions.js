const {randomUUID}=require('node:crypto');
const {valid,isDay,isTime}=require('./state');
const Analytics=require('./analytics');
class AssistantError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const fields={
 member:['name','role','strengths','focus','capacity','checkin','checkinTime','notes'],
 task:['title','person','date','due','priority','status','blocker','outcome','dependsOn','completedDate'],
 activity:['title','type','person','date','status','notes']
};
const pages=['overview','people','tasks','activities','calendar','activity','presentation','impact','connections'];
const kinds=['create_member','update_member','delete_member','create_task','update_task','delete_task','create_activity','update_activity','delete_activity','set_leave','remove_leave','navigate','view_member','view_due','export_backup','import_backup','append_member_note','append_activity_note'];
function fail(message){throw new AssistantError(message);}
function applyPlan(original,plan,today){
 if(!isDay(today))fail('A valid local date is required.');
 if(!plan||typeof plan.message!=='string'||!Array.isArray(plan.actions)||plan.actions.length>30)fail('The assistant returned an invalid plan. Please rephrase your command.');
 const state=structuredClone(original),aliases=new Map(),summaries=[],ui=[];let destructive=false;
 const resolve=id=>aliases.get(id)||id;
 const find=(collection,id)=>{const item=state[collection].find(item=>item.id===resolve(id));if(!item)fail('The requested record no longer exists. Refresh and try again.');return item;};
 const member=id=>find('people',id);
 for(const action of plan.actions){
  if(!action||!kinds.includes(action.kind)||typeof action.id!=='string'||!Array.isArray(action.changes)||!Array.isArray(action.dates)||typeof action.page!=='string')fail('The assistant returned an unsupported action.');
  const patch={};
  for(const change of action.changes){
   if(!change||typeof change.field!=='string'||typeof change.value!=='string'||change.value.length>4000||Object.hasOwn(patch,change.field)||['__proto__','constructor','prototype'].includes(change.field))fail('An assistant field is invalid.');
   patch[change.field]=change.value.trim();
  }
  if(['set_leave','remove_leave'].includes(action.kind)){
   if(action.changes.length||action.dates.length<1||action.dates.length>90||action.dates.some(date=>!isDay(date)))fail('Leave needs 1–90 valid, explicit dates.');
   const person=member(action.id),dates=[...new Set(action.dates)];
   if(action.kind==='set_leave'){
    state.leaves??=[];
    for(const date of dates)if(!state.leaves.some(l=>l.person===person.id&&l.date===date))state.leaves.push({id:randomUUID(),person:person.id,name:person.name,date});
    summaries.push(`Marked ${person.name} on leave: ${dates.join(', ')}.`);
   }else{
    if(state.leaves)state.leaves=state.leaves.filter(l=>l.person!==person.id||!dates.includes(l.date));
    summaries.push(`Removed leave for ${person.name}: ${dates.join(', ')}.`);
   }
   ui.push({kind:'navigate',page:'calendar',date:dates[0]});continue;
  }
  if(['append_member_note','append_activity_note'].includes(action.kind)){
   if(action.dates.length||action.changes.length!==1||!patch.notes)fail('Provide one note to append.');
   const item=find(action.kind==='append_member_note'?'people':'activities',action.id);
   const combined=[item.notes,patch.notes].filter(Boolean).join('\n');if(combined.length>4000)fail('The combined note exceeds 4000 characters.');
   item.notes=combined;summaries.push(`Added a note for ${item.name||item.title}.`);continue;
  }
  const match=/^(create|update|delete)_(member|task|activity)$/.exec(action.kind);
  if(match){
   const [,operation,entity]=match,collection={member:'people',task:'tasks',activity:'activities'}[entity];
   if(action.dates.length||Object.keys(patch).some(key=>!fields[entity].includes(key)))fail('The assistant tried to change an unsupported field.');
   if(operation==='delete'){
    if(action.changes.length)fail('A deletion cannot also change fields.');
    const item=find(collection,action.id);destructive=true;
    if(entity==='member'){
     for(const group of ['tasks','activities'])state[group].forEach(record=>{if(record.person===item.id)record.person='';});
     (state.leaves||[]).forEach(leave=>{if(leave.person===item.id&&!leave.name)leave.name=item.name;});
    }
    if(entity==='task')for(const task of state.tasks)if(Analytics.dependencies(task).includes(item.id))task.dependsOn=JSON.stringify(Analytics.dependencies(task).filter(id=>id!==item.id));
    state[collection]=state[collection].filter(record=>record.id!==item.id);summaries.push(`Deleted ${entity}: ${item.name||item.title}.${entity==='member'?' Their tasks and activities become unassigned; leave history is retained.':''}`);continue;
   }
   if(patch.person)patch.person=member(patch.person).id;
   if(patch.capacity==='Maximum')patch.capacity='At capacity';
   for(const key of ['date','due','checkin','completedDate'])if(patch[key]&&!isDay(patch[key]))fail('Dates must be valid YYYY-MM-DD values.');
   if(patch.checkinTime&&!isTime(patch.checkinTime))fail('One-to-one time must use HH:MM in your local timezone.');
   for(const key of ['name','title'])if(Object.hasOwn(patch,key)&&!patch[key])fail('Names and titles cannot be empty.');
   if(patch.name&&patch.name.length>200||patch.title&&patch.title.length>200)fail('Names and titles must be under 200 characters.');
   if(Object.hasOwn(patch,'capacity')&&!['Available','Balanced','At capacity'].includes(patch.capacity))fail('Choose Available, Balanced, or Maximum capacity.');
   if(Object.hasOwn(patch,'priority')&&!['Low','Medium','High'].includes(patch.priority))fail('Priority must be Low, Medium, or High.');
   if(Object.hasOwn(patch,'status')&&!(entity==='task'?['To do','In progress','Blocked','Done']:['Planned','In progress','Done']).includes(patch.status))fail('That status is not supported.');
   if(Object.hasOwn(patch,'type')&&!['Team bonding','Learning','Recognition','Retrospective','Team improvement'].includes(patch.type))fail('Choose a supported team activity type.');
   if(operation==='create'){
    if(!patch[entity==='member'?'name':'title'])fail(`A ${entity} needs a ${entity==='member'?'name':'title'}.`);
    if(action.id&&(aliases.has(action.id)||['people','tasks','activities'].some(group=>state[group].some(item=>item.id===action.id))))fail('A new record reference conflicts with an existing record.');
    if(entity==='member'&&state.people.some(p=>p.name.toLocaleLowerCase()===patch.name.toLocaleLowerCase()))fail(`A member named ${patch.name} already exists. Please specify an update instead.`);
    const defaults={member:{role:'',strengths:'',focus:'',capacity:'Balanced',checkin:'',checkinTime:'',notes:''},task:{person:'',date:today,due:'',priority:'Medium',status:'To do',blocker:'',outcome:''},activity:{type:'Team improvement',person:'',date:'',status:'Planned',notes:''}}[entity];
    const item={...defaults,...patch,id:randomUUID(),...(entity==='task'?{createdDate:today}:{})};
    if(entity==='task'&&!isDay(item.date))fail('A task needs a work date.');
    if(entity==='task'&&patch.completedDate&&(item.status!=='Done'||patch.completedDate>today))fail('Use a past or current completion date on a completed task.');
    if(entity==='task')Analytics.stampCompletion(null,item,today);
    state[collection].push(item);if(action.id)aliases.set(action.id,item.id);
    summaries.push(`Added ${entity}: ${item.name||item.title}${entity==='member'&&item.role?' — '+item.role:''}.`);
   }else{
    const item=find(collection,action.id);
    if(entity==='task'&&Object.hasOwn(patch,'date')&&!isDay(patch.date))fail('A task needs a work date.');
    if(entity==='task'&&patch.completedDate&&((patch.status||item.status)!=='Done'||patch.completedDate>today))fail('Use a past or current completion date on a completed task.');
    const previous={...item};Object.assign(item,patch);if(entity==='task')Analytics.stampCompletion(previous,item,today);summaries.push(`Updated ${entity}: ${item.name||item.title}.`);
   }
   ui.push({kind:'navigate',page:{member:'people',task:'tasks',activity:'activities'}[entity]});continue;
  }
  if(action.changes.length)fail('This action cannot change record fields.');
  if(action.kind==='navigate'){if(!pages.includes(action.page))fail('Unknown destination.');ui.push({kind:'navigate',page:action.page});}
  if(action.kind==='view_member')ui.push({kind:'view_member',id:member(action.id).id});
  if(action.kind==='view_due'){if(action.dates.length!==1||!isDay(action.dates[0]))fail('Choose one valid due date.');ui.push({kind:'view_due',date:action.dates[0]});}
  if(['export_backup','import_backup'].includes(action.kind))ui.push({kind:action.kind});
 }
 if(summaries.length)Analytics.observeCapacity(state,today,randomUUID);
 if(Buffer.byteLength(JSON.stringify(state),'utf8')>5000000)throw new AssistantError('This change would exceed the 5 MB workspace limit. Nothing was saved.',413);
 if(!valid(state))fail('The assistant plan would create invalid workspace data. Nothing was saved.');
 return {state,changed:JSON.stringify(state)!==JSON.stringify(original),destructive,summaries,ui,message:summaries.length?summaries.join('\n'):plan.message.slice(0,8000)};
}
module.exports={applyPlan,AssistantError,kinds,fields,pages};
