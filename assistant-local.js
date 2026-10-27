const {isDay,isTime}=require('./state');
class Clarification extends Error{}
const ask=message=>{throw new Clarification(message);};
const normal=value=>String(value).normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g,' ');
const unquote=value=>value.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/,(_,a,b)=>a??b).trim();
const action=(kind,id='',patch={},dates=[],page='')=>({kind,id,changes:Object.entries(patch).map(([field,value])=>({field,value})),dates,page});
const result=(message,...actions)=>({message,actions});
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const dayKey=date=>date.toISOString().slice(0,10);
function addDays(day,count){const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+count);return dayKey(date);}
function dateValue(text,today){
 let value=normal(text).replace(/^on\s+/,'').replace(/(\d)(st|nd|rd|th)\b/g,'$1').replace(/,\s*(?=\d{4}\b)/g,' ');
 if(value==='today')return today;
 if(value==='tomorrow')return addDays(today,1);
 if(value==='day after tomorrow')return addDays(today,2);
 if(isDay(value))return value;
 if(/\d\s*[\/]\s*\d/.test(value))ask('Please use YYYY-MM-DD or a month name, for example 2026-10-28 or October 28. Numeric dates with slashes can be ambiguous.');
 const weekday=/^(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/.exec(value);
 if(weekday){let offset=(weekdays.indexOf(weekday[2])-new Date(today+'T12:00:00Z').getUTCDay()+7)%7;if(weekday[1]&&!offset)offset=7;return addDays(today,offset);}
 let match=/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/.exec(value),month,number,year;
 if(match){month=match[1];number=match[2];year=match[3];}
 else if((match=/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/.exec(value))){number=match[1];month=match[2];year=match[3];}
 if(month){
  const index=months.findIndex(name=>name===month||name.slice(0,3)===month);
  if(index>=0){
   const key=year=>`${year}-${String(index+1).padStart(2,'0')}-${String(number).padStart(2,'0')}`;
   let selected=key(year||today.slice(0,4));
   if(!isDay(selected))ask(`“${text.trim()}” is not a valid calendar date. Please include a valid date and year.`);
   if(!year&&selected<today)selected=key(Number(today.slice(0,4))+1);
   if(isDay(selected))return selected;
  }
 }
 ask(`I couldn’t read the date “${text.trim()}”. Use YYYY-MM-DD, a named date such as October 28, today, tomorrow, or a weekday.`);
}
function dateList(text,today){
 const value=text.trim().replace(/^(?:on|from|for)\s+/i,'');
 const range=/^(.+?)\s+(?:to|through|until)\s+(.+)$/i.exec(value);
 if(range){
  const first=dateValue(range[1],today),last=dateValue(range[2],today);if(last<first)ask('The leave end date is before the start date. Please include both dates and years.');
  const days=[];for(let date=first;date<=last;date=addDays(date,1)){days.push(date);if(days.length>90)ask('Please mark no more than 90 leave dates in one command.');}return days;
 }
 const parts=value.replace(/(\b[a-z]+\s+\d{1,2}),\s*(\d{4}\b)/gi,'$1 $2').replace(/,\s+and\s+/gi,' and ').split(/\s*(?:,|\band\b|&)\s*/i);
 if(parts.some(part=>!part.trim())||parts.length>90)ask('Please provide every leave date, for example: Mark Maya on leave on 2026-10-26 and 2026-10-28.');
 return [...new Set(parts.map(part=>dateValue(part,today)))];
}
function timeValue(text){
 const match=/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text.trim());
 if(!match||!match[2]&&!match[3])ask('Please include a clear time, for example 10:30 AM or 14:30.');
 let hour=Number(match[1]),minute=Number(match[2]||0);
 if(match[3]){if(hour<1||hour>12)ask('Use a valid 12-hour time with AM/PM.');hour=hour%12+(match[3].toLowerCase()==='pm'?12:0);}
 const time=String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');if(!isTime(time))ask('Please use a valid time, for example 10:30 AM or 14:30.');return time;
}
function resolveRecord(items,reference,label){
 let name=unquote(reference),role='';
 const exact=items.filter(item=>normal(item.name||item.title||'')===normal(name)||item.id===name||'#'+item.id===name);
 if(exact.length===1)return exact[0];
 if(!exact.length)name=name.replace(/^(?:the\s+)?(?:team\s+)?(?:member|person|task|activity)\s+/i,'').trim();
 const qualified=label==='member'&&/^(.+?)\s+\((.+)\)$/.exec(name);if(qualified){name=unquote(qualified[1]);role=normal(qualified[2]);}
 const key=normal(name);
 let matches=items.filter(item=>(normal(item.name||item.title||'')===key||item.id===name||'#'+item.id===name)&&(!role||normal(item.role||'')===role));
 if(!matches.length&&label==='member')matches=items.filter(item=>normal(item.name).startsWith(key+' ')&&(!role||normal(item.role||'')===role));
 if(matches.length===1)return matches[0];
 if(matches.length>1)ask(`More than one ${label} matches “${name}”: ${matches.map(item=>(item.name||item.title)+(item.role?' ('+item.role+')':'')).join('; ')}. Please use the full name and role, or the exact record ID.`);
 ask(`I couldn’t find a ${label} named “${name}”. Please use an existing ${label}’s full name${label==='task'?' or exact quoted task title':''}.`);
}
function member(state,name){return resolveRecord(state.people,name,'member');}
function record(state,entity,reference){
 const collection=entity==='task'?'tasks':entity==='activity'?'activities':'people';
 const owner=/^(?:"([^"]+)"|'([^']+)'|([^"'].+?))\s+for\s+(.+)$/i.exec(reference);
 if(entity==='task'&&owner){const p=member(state,owner[4]);return resolveRecord(state.tasks.filter(t=>t.person===p.id),owner[1]||owner[2]||owner[3],'task');}
 return resolveRecord(state[collection],reference,entity);
}
function memberDates(text,state,today){
 // Try every word boundary, accepting only a member reference plus a fully parsed date list.
 const candidates=[...text.matchAll(/\s+/g)].map(match=>match.index).reverse();let dateError,memberError;
 for(const at of candidates){
  const name=text.slice(0,at).trim(),dateText=text.slice(at).trim();
  let p;try{p=member(state,name);}catch(error){memberError=error;continue;}
  try{return {person:p,dates:dateList(dateText,today)};}catch(error){dateError=error;}
 }
 if(dateError)throw dateError;
 if(memberError&&/More than one/.test(memberError.message))throw memberError;
 ask('Please give a full member name and explicit dates. Example: Mark Maya Rao on leave on 2026-10-26 and 2026-10-28.');
}
const capacities={available:'Available',free:'Available',balanced:'Balanced',normal:'Balanced',maximum:'At capacity',max:'At capacity','at capacity':'At capacity',full:'At capacity'};
const priorities={low:'Low',medium:'Medium',normal:'Medium',high:'High',urgent:'High'};
const statuses={'to do':'To do',todo:'To do','to-do':'To do',pending:'To do','not started':'To do',ongoing:'In progress','in progress':'In progress','in-progress':'In progress',blocked:'Blocked',done:'Done',complete:'Done',completed:'Done',finished:'Done'};
const activityTypes={'team bonding':'Team bonding',learning:'Learning',recognition:'Recognition',retrospective:'Retrospective','team improvement':'Team improvement'};
function enumValue(map,value,label){const key=normal(value);if(!Object.hasOwn(map,key))ask(`Choose a supported ${label}: ${[...new Set(Object.values(map))].join(', ')}.`);return map[key];}
function taskTitle(text){
 const value=text.trim();let match=/^(?:"([^"]+)"|'([^']+)')(.*)$/.exec(value);
 if(match)return {title:match[1]||match[2],tail:match[3].trim()};
 match=/^(.+?)(\s+(?:to|for|due|on)\s+.+)$/.exec(value);
 if(match)return {title:match[1].trim(),tail:match[2].trim()};
 ask('Put the task or activity title in quotes. Example: Assign "Deployment checklist" to Maya Rao, due tomorrow, high priority.');
}
function createWork(entity,text,state,today,forceCreate){
 const parsed=taskTitle(text),patch={title:parsed.title};let rest=parsed.tail.replace(/^,\s*/,'');
 const priority=/(?:^|[,\s]+)(?:(low|medium|normal|high|urgent)\s+priority|priority\s+(low|medium|normal|high|urgent))$/i.exec(rest);
 if(priority){if(entity!=='task')ask('Activities do not have a priority field.');patch.priority=enumValue(priorities,priority[1]||priority[2],'priority');rest=rest.slice(0,priority.index).trim().replace(/,$/,'').trim();}
 const type=/(?:^|,\s*)type\s+(.+)$/i.exec(rest);
 if(type){if(entity!=='activity')ask('Use a type only for team activities.');patch.type=enumValue(activityTypes,type[1],'activity type');rest=rest.slice(0,type.index).trim().replace(/,$/,'').trim();}
 const dateMatch=/(?:^|\s*,?\s+)(due|on)\s+(.+)$/i.exec(rest);
 if(dateMatch){const dates=dateList(dateMatch[2],today);if(dates.length!==1)ask('Use one date for a task or activity.');patch[entity==='task'?'due':'date']=dates[0];rest=rest.slice(0,dateMatch.index).trim().replace(/,$/,'').trim();}
 if(rest){const owner=/^(?:to|for|owner)\s+(.+)$/i.exec(rest);if(!owner)ask('Use this format: Assign "Deployment checklist" to Maya Rao, due tomorrow, high priority.');patch.person=member(state,owner[1]).id;}
 if(!forceCreate&&entity==='task'){
  const existing=state.tasks.filter(t=>normal(t.title)===normal(patch.title));
  if(existing.length){const item=record(state,'task',patch.title);return result('',action('update_task',item.id,patch));}
 }
 return result('',action('create_'+entity,'',patch));
}
function help(today){return `Built-in command mode works without an API key. Use one command at a time. Examples:\n• Add Maya Rao as a Deployment and Configuration Engineer\n• Mark Maya Rao on leave on ${today} and ${addDays(today,1)}\n• Remove leave for Maya Rao on ${today}\n• Assign "Deployment checklist" to Maya Rao, due tomorrow, high priority\n• Set task "Deployment checklist" status to done\n• Set task "Deployment checklist" due date to tomorrow\n• Set Maya Rao's capacity to maximum\n• Set strengths for Maya Rao to mentoring and troubleshooting\n• Schedule a one-to-one with Maya Rao tomorrow at 10:30 AM\n• Plan activity "Team lunch" for Maya Rao on tomorrow, type Team bonding\n• Append a note for Maya Rao: Lead the next handover\n• Show tasks due tomorrow / Show Maya Rao's profile\n• Open calendar / Export backup / Import backup\nUse YYYY-MM-DD or named months for dates. Leave ranges with “from … to …” include both endpoints. Names must match existing members; duplicate names need a role in parentheses. This is a command parser, not a general AI chatbot.`;}
function parseCommand({message,today,state}){
 if(!isDay(today))return result('Please reload the page so I can use a valid local date.');
 let text=String(message).trim().replace(/[.!?]+$/,'').replace(/[’‘]/g,"'");
 for(let i=0;i<4;i++)text=text.replace(/^(?:please|kindly|can you|could you|would you|go ahead and|i want you to)\s+/i,'');
 const prefix=text.split(':')[0];
 if(/^(?:don't|do not|never|how (?:do|can)|how to|what if|for example|example|if\b)/i.test(text))return result('No changes made. To request an action, use a direct command. Type “help” for supported examples.');
 if(/[;\n]/.test(text)||/\b(?:and|then)\s+(?:add|create|delete|remove|mark|set|assign|schedule|update)\b/i.test(prefix))return result('Please send one command at a time. No changes were made. Type “help” for examples.');
 try{
  let match;
  if(/^(?:help|examples|what can you do|show commands)$/i.test(text))return result(help(today));
  if(/^undo$/i.test(text))return result('Use the “Undo this change” button under the last saved command. Undo stops if there are newer edits.');
  if(/^(?:export|download)(?: a)? backup$/i.test(text))return result('Preparing your workspace backup download.',action('export_backup'));
  if(/^(?:import|restore)(?: a)? backup$/i.test(text))return result('Choose a backup file. You will confirm before current records are replaced.',action('import_backup'));
  const destinations={overview:'overview','command center':'overview',team:'people',people:'people','team & growth':'people',tasks:'tasks','daily tasks':'tasks',activities:'activities','team connection':'activities',calendar:'calendar','team activity':'activity','dependency map':'activity','leave impact':'impact',connections:'connections',integrations:'connections',presentation:'presentation'};
  if((match=/^(?:open|go to|show)\s+(?:the\s+)?(.+)$/i.exec(text))&&Object.hasOwn(destinations,normal(match[1])))return result('Opened '+match[1]+'.',action('navigate','',{},[],destinations[normal(match[1])]));
  if(/^(?:how many (?:team )?members(?: are there)?|team size)$/i.test(text))return result(`${state.people.length} team member${state.people.length===1?'':'s'}.`);
  if((match=/^(?:show|list|who are)(?: the)?\s+team members$/i.exec(text)))return result(state.people.length?state.people.map(p=>p.name+(p.role?' — '+p.role:'')).join('\n'):'No team members yet.',action('navigate','',{},[],'people'));
  if(/^(?:show|list)(?: me)?\s+(?:today'?s?|due today)\s+(?:due\s+)?tasks$/i.test(text))return result('Showing open tasks due today.',action('view_due','',{},[today]));
  if((match=/^(?:show|list)(?: me)?\s+(?:the\s+)?tasks due\s+(.+)$/i.exec(text))){const dates=dateList(match[1],today);if(dates.length!==1)ask('Choose one due date to view.');return result('Showing open tasks due '+dates[0]+'.',action('view_due','',{},dates));}
  if((match=/^show\s+(.+?)(?:'s)?\s+profile$/i.exec(text))){const p=member(state,match[1]);return result('Opened '+p.name+'’s profile.',action('view_member',p.id));}
  if((match=/^(?:who is|who's|show who is)\s+(?:on leave|off)\s+(.+)$/i.exec(text))){const dates=dateList(match[1],today);return result(dates.map(date=>{const names=(state.leaves||[]).filter(l=>l.date===date).map(l=>state.people.find(p=>p.id===l.person)?.name||l.name||'Former member');return date+': '+(names.join(', ')||'No leave recorded');}).join('\n'));}
  if((match=/^(?:append|add)(?: a)?\s+note for activity\s+(.+?):\s*(.+)$/i.exec(text))){const item=record(state,'activity',match[1]);return result('',action('append_activity_note',item.id,{notes:match[2]}));}
  if((match=/^(?:append|add)(?: a)?\s+(?:coaching\s+)?note for\s+(.+?):\s*(.+)$/i.exec(text))){const p=member(state,match[1]);return result('',action('append_member_note',p.id,{notes:match[2]}));}
  if((match=/^(?:mark|put)\s+(.+?)\s+(?:on leave|off)\s+(.+)$/i.exec(text))||(match=/^(.+?)\s+(?:is|will be)\s+(?:on leave|off)\s+(.+)$/i.exec(text))){const p=member(state,match[1]);return result('',action('set_leave',p.id,{},dateList(match[2],today)));}
  if((match=/^(?:add|record|mark)\s+leave for\s+(.+)$/i.exec(text))){const parsed=memberDates(match[1],state,today);return result('',action('set_leave',parsed.person.id,{},parsed.dates));}
  if((match=/^(?:remove|cancel|clear)\s+leave for\s+(.+)$/i.exec(text))||(match=/^(?:remove|cancel)\s+(.+?)'s leave\s+(.+)$/i.exec(text))){const parsed=match.length===3?{person:member(state,match[1]),dates:dateList(match[2],today)}:memberDates(match[1],state,today);return result('',action('remove_leave',parsed.person.id,{},parsed.dates));}
  if((match=/^(?:schedule|plan|set)(?: a)?\s+(?:one[- ](?:to[- ])?one|1:1|1-on-1|check[- ]?in)\s+(?:with|for)\s+(.+)\s+at\s+(.+)$/i.exec(text))){const parsed=memberDates(match[1],state,today);if(parsed.dates.length!==1)ask('Choose one date for this one-to-one.');return result('',action('update_member',parsed.person.id,{checkin:parsed.dates[0],checkinTime:timeValue(match[2])}));}
  if((match=/^(?:set|change|update)\s+(task|activity)\s+(.+?)\s+(title|status|priority|due date|work date|date|owner|blocker|outcome|notes|type)\s+(?:to|:)\s*(.+)$/i.exec(text))){return updateRecord(match[1],['',match[2],match[3],match[4]],state,today);}
  if((match=/^(?:set|change|update)\s+(title|status|priority|due date|work date|date|owner|blocker|outcome|notes|type)\s+(?:for|of)\s+(task|activity)\s+(.+?)\s+(?:to|:)\s*(.+)$/i.exec(text))){return updateRecord(match[2],['',match[3],match[1],match[4]],state,today);}
  if((match=/^(?:mark|set)\s+(?:task\s+)?(.+?)\s+(?:as\s+)?(done|complete|completed|blocked|ongoing|in progress|to do)$/i.exec(text))){const item=record(state,'task',match[1]);return result('',action('update_task',item.id,{status:enumValue(statuses,match[2],'status')}));}
  const fieldMap={role:'role',name:'name',strength:'strengths',strengths:'strengths',focus:'focus','growth focus':'focus','coaching focus':'focus',capacity:'capacity',notes:'notes','check-in date':'checkin','check-in time':'checkinTime'};
  if((match=/^(?:set|change|update)\s+(role|name|strengths?|growth focus|coaching focus|focus|capacity|notes|check-in date|check-in time)\s+for\s+(.+?)\s+(?:to|:)\s*(.+)$/i.exec(text))){return updateMember(match[2],fieldMap[normal(match[1])],match[3],state,today);}
  if((match=/^(?:set|change|update)\s+(.+?)(?:'s)\s+(role|name|strengths?|growth focus|coaching focus|focus|capacity|notes|check-in date|check-in time)\s+(?:to|:)\s*(.+)$/i.exec(text))){return updateMember(match[1],fieldMap[normal(match[2])],match[3],state,today);}
  if((match=/^(?:delete|remove)\s+(member|task|activity)\s+(.+)$/i.exec(text))){const entity=normal(match[1]),item=record(state,entity,match[2]);return result('',action('delete_'+entity,item.id));}
  if((match=/^(?:assign)\s+(.+)$/i.exec(text)))return createWork('task',match[1].replace(/^task\s+/i,''),state,today,false);
  if((match=/^(?:add|create)(?: a| new)?\s+task\s+(.+)$/i.exec(text)))return createWork('task',match[1],state,today,true);
  if((match=/^(?:add|create|plan)(?: a| new)?\s+activity\s+(.+)$/i.exec(text)))return createWork('activity',match[1],state,today,true);
  if((match=/^(?:add|create)(?: a| an)?\s+(?:(?:team )?member\s+)?(.+?)\s+(?:as|with (?:the )?role(?: of)?)\s+(?:(?:a|an)\s+)?(.+)$/i.exec(text))){const name=unquote(match[1]);if(!name)ask('Please provide the new member’s full name.');return result('',action('create_member','',{name,role:unquote(match[2])}));}
  if((match=/^(?:add|create)(?: a| new)?\s+(?:team )?member\s+(.+)$/i.exec(text))){if(/\b(?:on leave|will be|he is|she is|who is)\b/i.test(match[1]))ask('To add a member, use: Add Maya Rao as a Deployment and Configuration Engineer. To mark leave, use: Mark Maya Rao on leave on YYYY-MM-DD.');return result('',action('create_member','',{name:unquote(match[1])}));}
  return result('I don’t recognize that command format. No changes were made. Type “help” for examples, or use the example buttons. Please include the full member name, quoted task title, and explicit dates where needed.');
 }catch(error){if(error instanceof Clarification)return result(error.message);throw error;}
}
function updateMember(reference,field,value,state,today){
 const p=member(state,reference);let answer=value.trim();
 if(field==='capacity')answer=enumValue(capacities,answer,'capacity');
 if(field==='checkin')answer=dateValue(answer,today);
 if(field==='checkinTime')answer=timeValue(answer);
 return result('',action('update_member',p.id,{[field]:answer}));
}
function updateRecord(entity,match,state,today){
 entity=normal(entity);
 const item=record(state,entity,match[1]),label=normal(match[2]),value=match[3].trim();
 const fields={title:'title','due date':'due','work date':'date',owner:'person',date:'date',status:'status',priority:'priority',blocker:'blocker',outcome:'outcome',notes:'notes',type:'type'};
 let answer=value;
 if(['due date','work date','date'].includes(label))answer=dateValue(value,today);
 if(label==='owner')answer=/^unassigned$/i.test(value)?'':member(state,value).id;
 if(label==='priority')answer=enumValue(priorities,value,'priority');
 if(label==='status')answer=entity==='task'?enumValue(statuses,value,'status'):enumValue({planned:'Planned',ongoing:'In progress','in progress':'In progress',done:'Done',completed:'Done'},value,'activity status');
 if(label==='type')answer=enumValue(activityTypes,value,'activity type');
 return result('',action('update_'+entity,item.id,{[fields[label]]:answer}));
}
module.exports={parseCommand,dateValue,dateList,timeValue,resolveRecord,help};
