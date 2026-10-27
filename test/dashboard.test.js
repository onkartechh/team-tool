const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
function app(data){
 const elements=new Map();
 const element=selector=>{if(!elements.has(selector))elements.set(selector,{textContent:'',innerHTML:'',showModal(){this.open=true;}});return elements.get(selector);};
 const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],getElementById:element,addEventListener(){}},window:{addEventListener(){}},fetch:()=>new Promise(()=>{}),setInterval(){},Intl,Date,crypto:require('node:crypto').webcrypto});
 for(const file of ['../analytics.js','../state.js','../calendar.js','../ids.js','../app.js'])vm.runInContext(readFileSync(require.resolve(file),'utf8'),context);
 context.fixture=data;vm.runInContext('state=fixture',context);
 return {run:code=>vm.runInContext(code,context),element,setFetch:fetch=>{context.fetch=fetch;}};
}
test('member profile shows active work and exactly four most recent dated assignments',()=>{
 const fixture={people:[{id:'p1',name:'Alex',strengths:'Mentoring & ownership'}],tasks:Array.from({length:6},(_,i)=>({id:'t'+i,title:'Task '+i,person:'p1',date:'2026-01-0'+(i+1),status:i===5?'Blocked':'Done'})),activities:[]};
 // Imported backups can arrive in any array order.
 fixture.tasks.reverse();
 const view=app(fixture);view.run("openMember('p1')");
 const html=view.element('#member-content').innerHTML;
 assert.ok(html.includes('Mentoring &amp; ownership'));
 const timeline=html.split('<ol class="timeline">')[1].split('</ol>')[0];
 assert.equal((timeline.match(/<li>/g)||[]).length,4);
 assert.ok(timeline.indexOf('Task 5')<timeline.indexOf('Task 4'));
 assert.ok(timeline.includes('2026-01-06'));
 assert.ok(!timeline.includes('Task 1'));
 assert.equal((html.match(/class="profile-task"/g)||[]).length,1);
 assert.equal(view.element('#member-detail').open,true);
});
test('dashboard handles empty workspaces without invented progress or people',()=>{
 const view=app({people:[],tasks:[],activities:[]});
 const html=view.run("dashboard(()=> '')");
 assert.ok(html.includes('0%'));
 assert.ok(html.includes('Add your first member'));
 assert.ok(!html.includes('NaN'));
});
test('member-provided text is escaped in cards, action queues, and profiles',()=>{
 const view=app({people:[{id:'p1',name:'<script>alert(1)</script>',strengths:'<img src=x onerror=alert(1)>'}],tasks:[{id:'t1',person:'p1',title:'<svg onload=alert(1)>',status:'Blocked',priority:'High',date:'2026-01-01'}],activities:[]});
 const html=view.run("dashboard(()=> '')");
 assert.ok(!html.includes('<script>'));
 assert.ok(!html.includes('<svg onload'));
 view.run("openMember('p1')");
 assert.ok(!view.element('#member-content').innerHTML.includes('<img'));
});
test('summary navigation resets old filters and selects matching assignments',()=>{
 const view=app({people:[],tasks:[],activities:[]});
 view.element('#content h1').setAttribute=()=>{};
 view.element('#content h1').focus=()=>{};
 view.element('#content h1').scrollIntoView=()=>{};
 view.run("filter={date:'2020-01-01',person:'old',status:'Done',search:'old'};openSummary('overdue')");
 assert.equal(view.run('page'),'tasks');
 assert.equal(view.run('filter.scope'),'overdue');
 assert.equal(view.run('filter.date+filter.person+filter.search+filter.status'),'');
 assert.equal(view.run("matchesTaskScope({status:'Done',due:'2000-01-01'},filter.scope)"),false);
 assert.equal(view.run("matchesTaskScope({status:'Blocked',due:'2000-01-01'},filter.scope)"),true);
 view.run("openSummary('blocked')");
 assert.equal(view.run('filter.status'),'Blocked');
 assert.equal(view.run('filter.scope'),'active');
 view.run("openSummary('active')");
 assert.equal(view.run("matchesTaskScope({status:'Done'},filter.scope)"),false);
 view.run("openSummary('active','Done')");
 assert.equal(view.run('filter.scope'),'');
 assert.equal(view.run('filter.status'),'Done');
 view.run("openSummary('people')");
 assert.equal(view.run('page'),'people');
});
test('all summary tiles and workflow stages have accessible button actions',()=>{
 const view=app({people:[],tasks:[],activities:[]});
 const html=view.run("dashboard(()=> '')");
 for(const target of ['people','active','blocked','overdue'])assert.ok(html.includes(`data-summary="${target}"`));
 for(const status of ['To do','In progress','Blocked','Done'])assert.ok(html.includes(`data-task-status="${status}"`));
 assert.ok(html.includes('No open assignments have due dates in the next seven days.'));
});
test('planning chart counts only open assignments due within its seven-day window',()=>{
 const view=app({people:[],tasks:[],activities:[]});
 view.run("state.tasks=[{id:'1',title:'Open today',status:'To do',due:today()},{id:'2',title:'Already done',status:'Done',due:today()},{id:'3',title:'Old',status:'Blocked',due:'2000-01-01'},{id:'4',title:'Undated',status:'To do'}]");
 const html=view.run('executionVisuals()');
 assert.ok(html.includes('1 scheduled'));
 assert.ok(html.includes('Today '+view.run('today()')+': 1'));
 assert.ok(!html.includes('No open assignments have due dates'));
});

