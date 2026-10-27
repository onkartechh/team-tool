const blank=()=>({people:[],tasks:[],activities:[]});
let state=blank(),page='overview',filter={date:'',person:'',status:'',search:'',scope:''};
let loaded=false, revision='', saveQueue=Promise.resolve(), saveFailed=false, saveVersion=0, memberOpen='', selectedDue='',lastCapacityDay='';
function badge(text){document.querySelector('.local-badge').textContent=text;if(typeof DerqNotepad!=='undefined')DerqNotepad.refresh();}
async function load(){
 try{
  if(typeof DerqSync!=='undefined'){const current=await DerqSync.load();state=current.state;revision=current.etag;loaded=true;render();DerqSync.paint();if(TeamspaceAnalytics.observeCapacity(state,today(),TeamspaceIds.createId))save({refresh:false});else saveQueue=saveQueue.then(()=>DerqSync.flush());return;}
  const response=await fetch('/api/state',{cache:'no-store'});
  if(!response.ok)throw Error();
  const data=await response.json();if(!valid(data))throw Error();
  state=data;revision=response.headers.get('ETag');loaded=true;render();badge('● Saved to server');
 }catch{badge('● Storage unavailable');notice('Could not load server data. Reload to retry. Editing is disabled to protect existing records.');}
}
function valid(s){return TeamspaceState.valid(s);}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function notice(s){document.querySelector('#notice').textContent=s;}
function save({refresh=true}={}){
 if(typeof DerqSync!=='undefined'){TeamspaceAnalytics.observeCapacity(state,today(),TeamspaceIds.createId);try{DerqSync.stage(state);}catch(error){notice(error.message);return;}saveVersion++;if(refresh)render();else refreshHeaderReminders();saveQueue=saveQueue.then(()=>DerqSync.flush());return;}
 const snapshot=JSON.stringify(state), version=++saveVersion;badge(saveFailed?'● Unsaved changes':'● Saving…');if(refresh)render();else refreshHeaderReminders();
 saveQueue=saveQueue.then(async()=>{
  if(saveFailed)return;
  try{
   const response=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':revision},body:snapshot});
   if(!response.ok)throw Error(response.status===409?'Another session changed this workspace. Export your edits, then reload.':'Could not save. Export your edits, then reload and import the backup to retry.');
   revision=response.headers.get('ETag');if(version===saveVersion){badge('● Saved to server');notice('');}
  }catch(error){saveFailed=true;badge('● Unsaved changes');notice(error.message+' Further edits will remain in memory until reload.');}
 });
}
window.addEventListener('beforeunload',event=>{if(loaded&&((typeof DerqSync==='undefined'?document.querySelector('.local-badge').textContent!=='● Saved to server':DerqSync.info().cachePending||DerqSync.info().storageError)||document.querySelector('[data-dirty="true"]')||(typeof DerqNotepad!=='undefined'&&DerqNotepad.isDirty()))){event.preventDefault();event.returnValue='';}});

