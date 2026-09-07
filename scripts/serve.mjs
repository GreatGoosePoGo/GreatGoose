/** Development-only static file server. No simulation endpoints or dependencies. */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.txt':'text/plain; charset=utf-8','.map':'application/json'};
try{await stat(resolve(root,'index.html'));}catch{console.error('Missing dist/. Run npm run build first, or extract the complete ZIP.');process.exit(1);}
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(path!==root && !path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const bytes=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
const port=Number(process.env.PORT||8000);
server.listen(port,'127.0.0.1',()=>console.log(`Raid simulator ready at http://localhost:${port}`));
