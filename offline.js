(function(){
 const copy=TeamspaceReconcile.copy;let database,adopted=null,offlineReady=false,deviceCopyCleared=false;
 // A fresh writer ID per document also isolates duplicated tabs, whose
 // sessionStorage may initially be copied by the browser.
 const client=TeamspaceIds.createId();let previousClient;
 try{previousClient=sessionStorage.getItem('derq-client');sessionStorage.setItem('derq-client',client);}catch{}
 async function db(){
  if(database)return database;
  database=await new Promise((resolve,reject)=>{const request=indexedDB.open('derq-offline',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Device database is blocked.'));});return database;
 }
 async function operation(method,value){
  try{
   const connection=await db();return await new Promise((resolve,reject)=>{const transaction=connection.transaction('drafts',method==='getAll'?'readonly':'readwrite'),items=transaction.objectStore('drafts'),request=method==='deleteClean'?items.get(value):method==='deleteExact'?items.get(value.id):items[method](value);let result;request.onsuccess=()=>{result=request.result;if(method==='deleteClean'&&result&&!result.pending)items.delete(value);if(method==='deleteExact'&&TeamspaceReconcile.equal(result,value.expected))items.delete(value.id);};transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
  }catch(error){
   if(method==='getAll')return Object.keys(localStorage).filter(key=>key.startsWith('derq-draft:')).map(key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}).filter(Boolean);
   if(method==='put'){localStorage.setItem('derq-draft:'+value.id,JSON.stringify(value));return;}
   if(method==='delete'){localStorage.removeItem('derq-draft:'+value);return;}
   if(method==='deleteClean'){const current=JSON.parse(localStorage.getItem('derq-draft:'+value)||'null');if(value===client&&current&&!current.pending)localStorage.removeItem('derq-draft:'+value);return;}
   // Fallback storage has no cross-tab compare-and-delete transaction. Keep
   // another document's source copy rather than risk deleting its newer edits.
   if(method==='deleteExact')return;
   throw error;
  }
 }
 const store={
  async read(){const entries=(await operation('getAll')).sort((a,b)=>b.updatedAt-a.updatedAt);const entry=entries.find(e=>e.id===previousClient)||entries.find(e=>e.pending)||entries[0];if(entry&&entry.id!==client&&TeamspaceState.valid(entry.base)&&TeamspaceState.valid(entry.local))adopted=copy(entry);return entry;},
  async write(value){
   await operation('put',{...value,id:client});
   deviceCopyCleared=false;
   if(adopted&&(!value.pending||(TeamspaceReconcile.equal(value.base,adopted.base)&&TeamspaceReconcile.equal(value.local,adopted.local)))){await operation('deleteExact',{id:adopted.id,expected:adopted});adopted=null;}
  }
 };
 function canAdopt(){return loaded&&!document.querySelector('#editor').open&&!document.querySelector('#leave-editor').open&&!document.querySelector('[data-dirty="true"]')&&!(window.DerqNotepad&&DerqNotepad.isDirty());}
 function transportError(message,network=true,status){return Object.assign(Error(message),{network,status});}
 async function fetchRemote(){
  let response;try{response=await fetch('/api/state',{cache:'no-store',signal:AbortSignal.timeout(8000)});}catch{throw transportError('The server is unreachable. Changes remain on this device and will be retried.');}
  if(!response.ok)throw transportError('The server could not load the workspace. Your local draft is preserved.',false,response.status);
  const state=await response.json();if(!TeamspaceState.valid(state))throw transportError('The server returned invalid data. Your local copy is preserved.',false);
  return {state,etag:response.headers.get('ETag')};
 }
 async function putRemote(state,etag){
  let response;try{response=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify(state),signal:AbortSignal.timeout(8000)});}catch{throw transportError('Connection interrupted. Your draft is saved on this device; reconnect to reconcile it.');}
  if(!response.ok)throw transportError(response.status===409?'Another session made changes.':response.status===413?'The workspace exceeds 5 MB. Download a backup and reduce its size before retrying.':'The server rejected this save. Your draft is preserved; review its fields and retry.',false,response.status);
  return {etag:response.headers.get('ETag')};
 }
 function paint(info=engine.info()){
  if(!loaded)return;
  revision=info.etag;saveFailed=['conflict','paused','rejected'].includes(info.status)||(info.status==='offline'&&info.pending)||!!info.storageError;
  const labels={saved:'● Saved to server',saving:'● Saving…',pending:'● Saved on device · pending sync',offline:info.pending?'● Offline · changes saved on device':'● Offline · saved copy',conflict:'● Review conflicting edits',paused:'● Sync paused · draft saved',rejected:'● Sync paused · review changes'};
  badge(info.storageError&&info.pending?'● Device save failed · export edits':labels[info.status]||'● Connecting…');
  notice(info.storageError||(info.status==='conflict'?'Some fields changed in two sessions. Select the save indicator to review each version.':info.status==='offline'?'You can keep editing. This device will reconcile its changes when the server is reachable.':info.error||''));
  document.querySelector('#sync-open').classList.toggle('needs-review',info.status==='conflict');
  if(info.status==='conflict'&&!document.querySelector('dialog[open]'))show();
 }
 const engine=TeamspaceSync.create({store,fetchRemote,putRemote,validate:TeamspaceState.valid,online:()=>navigator.onLine!==false,canAdopt,onChange:paint,onAdopt:(next,tag)=>{state=next;revision=tag;if(loaded)render();}});
 const preview=value=>value===undefined?'(record or field deleted)':typeof value==='string'?value:JSON.stringify(value,null,2);
 async function show(){
  if(!loaded)return;
  if(window.DerqNotepad)DerqNotepad.flush();document.querySelectorAll('[data-inline][data-dirty="true"]').forEach(commitInline);if(window.DerqWorkspace)DerqWorkspace.flushEdits();await engine.persisted();
  const info=engine.info(),dialog=document.querySelector('#sync-dialog');
  document.querySelector('#sync-description').textContent=deviceCopyCleared?'The saved device copy was removed. Reconnect / retry to prepare a new offline copy.':info.storageError?'Device storage is unavailable. Your current edits are in memory; export a backup before closing.':info.pending?'Your draft is stored on this device. Independent edits merge automatically; conflicting fields need your choice.':'This device has a saved workspace copy. Offline edits sync after reconnection.';
  document.querySelector('#sync-capability').textContent=deviceCopyCleared?'Reconnect to save the workspace on this device again.':info.storageError?'Offline data storage is unavailable. Download a backup.':offlineReady&&!info.cachePending?'Offline reload is ready on this device.':window.isSecureContext?'Preparing offline reload. Keep this page open until the app cache is ready.':'Offline editing works in an open tab. Offline reload requires HTTPS or localhost.';
  document.querySelector('#sync-error').textContent=info.storageError||info.error||'';
  document.querySelector('#sync-conflicts').innerHTML=info.conflicts.map((conflict,index)=>`<fieldset class="sync-conflict"><legend>${esc(conflict.label)}</legend><div class="sync-versions">${[['local','This device',conflict.local],['remote','Server version',conflict.remote]].map(([key,label,value])=>`<label><span><input type="radio" name="conflict-${index}" value="${key}" required> ${label}</span><pre>${esc(preview(value).slice(0,6000))}</pre></label>`).join('')}</div><details><summary>Original shared version</summary><pre>${esc(preview(conflict.base).slice(0,6000))}</pre></details></fieldset>`).join('');
  document.querySelector('#sync-apply').hidden=!info.conflicts.length;
  let entries=[];try{entries=(await operation('getAll')).filter(e=>e.pending&&e.id!==client).sort((a,b)=>b.updatedAt-a.updatedAt);}catch{}
  document.querySelector('#sync-drafts').innerHTML=entries.length?'<h3>Other saved device drafts</h3>'+entries.map((entry,index)=>`<div class="sync-draft-row"><button type="button" data-recover-draft="${index}">Recover draft · ${esc(new Date(entry.updatedAt).toLocaleString())}</button><button type="button" data-download-draft="${index}">Download draft</button></div>`).join(''):'';
  document.querySelectorAll('[data-download-draft]').forEach(button=>button.onclick=()=>{const entry=entries[Number(button.dataset.downloadDraft)],url=URL.createObjectURL(new Blob([JSON.stringify(entry.local,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='derq-device-draft-'+today()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  document.querySelectorAll('[data-recover-draft]').forEach(button=>button.onclick=async()=>{
   try{const entry=entries[Number(button.dataset.recoverDraft)];
    if(engine.info().pending){const current=(await operation('getAll')).find(e=>e.id===client);if(current)await operation('put',{...current,id:TeamspaceIds.createId(),updatedAt:Date.now(),pending:true});}
    adopted=copy(entry);await engine.recover(entry);await show();
   }catch{document.querySelector('#sync-error').textContent='Could not preserve this draft on the device. Export your current changes before trying recovery again.';}
  });
  document.querySelector('#sync-clear').disabled=info.pending||entries.length>0;
  if(!dialog.open)dialog.showModal();
 }
 document.querySelector('#sync-open').onclick=show;
 document.querySelector('#sync-close').onclick=()=>document.querySelector('#sync-dialog').close();
 document.querySelector('#sync-retry').onclick=async()=>{await engine.refresh();await show();};
 document.querySelector('#sync-export').onclick=()=>document.querySelector('#export').click();
 document.querySelector('#sync-form').onsubmit=async event=>{
  event.preventDefault();const current=engine.info(),form=new FormData(event.target),choices={};
  current.conflicts.forEach((conflict,index)=>{choices[conflict.id]=form.get('conflict-'+index);});
  if(current.conflicts.some(c=>!['local','remote'].includes(choices[c.id])))return;
  await engine.flush(choices);if(!engine.info().pending)document.querySelector('#sync-dialog').close();else await show();
 };
 document.querySelector('#sync-clear').onclick=async()=>{
  if(engine.info().pending)return;if(!confirm('Remove synced offline copies from this device? Server records and pending drafts remain. Other open tabs can save new copies.'))return;
  try{for(const entry of await operation('getAll'))if(!entry.pending)await operation('deleteClean',entry.id);deviceCopyCleared=true;notice('Synced copies cleared where browser storage permits. Server records and pending drafts remain.');document.querySelector('#sync-dialog').close();}catch{document.querySelector('#sync-error').textContent='Could not clear saved copies. You can manage this app’s storage in browser site settings.';}
 };
 setInterval(()=>{if(loaded&&navigator.onLine!==false&&!document.hidden&&canAdopt()&&engine.info().status==='saved')engine.refresh();},45000);
 window.addEventListener('online',()=>engine.refresh());window.addEventListener('offline',()=>{engine.refresh();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&loaded&&engine.info().pending&&engine.info().status!=='conflict')engine.flush();});
 for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{if(loaded&&(engine.info().pending||engine.info().status==='pending')&&engine.info().status!=='conflict')engine.flush();});
 setInterval(()=>{if(loaded&&engine.info().pending&&engine.info().status!=='conflict'&&!document.querySelector('#sync-dialog').open)engine.flush();},15000);
 if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{offlineReady=true;}).catch(()=>{});
 window.DerqSync={load:()=>engine.load(),stage:value=>engine.stage(value),flush:choices=>engine.flush(choices),refresh:()=>engine.refresh(),accept:(value,tag)=>engine.accept(value,tag),info:()=>engine.info(),paint,show,ready:()=>offlineReady};
})();