const person=id=>state.people.find(p=>p.id===id)?.name||'Unassigned';
const initials=s=>s.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
const pill=(s='Not set')=>`<span class="pill ${esc(s.toLowerCase())}">${esc(s)}</span>`;
const action=(kind,id)=>`<div class="row-actions"><button data-edit="${kind}" data-id="${esc(id)}">Edit</button><button data-delete="${kind}" data-id="${esc(id)}">Delete</button></div>`;
const empty=(title,desc)=>`<div class="empty"><strong>${title}</strong>${desc}</div>`;
const panel=(title,body,link)=>`<section class="panel"><div class="panel-head"><h2>${title}</h2>${link?`<button data-page="${link}">View all →</button>`:''}</div>${body}</section>`;
function tasksTable(tasks){return tasks.length?`<div class="table-wrap"><table><thead><tr><th>Task / blocker</th><th>Assigned to</th><th>Work date / due</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead><tbody>${tasks.map(t=>`<tr><td><button type="button" class="task-title-link" data-open-task="${esc(t.id)}">${esc(t.title)}</button>${typeof DerqIntegrations!=='undefined'?DerqIntegrations.sourceBadge(t):''}<span class="detail">${esc(t.blocker)}</span></td><td>${esc(person(t.person))}</td><td>${esc(t.date)}${inlineDate('tasks',t,'due','Due date')}</td><td>${cycleControl('tasks',t,'priority')}</td><td>${cycleControl('tasks',t,'status')}</td><td>${action('tasks',t.id)}</td></tr>`).join('')}</tbody></table></div>`:empty('A little clarity goes a long way','Add an assignment to give everyone a clear next step.');}
function activitiesList(items){return items.length?items.map(a=>`<div class="activity"><input aria-label="Mark ${esc(a.title)} complete" type="checkbox" data-complete="${esc(a.id)}" ${a.status==='Done'?'checked':''}><div><h3>${esc(a.title)}</h3><p>${esc(a.type)} · ${esc(a.date||'No date')} · ${esc(person(a.person))}</p><p>${esc(a.notes)}</p>${pill(a.status)}</div><div class="actions"><button data-edit="activities" data-id="${esc(a.id)}">Edit</button><button data-delete="activities" data-id="${esc(a.id)}">Delete</button></div></div>`).join(''):empty('Make room for connection','Plan a coffee chat, a team retro, or a moment to celebrate.');}
function render(){
 if(!['overview','people','tasks','activities','calendar','activity','impact','presentation','connections'].includes(page))page='overview';
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 const titles={overview:'Command center',people:'Team & growth',tasks:'Daily tasks',activities:'Team connection',calendar:'Calendar',activity:'Team Activity',impact:'Leave Impact',presentation:'Presentation',connections:'Connections'};
 document.querySelector('#breadcrumb').textContent=titles[page];
 const heading=(title,desc,kind,label)=>`<div class="page-heading"><div><div class="subheading">DERQ / PEOPLE & PERFORMANCE</div><h1>${title}</h1><p>${desc}</p></div>${kind?`<button class="primary" data-add="${kind}">+ ${label}</button>`:''}</div>`;
 let html='';
 if(page==='overview'){
 html=dashboard(heading);
 }else if(page==='people'){
 html=heading('People first. Progress follows.','Click capacity to cycle it. Edit strengths, growth focus, and notes directly; they save when you leave the field.','people','Add member')+panel('Your team',state.people.length?`<div class="table-wrap"><table><thead><tr><th>Member / role</th><th>Strengths</th><th>Growth focus</th><th>Capacity</th><th>Next check-in</th><th>Notes & recognition</th><th>Actions</th></tr></thead><tbody>${state.people.map(p=>`<tr><td><div class="person"><span class="avatar">${esc(initials(p.name))}</span><div><strong>${esc(p.name)}</strong><span class="detail">${esc(p.role)}</span></div></div></td><td>${inlineText(p,'strengths','Strengths')}</td><td>${inlineText(p,'focus','Growth focus')}</td><td>${cycleControl('people',p,'capacity')}</td><td>${inlineDate('people',p,'checkin','Next check-in')}${inlineTime(p)}</td><td>${inlineText(p,'notes','Notes & recognition')}</td><td>${action('people',p.id)}</td></tr>`).join('')}</tbody></table></div>`:empty('Meet your team, in one place','Add a member to capture their strengths and where you can support them.'));
 }else if(page==='tasks'){
 const filtered=state.tasks.filter(t=>matchesTaskScope(t,filter.scope)&&(!filter.date||t.date===filter.date)&&(!filter.person||t.person===filter.person)&&(!filter.status||t.status===filter.status)&&(!filter.search||t.title.toLowerCase().includes(filter.search.toLowerCase()))&&(!filter.source||(filter.source==='local'?!t.externalSource:t.externalSource===filter.source)));
 html=heading('Make today’s priorities clear.','Click status or priority to cycle. Change due dates in place; every update saves automatically.','tasks','Add task')+`<div class="filters"><input aria-label="Search tasks" placeholder="Search tasks…" data-filter="search" value="${esc(filter.search)}"><input aria-label="Filter work date" type="date" data-filter="date" value="${esc(filter.date)}"><select aria-label="Filter member" data-filter="person"><option value="">All members</option>${state.people.map(p=>`<option value="${esc(p.id)}" ${p.id===filter.person?'selected':''}>${esc(p.name)}</option>`).join('')}</select><select aria-label="Filter status" data-filter="status">${['','To do','In progress','Blocked','Done'].map(s=>`<option value="${s}" ${s===filter.status?'selected':''}>${s||'All statuses'}</option>`).join('')}</select><select aria-label="Filter task scope" data-filter="scope">${[['','All assignments'],['active','Active assignments'],['overdue','Overdue assignments']].map(([value,label])=>`<option value="${value}" ${value===filter.scope?'selected':''}>${label}</option>`).join('')}</select><select aria-label="Filter task source" data-filter="source">${[['','All sources'],['local','Workspace tasks'],['jira','Jira'],['slack','Slack Lists']].map(([value,label])=>`<option value="${value}" ${value===filter.source?'selected':''}>${label}</option>`).join('')}</select><button id="clear-filters">Clear filters</button></div>`+panel(`${filtered.length} assignments`,tasksTable(filtered));
 }else if(['activity','impact','presentation'].includes(page)&&typeof DerqLeadership!=='undefined'){html=DerqLeadership.page(page,heading);
 }else if(page==='connections'&&typeof DerqIntegrations!=='undefined'){html=DerqIntegrations.page(heading);
 }else if(page==='calendar'){html=heading('Plan time away. Keep everyone aligned.','Select a date and choose the team members on leave.')+leaveCalendar();
 }else if(page==='activities')html=heading('Connection is part of the work.','A shared to-do list for bonding, learning, recognition, and team improvement.','activities','Plan activity')+panel('Your connection list',activitiesList(state.activities));
 document.querySelector('#content').innerHTML=html;
 refreshHeaderReminders();
 if(typeof DerqNotepad!=='undefined')DerqNotepad.refresh();
 if(typeof DerqLeadership!=='undefined')DerqLeadership.afterRender();
 if(memberOpen&&document.querySelector('#member-detail').open)openMember(memberOpen);
 if(selectedDue&&document.querySelector('#due-detail').open)renderDueDetails();
 if(typeof DerqWorkspace!=='undefined')DerqWorkspace.afterRender();
 if(typeof DerqIntegrations!=='undefined')DerqIntegrations.afterRender();
}
const schemas={people:[['name','Full name','text',true],['role','Role','text'],['email','Work email (optional)','email'],['jiraAccountId','Jira account ID (optional)','text'],['slackUserId','Slack user ID (optional)','text'],['strengths','Strengths','textarea'],['focus','Growth / coaching focus','textarea'],['capacity','Capacity',['Available','Balanced','At capacity']],['checkin','Next one-to-one','date'],['checkinTime','One-to-one time (local)','time'],['notes','Check-in notes & recognition','textarea']],tasks:[['title','Task','text',true],['person','Assigned to','people'],['date','Work date','date',true],['due','Due date','date'],['priority','Priority',['Medium','High','Low']],['status','Status',['To do','In progress','Blocked','Done']],['blocker','Blockers / support needed','textarea'],['outcome','Success criteria / expected impact','textarea'],['completedDate','Completion date (completed tasks only)','date'],['dependsOn','Depends on (Ctrl/Cmd to select multiple)','tasks']],activities:[['title','Activity','text',true],['type','Type',['Team bonding','Learning','Recognition','Retrospective','Team improvement']],['person','Owner','people'],['date','Planned date','date'],['status','Status',['Planned','In progress','Done']],['notes','Plan / outcome notes','textarea']]};
let editing;
function openEditor(kind,id,full=false){if(id&&kind==='tasks'&&!full&&typeof DerqWorkspace!=='undefined')return DerqWorkspace.openTask(id);const item=state[kind].find(x=>x.id===id)||{};editing={kind,id,original:JSON.parse(JSON.stringify(item))};document.querySelector('#edit-error').textContent='';document.querySelector('#form-title').textContent=(id?'Edit ':'Add ')+({people:'team member',tasks:'daily task',activities:'team activity'}[kind]);document.querySelector('#fields').innerHTML=schemas[kind].map(([name,label,type,required])=>{const value=(name==='capacity'?normalizeCapacity(item[name]):item[name])??(name==='date'&&kind==='tasks'?today():'');let control;if(type==='textarea')control=`<textarea name="${name}" maxlength="4000">${esc(value)}</textarea>`;else if(type==='tasks')control=`<select name="${name}" multiple size="5">${state.tasks.filter(t=>t.id!==id).map(t=>`<option value="${esc(t.id)}" ${TeamspaceAnalytics.dependencies(item).includes(t.id)?'selected':''}>${esc(t.title)} · ${esc(person(t.person))}</option>`).join('')}</select><small>Prerequisites should finish before this task. Cycles are prevented.</small>`;else if(type==='people')control=`<select name="${name}"><option value="">Unassigned</option>${state.people.map(p=>`<option value="${esc(p.id)}" ${value===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>`;else if(Array.isArray(type))control=`<select name="${name}">${type.map(s=>`<option value="${esc(s)}" ${value===s?'selected':''}>${name==='capacity'?capacityLabel(s):s}</option>`).join('')}</select>`;else control=`<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} maxlength="200">`;return `<label class="field">${label}${required?' *':''}${control}</label>`;}).join('');document.querySelector('#editor').showModal();}
document.addEventListener('click',e=>{if(!loaded)return;const b=e.target.closest('button, article[data-member]');if(!b)return;if(handlePlanningClick(b))return;if(b.dataset.dueDate){openDueDate(b.dataset.dueDate);return;}if(b.dataset.dueEdit){document.querySelector('#due-detail').close();openEditor('tasks',b.dataset.dueEdit);return;}if(b.dataset.cycle){cycleInline(b);return;}if(b.dataset.summary){openSummary(b.dataset.summary);return;}if(b.dataset.taskStatus){openSummary('active',b.dataset.taskStatus);return;}if(b.dataset.member){openMember(b.dataset.member);return;}if(b.dataset.memberEdit){document.querySelector('#member-detail').close();openEditor('people',b.dataset.memberEdit);return;}if(b.dataset.page){page=b.dataset.page;render();window.scrollTo(0,0);}if(b.dataset.add)openEditor(b.dataset.add);if(b.dataset.edit)openEditor(b.dataset.edit,b.dataset.id);if(b.dataset.delete){const kind=b.dataset.delete,id=b.dataset.id;if(confirm(kind==='people'?'Delete this member? Their tasks and activities will become unassigned.':'Delete this record?')){if(kind==='tasks')for(const task of state.tasks)if(TeamspaceAnalytics.dependencies(task).includes(id))task.dependsOn=JSON.stringify(TeamspaceAnalytics.dependencies(task).filter(parent=>parent!==id));state[kind]=state[kind].filter(x=>x.id!==id);if(kind==='people'){for(const k of ['tasks','activities'])state[k].forEach(x=>{if(x.person===id)x.person='';});}save();}}if(b.id==='clear-filters'){filter={date:'',person:'',status:'',search:'',scope:''};render();}});
document.addEventListener('change',e=>{if(!loaded)return;if(e.target.dataset.inline){commitInline(e.target);return;}if(e.target.dataset.filter){filter[e.target.dataset.filter]=e.target.value;render();}if(e.target.dataset.complete){const a=state.activities.find(x=>x.id===e.target.dataset.complete);a.status=e.target.checked?'Done':'Planned';save();}});
for(const id of ['close','cancel'])document.getElementById(id).onclick=()=>document.querySelector('#editor').close();
document.querySelector('#edit-form').onsubmit=e=>{
 e.preventDefault();const form=new FormData(e.target),data=Object.fromEntries(form);for(const k of Object.keys(data))data[k]=data[k].trim();const {kind,id,original}=editing;
 if(kind==='tasks')data.dependsOn=JSON.stringify(form.getAll('dependsOn'));
 if(('name'in data&&!data.name)||('title'in data&&!data.title)){document.querySelector('#edit-error').textContent='Please enter a name or title.';return;}
 if(kind==='tasks'&&original.status==='Done'&&data.status!=='Done')data.completedDate='';
 if(data.completedDate&&data.status!=='Done'){document.querySelector('#edit-error').textContent='A completion date belongs to a completed task. Set its status to Done or clear the date.';return;}
 if(data.completedDate&&data.completedDate>today()){document.querySelector('#edit-error').textContent='Completion dates cannot be in the future.';return;}
 const next=JSON.parse(JSON.stringify(state));
 if(id){const index=next[kind].findIndex(x=>x.id===id);if(index<0){document.querySelector('#edit-error').textContent='This record was removed in another session. Copy your draft before closing.';return;}const patch=Object.fromEntries(Object.entries(data).filter(([key,value])=>value!==(original[key]??(key==='dependsOn'?'[]':''))));const previous={...next[kind][index]};next[kind][index]={...previous,...patch,id};if(kind==='tasks')TeamspaceAnalytics.stampCompletion(previous,next[kind][index],today());}
 else next[kind].push(newRecord(kind,data));
 const dependencyError=TeamspaceAnalytics.dependencyError(next);if(dependencyError||!valid(next)){document.querySelector('#edit-error').textContent=dependencyError||'Review the dates and fields before saving.';return;}
 state=next;document.querySelector('#editor').close();save();
};
document.querySelector('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`teamspace-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.querySelector('#import').onchange=async e=>{if(!loaded)return;try{const file=e.target.files[0];if(!file)return;if(file.size>5e6)throw Error();const data=JSON.parse(await file.text());if(!valid(data))throw Error();if(confirm('Import this backup into the workspace? Local records will be replaced, and concurrent server edits will be reconciled before syncing. Export first to keep a copy.')){if(typeof DerqNotepad!=='undefined')DerqNotepad.flush();state=data;save();}}catch{notice('Could not import this file. Choose a valid Teamspace JSON backup under 5 MB.');}finally{e.target.value='';}};
document.querySelector('#content').textContent='Loading workspace…';
updateClock();
setInterval(updateClock,1000);
document.querySelector('#close-member').onclick=()=>document.querySelector('#member-detail').close();
document.querySelector('#close-due').onclick=()=>document.querySelector('#due-detail').close();
for(const id of ['close-leave','cancel-leave'])document.getElementById(id).onclick=()=>document.querySelector('#leave-editor').close();
document.querySelector('#close-meetings').onclick=()=>document.querySelector('#meetings-detail').close();
document.querySelector('#leave-form').onsubmit=event=>{event.preventDefault();if(!loaded)return;const ids=new FormData(event.target).getAll('members');if(setLeaveMembers(selectedLeave,ids))save();document.querySelector('#leave-editor').close();};
load();

function updateClock(){
 const now=new Date();
 document.querySelector('#clock').dateTime=now.toISOString();
 document.querySelector('#clock').textContent=now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
 if(loaded){refreshHeaderReminders();if(lastCapacityDay!==today()){lastCapacityDay=today();if(typeof DerqSync!=='undefined'&&TeamspaceAnalytics.observeCapacity(state,today(),TeamspaceIds.createId))save({refresh:false});}}
 document.querySelector('#clock-date').textContent=now.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'})+' · '+Intl.DateTimeFormat().resolvedOptions().timeZone;
}
const activeTasks=id=>state.tasks.filter(t=>t.person===id&&t.status!=='Done');
const overdue=t=>t.status!=='Done'&&t.due&&t.due<today();
function memberCards(){return state.people.length?`<div class="member-grid">${state.people.map((p,i)=>{
 const tasks=activeTasks(p.id),blocked=tasks.filter(t=>t.status==='Blocked').length;
 return `<article class="member-card" data-member="${esc(p.id)}"><button type="button" class="member-profile-button" data-member="${esc(p.id)}" aria-label="View profile for ${esc(p.name)}"><div class="member-top"><span class="avatar tone-${i%3}">${esc(initials(p.name))}</span><span class="member-arrow" aria-hidden="true">→</span></div><h3>${esc(p.name)}</h3><p>${esc(p.role||'Team member')}</p></button>${cycleControl('people',p,'capacity')}<div class="member-current"><span class="eyelabel">CURRENT FOCUS</span><strong>${esc(tasks[0]?.title||'Ready for the next assignment')}</strong></div><div class="member-foot"><span>${tasks.length} active ${blocked?' · '+blocked+' blocked':''}</span><button class="member-profile-link" data-member="${esc(p.id)}">View profile →</button></div></article>`;
 }).join('')}</div>`:empty('Build your team’s command center','Add your first member to see their focus, strengths, and assignment history here.');}
function openMember(id){
 memberOpen=id;
 const p=state.people.find(p=>p.id===id);if(!p)return;
 const tasks=activeTasks(id);
 const recent=state.tasks.filter(t=>t.person===id).map((t,index)=>({t,index})).sort((a,b)=>(b.t.date||'').localeCompare(a.t.date||'')||b.index-a.index).slice(0,4).map(x=>x.t);
 document.querySelector('#member-content').innerHTML=`<div class="profile-heading"><span class="avatar">${esc(initials(p.name))}</span><div><span class="eyelabel">MEMBER PROFILE</span><h2 id="member-title">${esc(p.name)}</h2><p>${esc(p.role||'Team member')}</p>${cycleControl('people',p,'capacity')}</div></div>${typeof DerqIntegrations!=='undefined'?`<button type="button" class="profile-slack-button" data-message-member="${esc(id)}">${p.slackUserId?'Message in Slack ↗':'Connect Slack for this member ↗'}</button>`:''}${typeof DerqLeadership!=='undefined'?DerqLeadership.memberSection(id):''}<section class="profile-section"><h3>Strengths</h3>${inlineText(p,'strengths','Strengths')}</section><section class="profile-section"><h3>Current assignments <span class="count">${tasks.length}</span></h3>${tasks.length?tasks.map(t=>`<div class="profile-task"><button type="button" class="task-title-link" data-open-task="${esc(t.id)}">${esc(t.title)}</button>${cycleControl('tasks',t,'status')}<p>Assigned ${esc(t.date||'No date')}</p>${inlineDate('tasks',t,'due','Due date')}${t.outcome?`<p>Success: ${esc(t.outcome)}</p>`:''}${t.blocker?`<p class="risk-text">Support: ${esc(t.blocker)}</p>`:''}</div>`).join(''): '<p>No active assignments.</p>'}</section><section class="profile-section"><h3>Last four assignments</h3><p class="muted">Most recent work dates, including active and completed tasks.</p>${recent.length?`<ol class="timeline">${recent.map(t=>`<li><time>${esc(t.date||'No date recorded')}</time><strong>${esc(t.title)}</strong>${pill(t.status)}</li>`).join('')}</ol>`:'<p>No assignment history yet.</p>'}</section><section class="profile-section"><h3>Growth & one-to-one</h3>${inlineText(p,'focus','Growth focus')}${inlineDate('people',p,'checkin','Next check-in')}${inlineTime(p)}${inlineText(p,'notes','Notes & recognition')}<button data-member-edit="${esc(p.id)}">Edit profile & coaching notes</button></section>`;
 if(typeof DerqWorkspace!=='undefined')DerqWorkspace.showDetail(document.querySelector('#member-detail'),{kind:'member',id});else if(!document.querySelector('#member-detail').open)document.querySelector('#member-detail').showModal();
}
function dashboard(heading){
 const active=state.tasks.filter(t=>t.status!=='Done'),done=state.tasks.length-active.length;
 const blocked=active.filter(t=>t.status==='Blocked'),late=active.filter(overdue);
 const progress=state.tasks.length?Math.round(done/state.tasks.length*100):0;
 const checkins=state.people.filter(p=>p.checkin&&p.checkin<=today()).sort((a,b)=>a.checkin.localeCompare(b.checkin));
 const max=Math.max(1,...state.people.map(p=>activeTasks(p.id).length));
 const focus=active.filter(t=>t.status==='Blocked'||overdue(t)||t.priority==='High').sort((a,b)=>Number(b.status==='Blocked')-Number(a.status==='Blocked')||String(a.due||'9999').localeCompare(b.due||'9999')).slice(0,5);
 return heading('Lead with clarity. Move as one.','Your people, priorities, and progress — connected in one workspace.','tasks','Assign work')+
 `<section class="hero"><div class="hero-copy"><span class="hero-label"><span class="live-dot"></span> DERQ TEAM COMMAND CENTER</span><h2>Great outcomes.<br><em>Stronger together.</em></h2><p>Turn daily direction into meaningful progress.<br>Give your people the clarity and support to do their best work.</p><button data-add="people">+ Add team member</button></div><div class="hero-visual"><span class="radar-orbit orbit-one"></span><span class="radar-orbit orbit-two"></span><span class="radar-label">CONNECTED TEAM NETWORK</span><svg viewBox="0 0 360 260" aria-hidden="true"><defs><linearGradient id="flow"><stop stop-color="#58cfff"/><stop offset="1" stop-color="#3775f6"/></linearGradient></defs><g fill="none" stroke="#6aabff" stroke-opacity=".25"><ellipse cx="180" cy="135" rx="145" ry="85"/><ellipse cx="180" cy="135" rx="110" ry="60"/><path d="M35 135h290M180 50v170M75 75l210 120M75 195L285 75"/></g><path d="M50 171L112 120l65 31 66-66 65 16" fill="none" stroke="url(#flow)" stroke-width="5" stroke-linecap="round"/><g fill="#91dcff" stroke="#16499a" stroke-width="7"><circle cx="50" cy="171" r="8"/><circle cx="112" cy="120" r="8"/><circle cx="177" cy="151" r="8"/><circle cx="243" cy="85" r="8"/><circle cx="308" cy="101" r="8"/></g><text x="180" y="242" text-anchor="middle" fill="#a8d5ff" font-size="11" letter-spacing="3">ALIGN · SUPPORT · GROW</text></svg></div></section>`+
 `<div class="stats">${[['Team members',state.people.length,'People powering the mission','people','people'],['Active assignments',active.length,`${done} completed across all dates`,'arrow','active'],['Needs support',blocked.length,'Blocked tasks to unblock','flag','blocked'],['Overdue',late.length,'Open tasks past their due date','clock','overdue']].map(([l,n,d,icon,target])=>`<button type="button" class="stat stat-link" data-summary="${target}" aria-label="${l}: ${n}. View ${l.toLowerCase()}"><div class="stat-title"><span>${l}</span><span class="stat-icon">${dashboardIcon(icon)}</span></div><b>${n}</b><small>${d}</small><span class="stat-cta">Explore ${target==='people'?'team':'assignments'} <span aria-hidden="true">→</span></span></button>`).join('')}</div>`+
  `<section class="team-section"><div class="section-heading"><div><span class="eyelabel">THE PEOPLE BEHIND THE PROGRESS</span><h2>Your team, at a glance</h2><p>Select a member to explore their work, strengths, and growth.</p></div><button data-add="people">+ Add member</button></div>${memberCards()}</section>`+
 executionVisuals()+
 `<div class="insight-grid">${panel('Delivery pulse',`<div class="pulse"><div class="donut" style="--progress:${progress}%" role="img" aria-label="${progress}% of all assignments complete"><div><b>${progress}%</b><small>complete</small></div></div><div><h3>${done} of ${state.tasks.length} delivered</h3><p>All recorded assignments</p><div class="legend"><span>●</span> ${active.length} still in motion</div></div></div>`)}${panel('Workload balance',state.people.length?`<div class="workloads">${state.people.map(p=>`<button class="workload" data-member="${esc(p.id)}"><span>${esc(p.name)} <small>${esc(capacityLabel(p.capacity))}</small></span><span class="bar-track"><span style="width:${activeTasks(p.id).length/max*100}%"></span></span><b>${activeTasks(p.id).length}</b></button>`).join('')}<p>Active task counts guide a conversation; they do not measure effort or performance.</p></div>`:empty('See the load, share the work','Add members and assignments to compare active work.'))}</div>`+
 `<div class="grid">${panel('Leadership action queue',focus.length?`<div class="action-queue">${focus.map(t=>`<button data-edit="tasks" data-id="${esc(t.id)}"><span class="queue-icon">${t.status==='Blocked'?'⚑':'→'}</span><span><strong>${esc(t.title)}</strong><small>${esc(person(t.person))} · ${t.status==='Blocked'?'Blocked':overdue(t)?'Overdue':'High priority'}${t.due?' · Due '+esc(t.due):''}</small><span class="detail">${esc(t.blocker||t.outcome||'Review the next step and offer support.')}</span></span><span>→</span></button>`).join('')}</div>`:empty('A clear path ahead','No blocked, overdue, or high-priority open tasks. Review priorities with your team.'))}${panel('Check-ins & coaching',`<div class="checkin-list">${checkins.length?checkins.map(p=>`<button data-member="${esc(p.id)}"><span class="avatar">${esc(initials(p.name))}</span><span><strong>${esc(p.name)}</strong><small>${p.checkin<today()?'Past scheduled date':'Scheduled today'} · ${esc(p.checkin)}</small></span><span>→</span></button>`).join(''):'<p>No check-ins scheduled for today or earlier.</p>'}<div class="coaching-prompt"><span class="eyelabel">A BETTER CONVERSATION</span><h3>“What would help you do your best work this week?”</h3><p>Discuss capacity, remove a blocker, and agree one growth action. Save the outcome in their profile.</p></div></div>`,'people')}</div>`+
 panel('Today’s assignments',tasksTable(state.tasks.filter(t=>t.date===today())),'tasks')+panel('Connection & recognition',activitiesList(state.activities.filter(a=>a.status!=='Done').slice(0,3)),'activities');
}

function matchesTaskScope(task,scope){
 return scope==='active'?task.status!=='Done':scope==='overdue'?Boolean(overdue(task)):true;
}
function openSummary(target,status=''){
 filter={date:'',person:'',status:target==='blocked'?'Blocked':status,search:'',scope:target==='overdue'?'overdue':target==='people'||status==='Done'?'':'active'};
 page=target==='people'?'people':'tasks';
 render();
 const title=document.querySelector('#content h1');
 title.setAttribute('tabindex','-1');
 title.focus({preventScroll:true});
 title.scrollIntoView({block:'start',behavior:'instant'});
}
function dashboardIcon(name){
 const paths={people:'<path d="m12 3 9 9-9 9-9-9 9-9Z"/><path d="m12 7 5 5-5 5-5-5 5-5Z"/>',arrow:'<path d="M4 12h16m-5-5 5 5-5 5"/>',flag:'<path d="M5 21V3c5-3 9 4 14 1v10c-5 3-9-4-14-1"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v7h5"/>'};
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
}
function executionVisuals(){
 const statuses=['To do','In progress','Blocked','Done'];
 const days=Array.from({length:7},(_,i)=>{
  const date=new Date();date.setHours(12,0,0,0);date.setDate(date.getDate()+i);
  const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  return {key,label:i===0?'Today':date.toLocaleDateString([],{weekday:'short'}),count:state.tasks.filter(t=>t.status!=='Done'&&t.due===key).length};
 });
 const max=Math.max(1,...days.map(d=>d.count));
 const scheduled=days.reduce((sum,d)=>sum+d.count,0);
 return `<div class="execution-grid">${panel('Execution map',`<div class="execution-map"><div class="visual-caption"><span class="eyelabel">FROM INTENT TO IMPACT</span><span class="live-label">Live workspace</span></div><div class="workflow-nodes">${statuses.map((status,i)=>{const count=state.tasks.filter(t=>t.status===status).length;return `<button class="workflow-node node-${i}" data-task-status="${status}"><span class="node-symbol">${['○','→','⚑','✓'][i]}</span><b>${count}</b><span>${status}</span></button>`;}).join('')}</div><p>Follow the flow of work. Select a stage to review its assignments.</p></div>`)}${panel('Planning horizon',`<div class="horizon"><div class="visual-caption"><span class="eyelabel">NEXT 7 DAYS · OPEN TASKS BY DUE DATE</span><strong>${scheduled} scheduled</strong></div><div class="horizon-chart" role="group" aria-label="Open assignments due over the next seven days: ${days.map(d=>`${d.label} ${d.key}: ${d.count}`).join('; ')}"><div class="chart-grid" aria-hidden="true"></div>${days.map(d=>`<button type="button" class="horizon-column" data-due-date="${d.key}" aria-haspopup="dialog" aria-controls="due-detail" aria-label="View ${d.count} open ${d.count===1?'task':'tasks'} due ${esc(dueDateLabel(d.key))}"><span class="chart-value">${d.count}</span><span class="horizon-track"><span style="height:${d.count/max*100}%"></span></span><span class="chart-day">${d.label}</span><span class="chart-date">${d.key.slice(5)}</span></button>`).join('')}</div><p>${scheduled?'Select a date to see the open tasks due that day.':'No open assignments have due dates in the next seven days.'}</p></div>`)}</div>`;
}

// Keep persisted values compatible with existing backups and Docker-volume records.
function normalizeCapacity(value){return value==='Maximum'?'At capacity':value;}
function capacityLabel(value){return normalizeCapacity(value)==='At capacity'?'Maximum':value||'Not set';}
const quickChoices={capacity:['Balanced','At capacity','Available'],status:['To do','In progress','Blocked','Done'],priority:['Medium','High','Low']};
function cycleControl(kind,item,field){
 const value=field==='capacity'?normalizeCapacity(item[field]):item[field];
 const choices=quickChoices[field],next=choices[(choices.indexOf(value)+1)%choices.length];
 const label=v=>field==='capacity'?capacityLabel(v):v||'Not set';
 const title=field==='capacity'?'Capacity':field==='status'?'Status':'Priority';
 return `<button type="button" class="quick-cycle pill ${esc((value||'').toLowerCase())}" data-cycle="${field}" data-kind="${kind}" data-id="${esc(item.id)}" aria-label="${title} for ${esc(item.name||item.title)}: ${esc(label(value))}. Change to ${esc(label(next))}" title="Click to change to ${esc(label(next))}">${esc(label(value))}<span aria-hidden="true">↻</span></button>`;
}
function inlineText(item,field,label){
 return `<label class="inline-field"><span class="sr-only">${esc(label)} for ${esc(item.name)}</span><textarea class="inline-text" data-inline="${field}" data-kind="people" data-id="${esc(item.id)}" rows="2" maxlength="4000" placeholder="+ Add ${label.toLowerCase()}" aria-label="${esc(label)} for ${esc(item.name)}">${esc(item[field]||'')}</textarea><span class="inline-hint">Saves on leaving · Esc cancels</span></label>`;
}
function inlineDate(kind,item,field,label){
 return `<label class="inline-date-label"><span>${esc(label)}</span><input class="inline-date" type="date" min="0001-01-01" max="9999-12-31" data-inline="${field}" data-kind="${kind}" data-id="${esc(item.id)}" value="${esc(item[field]||'')}" aria-label="${esc(label)} for ${esc(item.name||item.title)}"></label>`;
}
function applyInlineEdit(kind,id,field,value){
 if(!loaded||typeof value!=='string')return false;
 const allowed={people:['capacity','strengths','focus','notes','checkin','checkinTime'],tasks:['status','due','priority']};
 if(!allowed[kind]?.includes(field))return false;
 const item=state[kind].find(item=>item.id===id);if(!item)return false;
 value=value.trim();
 if(field==='checkinTime'&&value&&!TeamspaceState.isTime(value))return false;
 if(quickChoices[field]&&!quickChoices[field].includes(value))return false;
 if(['due','checkin'].includes(field)&&value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'0001-01-01'||value>'9999-12-31')return false;
  const parsed=new Date(value+'T12:00:00Z');
  if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)return false;
 }
 if(value.length>4000||item[field]===value)return false;
 const before={...item};item[field]=value;if(kind==='tasks'&&field==='status')TeamspaceAnalytics.stampCompletion(before,item,today());return true;
}
function cycleInline(button){
 const {kind,id,cycle:field}=button.dataset;
 const item=state[kind]?.find(item=>item.id===id);if(!item)return;
 const choices=quickChoices[field];if(!choices)return;
 const value=field==='capacity'?normalizeCapacity(item[field]):item[field];
 if(!applyInlineEdit(kind,id,field,choices[(choices.indexOf(value)+1)%choices.length]))return;
 const scope=button.closest('dialog')||document.querySelector('#content');
 save();
 const replacement=[...scope.querySelectorAll('[data-cycle]')].find(b=>b.dataset.id===id&&b.dataset.cycle===field);
 replacement?.focus({preventScroll:true});
}
function commitInline(control){
 const {kind,id,inline:field}=control.dataset;
 const changed=applyInlineEdit(kind,id,field,control.value);
 const item=state[kind]?.find(item=>item.id===id);
 if(item)control.value=item[field]||'';
 delete control.dataset.dirty;
 if(changed){save({refresh:false});if(field==='due'||field==='checkin')refreshOverviewInsights();}
}
function refreshOverviewInsights(){
 if(page!=='overview')return;
 const template=document.createElement('template');template.innerHTML=dashboard(()=> '');
 for(const selector of ['.stats','.execution-grid','.insight-grid','.grid']){
  const current=document.querySelector('#content '+selector),fresh=template.content.querySelector(selector);
  if(current&&fresh)current.replaceWith(fresh);
 }
}
document.addEventListener('input',event=>{
 const control=event.target;if(!loaded||!control.dataset.inline)return;
 const item=state[control.dataset.kind]?.find(item=>item.id===control.dataset.id);
 control.dataset.dirty=String(control.value!==(item?.[control.dataset.inline]||''));
});
document.addEventListener('keydown',event=>{
 const control=event.target;if(!loaded||!control.dataset.inline)return;
 if(event.key==='Escape'){
  event.preventDefault();event.stopPropagation();
  const item=state[control.dataset.kind]?.find(item=>item.id===control.dataset.id);
  control.value=item?.[control.dataset.inline]||'';delete control.dataset.dirty;control.blur();
 }else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){
  event.preventDefault();commitInline(control);control.blur();
 }
});

