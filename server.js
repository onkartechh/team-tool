const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const files = {'/':'index.html','/app.js':'app.js','/ids.js':'ids.js','/styles.css':'styles.css','/favicon.svg':'favicon.svg','/state.js':'state.js','/calendar.js':'calendar.js','/assistant-ui.js':'assistant-ui.js','/notepad.js':'notepad.js','/analytics.js':'analytics.js','/reconcile.js':'reconcile.js','/sync.js':'sync.js','/offline.js':'offline.js','/leadership.js':'leadership.js','/globe.js':'globe.js','/commands.js':'commands.js','/workspace-ui.js':'workspace-ui.js','/sw.js':'sw.js'};
const {createAssistantRouter}=require('./assistant-server');
function createWorkspaceServer({dataDir=process.env.DATA_DIR||path.join(__dirname,'data'),assistantPlanner}={}){
const directory = dataDir;
fs.mkdirSync(directory, {recursive:true});
const dataFile = path.join(directory, 'teamspace.json');
const {valid}=require('./state');
function persist(data) {
 const temporary = dataFile + '.tmp';
 const fd = fs.openSync(temporary, 'w', 0o600);
 try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
 fs.renameSync(temporary, dataFile);
 const dir = fs.openSync(directory, 'r');
 try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}
if (!fs.existsSync(dataFile)) persist({people:[],tasks:[],activities:[]});
function read() { const data = JSON.parse(fs.readFileSync(dataFile, 'utf8')); if (!valid(data)) throw Error('Invalid stored data'); return data; }
read(); // Fail startup rather than overwrite unreadable data.
const revision = data => '"' + crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex') + '"';
const assistantRoute=createAssistantRouter({read,persist,revision,...(assistantPlanner?{planner:assistantPlanner,configured:()=>true}:{})});
const server = http.createServer(async (req,res)=>{
 const url = req.url.split('?')[0];
 if(url.startsWith('/api/assistant'))return assistantRoute(req,res,url);
 if (url === '/api/state') {
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  const reply = (status,message) => {res.writeHead(status);res.end(JSON.stringify({error:message}));};
  try {
   if (req.method === 'GET') { const data=read(); res.setHeader('ETag',revision(data));return res.end(JSON.stringify(data)); }
   if (req.method !== 'PUT') return reply(405,'Use GET or PUT');
   if (!req.headers['content-type']?.startsWith('application/json')) return reply(415,'JSON required');
   if (req.headers['sec-fetch-site'] === 'cross-site') return reply(403,'Cross-site writes are not allowed');
   const chunks=[];let size=0;
   for await (const chunk of req) {size+=chunk.length;if(size>5_000_000)return reply(413,'Backup exceeds 5 MB');chunks.push(chunk);}
   let data;try {data=JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {return reply(400,'Invalid JSON');}
   if (!valid(data)) return reply(400,'Invalid workspace data');
   if (req.headers['if-match'] !== revision(read())) return reply(409,'Workspace changed. Export your edits and reload before retrying.');
   persist(data);
   res.setHeader('ETag',revision(data));return res.end(JSON.stringify({saved:true}));
  } catch (error) { console.error('Storage operation failed:',error.message);return reply(500,'Storage unavailable. Changes were not confirmed saved.'); }
 }
 const file=files[url];
 if(!file){res.writeHead(404);return res.end('Not found');}
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
 res.setHeader('Content-Type',file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
 res.setHeader('Cache-Control','no-cache');
 fs.createReadStream(path.join(__dirname,file)).pipe(res);
});
 return server;
}
if(require.main===module){
 const server=createWorkspaceServer();
 server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Derq running on port '+(process.env.PORT||3000)));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
module.exports={createWorkspaceServer};