test('quick edits preserve record identity, legacy fields, and unrelated data',()=>{
 const fixture={people:[{id:'p1',name:'Alex',capacity:'Balanced',notes:'Keep me',legacy:'custom'}],tasks:[{id:'t1',title:'Ship',status:'To do',due:'2026-01-01',person:'p1',outcome:'Existing impact'}],activities:[]};
 const view=app(fixture);view.run('loaded=true');
 assert.equal(view.run("applyInlineEdit('people','p1','strengths','  Mentoring & ownership  ')"),true);
 assert.equal(fixture.people[0].strengths,'Mentoring & ownership');
 assert.equal(view.run("applyInlineEdit('people','p1','capacity','At capacity')"),true);
 assert.equal(view.run("capacityLabel(state.people[0].capacity)"),'Maximum');
 assert.equal(view.run("applyInlineEdit('tasks','t1','status','In progress')"),true);
 assert.equal(view.run("applyInlineEdit('tasks','t1','due','')"),true);
 assert.equal(fixture.people[0].legacy,'custom');
 assert.equal(fixture.people[0].notes,'Keep me');
 assert.equal(fixture.tasks[0].outcome,'Existing impact');
 assert.equal(fixture.tasks[0].person,'p1');
 assert.equal(view.run("applyInlineEdit('tasks','t1','title','Overwrite')"),false);
 assert.equal(view.run("applyInlineEdit('tasks','missing','due','2026-02-01')"),false);
 for(const due of ['2026-02-30','not a date','0000-01-01'])assert.equal(view.run(`applyInlineEdit('tasks','t1','due','${due}')`),false);
 assert.equal(view.run("applyInlineEdit('tasks','t1','status','invented')"),false);
 view.run('loaded=false');
 assert.equal(view.run("applyInlineEdit('people','p1','focus','Cannot edit before load')"),false);
});
test('rapid quick edits keep the saving indicator until the final revision is stored',async()=>{
 const view=app({people:[{id:'p1',name:'Alex',capacity:'Balanced'}],tasks:[],activities:[]});
 const requests=[],releases=[];
 view.setFetch((url,options)=>{requests.push(options);return new Promise(resolve=>releases.push(resolve));});
 view.run("loaded=true;revision='first';applyInlineEdit('people','p1','capacity','At capacity');save({refresh:false});applyInlineEdit('people','p1','capacity','Available');save({refresh:false})");
 await new Promise(setImmediate);
 assert.equal(requests.length,1);
 releases[0]({ok:true,headers:{get:()=> 'second'}});
 await new Promise(setImmediate);
 assert.equal(requests.length,2);
 assert.equal(requests[1].headers['If-Match'],'second');
 assert.equal(JSON.parse(requests[1].body).people[0].capacity,'Available');
 assert.equal(view.element('.local-badge').textContent,'● Saving…');
 releases[1]({ok:true,headers:{get:()=> 'third'}});
 await view.run('saveQueue');
 assert.equal(view.element('.local-badge').textContent,'● Saved to server');
});
test('a quick-edit conflict retains local edits and never reports subsequent edits as saved',async()=>{
 const view=app({people:[{id:'p1',name:'Alex',capacity:'Balanced'}],tasks:[],activities:[]});
 let writes=0;view.setFetch(async()=>{writes++;return {ok:false,status:409};});
 view.run("loaded=true;applyInlineEdit('people','p1','capacity','At capacity');save({refresh:false})");
 await view.run('saveQueue');
 view.run("applyInlineEdit('people','p1','strengths','Local edit to export');save({refresh:false})");
 await view.run('saveQueue');
 assert.equal(writes,1);
 assert.equal(view.run('state.people[0].strengths'),'Local edit to export');
 assert.equal(view.element('.local-badge').textContent,'● Unsaved changes');
 assert.match(view.element('#notice').textContent,/Another session/);
});
test('planning date details match due dates rather than work dates and exclude completed tasks',()=>{
 const view=app({people:[{id:'p1',name:'Devendra'}],tasks:[
  {id:'due',title:'Due task <check>',person:'p1',date:'2026-10-01',due:'2026-10-28',status:'Blocked',priority:'High',outcome:'Checks pass',blocker:'Awaiting access'},
  {id:'unassigned',title:'Unassigned task',due:'2026-10-28',status:'To do'},
  {id:'wrong',title:'Different due date',date:'2026-10-28',due:'2026-10-29',status:'To do'},
  {id:'done',title:'Completed task',due:'2026-10-28',status:'Done'}
 ],activities:[]});
 view.run("openDueDate('2026-10-28')");
 assert.equal(view.element('#due-detail').open,true);
 const html=view.element('#due-content').innerHTML;
 for(const text of ['2 open assignments','Due task &lt;check&gt;','Devendra','2026-10-01','Checks pass','Awaiting access','Unassigned'])assert.ok(html.includes(text),text);
 for(const text of ['Different due date','Completed task','<check>'])assert.ok(!html.includes(text),text);
 view.run("loaded=true;applyInlineEdit('tasks','due','status','Done');renderDueDetails()");
 assert.ok(view.element('#due-content').innerHTML.includes('1 open assignment'));
 assert.ok(!view.element('#due-content').innerHTML.includes('Due task &lt;check&gt;'));
});
test('all seven planning dates are accessible buttons, including empty dates',()=>{
 const view=app({people:[],tasks:[],activities:[]});
 const html=view.run('executionVisuals()');
 const dates=[...html.matchAll(/data-due-date="(\d{4}-\d{2}-\d{2})"/g)].map(match=>match[1]);
 assert.equal(dates.length,7);assert.equal(new Set(dates).size,7);
 assert.ok(html.includes('role="group"'));
 assert.ok(html.includes('View 0 open tasks due'));
 view.run(`openDueDate('${dates[0]}')`);
 assert.ok(view.element('#due-content').innerHTML.includes('No open tasks due on this date'));
});

