const CACHE='derq-workspace-v11';
const ASSETS=['/','/styles.css','/state.js','/analytics.js','/reconcile.js','/sync.js','/offline.js','/calendar.js','/ids.js','/app.js','/leadership.js','/globe.js','/commands.js','/workspace-ui.js','/notepad.js','/assistant-ui.js','/favicon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('derq-workspace-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/')));return;}
 if(ASSETS.includes(url.pathname))event.respondWith(fetch(event.request).catch(()=>caches.match(url.pathname)));
});
