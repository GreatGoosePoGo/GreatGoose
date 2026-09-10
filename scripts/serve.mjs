/** Development-only static file server. No simulation endpoints or dependencies. */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.txt':'text/plain; charset=utf-8','.map':'application/json'};
try{await stat(resolve(root,'index.html'));}catch{console.error('Missing dist/. Run npm run build first, or extract the complete ZIP.');process.exit(1);}
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const pathname=decodeURIComponent(url.pathname);
  let path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(path!==root && !path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  if(req.method!=='GET' && req.method!=='HEAD'){res.writeHead(405);res.end();return;}

  // Static hosts normally map directory URLs to index.html. Mirror that
  // behavior locally so routes such as /raids/, /counters/, and /rankings/ work too.
  const info=await stat(path);
  if(info.isDirectory()){
   if(!url.pathname.endsWith('/')){
    res.writeHead(308,{Location:url.pathname+'/'+url.search});
    res.end();
    return;
   }
   path=resolve(path,'index.html');
  }

  const bytes=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
const args=process.argv.slice(2);
const option=(name,fallback)=>{const index=args.indexOf(name);return index>=0&&args[index+1]?args[index+1]:fallback;};
const port=Number(option('--port',process.env.PORT||8000));
const host=option('--host',process.env.HOST||'127.0.0.1');
server.listen(port,host,()=>console.log(`Great Goose site ready at http://${host}:${port}`));