test('leave calendar aligns complete weeks and handles leap years and year boundaries',()=>{
 const view=app({people:[],tasks:[],activities:[]});
 const october=JSON.parse(view.run('JSON.stringify(monthDates(2026,9))'));
 assert.equal(october.length,42);assert.equal(october[0].key,'2026-09-28');assert.equal(october[3].key,'2026-10-01');
 assert.equal(october.filter(day=>day.inMonth).length,31);
 assert.equal(view.run('monthDates(2024,1).filter(day=>day.inMonth).length'),29);
 assert.ok(view.run("monthDates(2026,11).some(day=>day.key==='2027-01-01')"));
});
test('leave selection persists multiple members without touching other dates or legacy fields',()=>{
 const fixture={people:[{id:'p1',name:'Alex'},{id:'p2',name:'Sam'}],tasks:[],activities:[],leaves:[{id:'old',date:'2026-10-24',person:'p1',name:'Alex',extra:'Keep'},{id:'other',date:'2026-11-01',person:'p2',name:'Sam'}]};
 const view=app(fixture);view.run('loaded=true');
 assert.equal(view.run("setLeaveMembers('2026-10-24',['p1','p2','p2'])"),true);
 assert.equal(fixture.leaves.length,3);
 assert.equal(fixture.leaves.find(leave=>leave.id==='old').extra,'Keep');
 assert.equal(fixture.leaves.find(leave=>leave.id==='other').date,'2026-11-01');
 assert.equal(view.run("setLeaveMembers('2026-10-24',['p1','p2'])"),false);
 assert.equal(view.run("setLeaveMembers('2026-10-24',['unknown'])"),false);
 assert.equal(view.run("setLeaveMembers('2026-02-30',['p1'])"),false);
 assert.equal(view.run("setLeaveMembers('2026-10-24',[])"),true);
 assert.equal(fixture.leaves.length,1);assert.equal(fixture.leaves[0].id,'other');
});
test('daily alert thresholds ignore same-day creation and completed or other-day tasks',()=>{
 const fixture={people:[],activities:[],tasks:[]},view=app(fixture),day='2026-10-24';
 const summary=()=>JSON.parse(view.run(`JSON.stringify(dueTodaySummary('${day}'))`));
 assert.equal(summary().level,'green');
 fixture.tasks=Array.from({length:4},(_,i)=>({id:'new'+i,title:'New',due:day,date:'2026-10-01',createdDate:day,status:'To do'}));
 assert.equal(summary().tasks.length,4);assert.equal(summary().level,'green');
 fixture.tasks.push({id:'old1',title:'Old',due:day,date:day,createdDate:'2026-10-23',status:'Blocked'});
 assert.equal(summary().level,'orange');assert.equal(summary().attention,1);
 fixture.tasks.push({id:'old2',title:'Legacy',due:day,date:'2026-10-23',status:'To do'});
 assert.equal(summary().level,'orange');assert.equal(summary().attention,2);
 fixture.tasks.push({id:'old3',title:'Unknown creation',due:day,status:'To do'});
 assert.equal(summary().level,'red');
 fixture.tasks.push({id:'done',title:'Done',due:day,createdDate:'2026-10-01',status:'Done'},{id:'future',title:'Future',due:'2026-10-25',createdDate:'2026-10-01',status:'To do'});
 assert.equal(summary().attention,3);assert.equal(summary().tasks.length,7);
});
test('one-to-one reminders show only today, ordered by time, and flag the next 15 minutes',()=>{
 const view=app({people:[{id:'p1',name:'Late',checkin:'2026-10-24',checkinTime:'15:00'},{id:'p2',name:'Early',checkin:'2026-10-24',checkinTime:'09:30'},{id:'p3',name:'Unscheduled time',checkin:'2026-10-24'},{id:'p4',name:'Tomorrow',checkin:'2026-10-25',checkinTime:'10:00'}],tasks:[],activities:[]});
 assert.equal(view.run("todaysMeetings('2026-10-24').map(p=>p.name).join(',')"),'Early,Late,Unscheduled time');
 assert.equal(view.run("meetingTiming({checkinTime:'09:30'},new Date(2026,9,24,9,15))"),'Starting soon');
 assert.equal(view.run("meetingTiming({checkinTime:'09:30'},new Date(2026,9,24,9,30))"),'Starting now');
 assert.equal(view.run("meetingTiming({checkinTime:'09:30'},new Date(2026,9,24,10,0))"),'Earlier today');
 view.run('loaded=true');
 assert.equal(view.run("applyInlineEdit('people','p1','checkinTime','25:00')"),false);
 assert.equal(view.run("applyInlineEdit('people','p1','checkinTime','10:15')"),true);
});
test('new tasks capture creation independently of assignment dates and quick edits preserve it',()=>{
 const view=app({people:[],tasks:[],activities:[]});
 view.run("loaded=true;state.tasks.push(newRecord('tasks',{title:'Backdated work',date:'2020-01-01',due:today(),status:'To do'}))");
 assert.equal(view.run('state.tasks[0].createdDate'),view.run('today()'));
 assert.equal(view.run('dueTodaySummary().level'),'green');
 view.run("applyInlineEdit('tasks',state.tasks[0].id,'status','In progress')");
 assert.equal(view.run('state.tasks[0].createdDate'),view.run('today()'));
});

test('Connections routes to the integration view and does not fall through to leadership analytics',()=>{
 const view=app({people:[],tasks:[],activities:[]});
 view.run("globalThis.DerqLeadership={page(){throw Error('Wrong page handler');},afterRender(){}};globalThis.DerqIntegrations={page(){return '<h1>Connected work</h1>';},afterRender(){}};page='connections';render()");
 assert.equal(view.element('#content').innerHTML,'<h1>Connected work</h1>');assert.equal(view.element('#breadcrumb').textContent,'Connections');
});
