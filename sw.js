const VER='728d83d8';
const SHELL='shell-'+VER, AUDIO='audio-v2', TILES='tiles-v1';
const SHELL_FILES=['./','index.html','app.js','style.css','leaflet.js','leaflet.css','manifest.webmanifest','data/paradas.json','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_FILES.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>(k.startsWith('shell-')&&k!==SHELL)||(k.startsWith('audio-')&&k!==AUDIO)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
async function rangeResponse(req,resp){
  const range=req.headers.get('range'); if(!range) return resp;
  const buf=await resp.arrayBuffer(); const total=buf.byteLength;
  const m=/bytes=(\d*)-(\d*)/.exec(range); let start=m&&m[1]?parseInt(m[1]):0; let end=m&&m[2]?parseInt(m[2]):total-1;
  if(m&&!m[1]&&m[2]){start=total-parseInt(m[2]);end=total-1}
  end=Math.min(end,total-1);
  return new Response(buf.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Content-Range':`bytes ${start}-${end}/${total}`,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});
}
self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin===location.origin && url.pathname.endsWith('.mp3')){
    e.respondWith((async()=>{
      const c=await caches.open(AUDIO); const hit=await c.match(url.pathname);
      if(hit) return rangeResponse(req,hit);
      return fetch(req);
    })()); return;
  }
  if(/tile\.openstreetmap\.org$/.test(url.hostname)){
    e.respondWith((async()=>{
      const c=await caches.open(TILES); const hit=await c.match(req.url); if(hit) return hit;
      try{const r=await fetch(req); if(r.ok||r.type==='opaque'){c.put(req.url,r.clone()); trimTiles(c);} return r;}catch(err){return new Response('',{status:504})}
    })()); return;
  }
  if(url.origin===location.origin){
    // red primero para datos y página (así se actualiza), caché si no hay conexión
    e.respondWith((async()=>{
      const c=await caches.open(SHELL);
      try{const r=await withTimeout(fetch(req),5000); if(r.ok&&!url.search) c.put(req,r.clone()); return r;}
      catch(err){const hit=await c.match(req,{ignoreSearch:true})||(req.mode==='navigate'?await c.match('index.html'):null); return hit||new Response('Sin conexión',{status:503});}
    })());
  }
});
let trimming=false;
async function trimTiles(c){ if(trimming) return; trimming=true; try{const ks=await c.keys(); if(ks.length>1500){for(const k of ks.slice(0,ks.length-1200)) await c.delete(k);}}finally{trimming=false}}

function withTimeout(p,ms){return new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),ms);p.then(v=>{clearTimeout(t);res(v)},e=>{clearTimeout(t);rej(e)})})}