function dueDateLabel(date){
 return new Date(date+'T12:00:00').toLocaleDateString([],{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function tasksDueOn(date){return state.tasks.filter(task=>task.due===date&&task.status!=='Done');}
function openDueDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date+'T12:00:00').getTime()))return;
 selectedDue=date;renderDueDetails();
 const dialog=document.querySelector('#due-detail');if(typeof DerqWorkspace!=='undefined')DerqWorkspace.showDetail(dialog,{kind:'due',id:date});else if(!dialog.open)dialog.showModal();
}
function renderDueDetails(){
 const tasks=tasksDueOn(selectedDue);
 document.querySelector('#due-content').innerHTML=`<div class="due-heading"><span class="eyelabel">PLANNING HORIZON / DUE TASKS</span><h2 id="due-title">Due <time datetime="${esc(selectedDue)}">${esc(dueDateLabel(selectedDue))}</time></h2><p>${tasks.length} open ${tasks.length===1?'assignment':'assignments'} · Select status or priority to update it.</p></div>${tasks.length?`<div class="due-task-list">${tasks.map(task=>`<article class="due-task"><div class="due-task-heading"><h3>${esc(task.title)}</h3><button type="button" data-due-edit="${esc(task.id)}" aria-label="Edit task ${esc(task.title)}">Edit task</button></div><dl class="due-task-facts"><div><dt>Assigned to</dt><dd>${esc(person(task.person))}</dd></div><div><dt>Work date</dt><dd>${esc(task.date||'Not set')}</dd></div><div><dt>Due date</dt><dd>${esc(task.due)}</dd></div></dl><div class="due-task-controls">${cycleControl('tasks',task,'status')}${cycleControl('tasks',task,'priority')}</div><div class="due-task-note"><h4>Success criteria / expected impact</h4><p>${esc(task.outcome||'Not recorded')}</p></div><div class="due-task-note"><h4>Blockers / support needed</h4><p>${esc(task.blocker||'None recorded')}</p></div></article>`).join('')}</div>`:empty('No open tasks due on this date','Completed tasks are excluded, matching the planning chart.')}`;
}

function newRecord(kind,data){const record={...data,id:TeamspaceIds.createId(),...(kind==='tasks'?{createdDate:today()}:{})};if(kind==='tasks')TeamspaceAnalytics.stampCompletion(null,record,today());return record;}
