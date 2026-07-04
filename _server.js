const http=require('http'),fs=require('fs'),path=require('path');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json'};
http.createServer((req,res)=>{
  let f=decodeURIComponent(req.url.split('?')[0]); if(f==='/')f='/index.html';
  const p=path.join(__dirname,f);
  fs.readFile(p,(e,d)=>{
    if(e){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':(types[path.extname(p)]||'text/plain')+'; charset=utf-8'});
    res.end(d);
  });
}).listen(8765,()=>console.log('serving on http://localhost:8765'));
