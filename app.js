'use strict';
const $=s=>document.querySelector(s);
const AUDIO_CACHE='audio-v2';
const NEAR_M=60;
let DATA=null, day=null, pos=null, nearMode=false, watchId=null, map=null, layer=null, meMarker=null, current=null;
const notified=new Set(JSON.parse(sessionStorage.getItem('notified')||'[]'));
const audio=$('#audio');

function tokyoToday(){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return p; // YYYY-MM-DD
}
function hav(a,b,c,d){const R=6371000,r=Math.PI/180;const x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function fmtDist(m){if(m==null)return'';if(m<1000)return Math.round(m/10)*10+' m';if(m<20000)return(m/1000).toFixed(1).replace('.',',')+' km';return Math.round(m/1000)+' km'}
function fmtDur(s){return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function esc(t){return t.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function absAudio(rel){return new URL(rel,location.href).pathname}
function dirUrl(s){return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`}
function stopsOfDay(){return DATA.stops.filter(s=>s.day===day)}
function dist(s){return pos?hav(pos.lat,pos.lon,s.lat,s.lon):null}

async function init(){
  const r=await fetch('data/paradas.json'); DATA=await r.json();
  const sel=$('#day');
  for(const d of DATA.days){const o=document.createElement('option');o.value=d.day;o.textContent=`${d.fecha} · ${d.titulo}`;sel.appendChild(o)}
  const t=tokyoToday(); const inTrip=DATA.days.find(d=>d.date===t);
  const saved=parseInt(localStorage.getItem('day')||'0');
  day=inTrip?inTrip.day:(DATA.days.find(d=>d.day===saved)?saved:10);
  sel.value=day;
  sel.onchange=()=>{day=parseInt(sel.value);localStorage.setItem('day',day);render();if(map)drawMap(true)};
  $('#nearBtn').onclick=toggleNear;
  $('#tabList').onclick=()=>showTab('list');
  $('#tabMap').onclick=()=>showTab('map');
  $('#dlBtn').onclick=downloadDay;
  new ResizeObserver(()=>document.documentElement.style.setProperty('--hh',$('#top').offsetHeight+'px')).observe($('#top'));
  audio.addEventListener('play',()=>markPlaying());
  audio.addEventListener('pause',()=>markPlaying());
  audio.addEventListener('ended',()=>markPlaying());
  if(localStorage.getItem('near')==='1') toggleNear();
  render();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(()=>{});
}

function render(){
  const list=$('#list'); const ss=stopsOfDay(); const info=DATA.days.find(d=>d.day===day);
  let items=ss.map(s=>({s,d:dist(s)}));
  let nearest=null;
  if(pos&&items.length){nearest=items.reduce((a,b)=>a.d<b.d?a:b).s}
  updateDayInfo(info,nearest);
  if(nearMode&&pos) items.sort((a,b)=>a.d-b.d);
  let html='', lastH=null;
  for(const {s,d} of items){
    if(!(nearMode&&pos)&&s.hito!==lastH){html+=`<div class="hito">${esc(s.hito)}</div>`;lastH=s.hito}
    const isNear=nearest&&nearest.id===s.id;
    html+=`<article class="card${isNear?' near':''}${current&&current.id===s.id?' playing':''}" id="c${s.id}">
      <button class="play" data-id="${s.id}" aria-label="Reproducir">${current&&current.id===s.id&&!audio.paused?'❚❚':'▶'}</button>
      <div class="body">
        <div class="name">${s.ord}. ${esc(s.nombre)}</div>
        <div class="meta">${d!=null?`<b>${fmtDist(d)}</b> · `:''}${fmtDur(s.dur)}${s.aprox?' · ubicación aprox.':''}${isNear?' · <b>la más cercana</b>':''}</div>
        <div class="res">${esc(s.texto)}</div>
        <div class="acts"><button data-more="${s.id}">Leer más</button><a href="${dirUrl(s)}" target="_blank" rel="noopener">🧭 Cómo llegar</a><button data-map="${s.id}">🗺️ Ver en mapa</button></div>
      </div></article>`;
  }
  list.innerHTML=html||'<div class="empty">Sin paradas</div>';
  list.querySelectorAll('.play').forEach(b=>b.onclick=()=>playStop(b.dataset.id));
  list.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>{const c=$('#c'+b.dataset.more);c.classList.toggle('open');b.textContent=c.classList.contains('open')?'Leer menos':'Leer más'});
  list.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{showTab('map');const s=DATA.stops.find(x=>x.id===b.dataset.map);setTimeout(()=>openPopup(s),250)});
  refreshDlBtn();
}
function updateDayInfo(info,nearest){
  let t=`${info.n} paradas`;
  if(nearMode&&!pos) t+=' · buscando tu posición…';
  if(nearest) t+=` · más cercana: ${nearest.ord} (${fmtDist(dist(nearest))})`;
  $('#dayInfo').textContent=t;
}

function playStop(id){
  const s=DATA.stops.find(x=>x.id===id); if(!s) return;
  if(current&&current.id===id){ if(audio.paused) audio.play().catch(()=>{}); else audio.pause(); return; }
  current=s;
  audio.src=s.audio; audio.load();
  $('#pTitle').textContent=`${s.day} nov · ${s.ord}. ${s.nombre}`;
  $('#player').hidden=false; document.body.classList.add('hasplayer');
  audio.play().catch(()=>{});
  if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:s.nombre,artist:'Audioguía Japón',album:`${s.day} de noviembre`,artwork:[{src:'icons/icon-512.png',sizes:'512x512',type:'image/png'}]})}
  markPlaying();
}
function markPlaying(){
  document.querySelectorAll('.card').forEach(c=>{const on=current&&c.id==='c'+current.id;c.classList.toggle('playing',on);const b=c.querySelector('.play');if(b)b.textContent=on&&!audio.paused?'❚❚':'▶'});
  document.querySelectorAll('.pp button[data-play]').forEach(b=>{b.textContent=current&&b.dataset.play===current.id&&!audio.paused?'❚❚ Pausa':'▶ Escuchar'});
}

function toggleNear(){
  nearMode=!nearMode; localStorage.setItem('near',nearMode?'1':'0');
  $('#nearBtn').classList.toggle('on',nearMode);
  if(nearMode&&watchId==null&&'geolocation' in navigator){
    watchId=navigator.geolocation.watchPosition(onPos,err=>{
      $('#dayInfo').textContent='No tengo tu ubicación: '+(err.code===1?'permiso denegado (Ajustes › Privacidad › Localización › Safari).':'sin señal GPS.');
    },{enableHighAccuracy:true,maximumAge:10000,timeout:30000});
  }
  if(!nearMode&&watchId!=null){navigator.geolocation.clearWatch(watchId);watchId=null;pos=null;if(meMarker&&map){map.removeLayer(meMarker);meMarker=null}}
  render(); if(map) drawMap(false);
}
let lastRender=0;
function onPos(p){
  pos={lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy};
  const now=Date.now();
  if(now-lastRender>4000){lastRender=now; if(!document.querySelector('.card.open')) render(); else updateDayInfo(DATA.days.find(d=>d.day===day),null); if(map) drawMap(false)}
  else if(map) drawMe();
  checkProximity();
}
function checkProximity(){
  if(!pos) return;
  // busca en todo el viaje, no solo el día elegido
  let best=null,bd=1e12;
  for(const s of DATA.stops){const d=hav(pos.lat,pos.lon,s.lat,s.lon); if(d<bd){bd=d;best=s}}
  if(best&&bd<NEAR_M&&!notified.has(best.id)&&(!current||current.id!==best.id)){
    notified.add(best.id); sessionStorage.setItem('notified',JSON.stringify([...notified]));
    const b=$('#banner');
    b.innerHTML=`<span>📍 Estás junto a: ${esc(best.ord+'. '+best.nombre)}</span><button id="bPlay">▶</button><button class="x" id="bX">✕</button>`;
    b.hidden=false;
    $('#bPlay').onclick=()=>{if(best.day!==day){day=best.day;$('#day').value=day;render();if(map)drawMap(true)}playStop(best.id);b.hidden=true};
    $('#bX').onclick=()=>b.hidden=true;
    if(navigator.vibrate) try{navigator.vibrate([150,80,150])}catch(e){}
    setTimeout(()=>{b.hidden=true},60000);
  }
}

function showTab(t){
  $('#tabList').classList.toggle('on',t==='list'); $('#tabMap').classList.toggle('on',t==='map');
  $('#list').hidden=t!=='list'; $('#mapWrap').hidden=t!=='map';
  if(t==='map'){ if(!map) initMap(); setTimeout(()=>{map.invalidateSize();drawMap(true)},50) }
}
function initMap(){
  map=L.map('map',{zoomControl:true,attributionControl:true});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  layer=L.layerGroup().addTo(map);
  const C=L.Control.extend({onAdd(){const b=L.DomUtil.create('button','pill');b.textContent='📍';b.style.fontSize='22px';b.onclick=e=>{L.DomEvent.stop(e);if(!nearMode)toggleNear();if(pos)map.setView([pos.lat,pos.lon],16)};return b}});
  new C({position:'bottomright'}).addTo(map);
}
let markers={};
function drawMap(fit){
  if(!map) return;
  layer.clearLayers(); markers={};
  const ss=stopsOfDay(); let nearest=null;
  if(pos&&ss.length) nearest=ss.reduce((a,b)=>dist(a)<dist(b)?a:b);
  for(const s of ss){
    const cls='num'+(s.aprox?' ap':'')+(nearest&&nearest.id===s.id?' nr':'');
    const m=L.marker([s.lat,s.lon],{icon:L.divIcon({className:'',html:`<div class="${cls}">${s.ord}</div>`,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(layer);
    m.bindPopup(()=>popupHtml(s),{maxWidth:280});
    m.on('popupopen',()=>{const b=document.querySelector(`.pp button[data-play="${s.id}"]`);if(b)b.onclick=()=>playStop(s.id);markPlaying()});
    markers[s.id]=m;
  }
  drawMe();
  if(fit&&ss.length){const pts=ss.map(s=>[s.lat,s.lon]);map.fitBounds(pts,{padding:[40,40],maxZoom:16})}
}
function drawMe(){
  if(!map||!pos) return;
  if(!meMarker) meMarker=L.marker([pos.lat,pos.lon],{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[18,18],iconAnchor:[9,9]}),zIndexOffset:1000}).addTo(map);
  else meMarker.setLatLng([pos.lat,pos.lon]);
}
function popupHtml(s){
  const d=dist(s);
  return `<div class="pp"><b>${s.ord}. ${esc(s.nombre)}</b><span>${d!=null?fmtDist(d)+' · ':''}${fmtDur(s.dur)}${s.aprox?' · aprox.':''}</span><span style="color:#444">${esc(s.resumen)}</span><button data-play="${s.id}">▶ Escuchar</button><a class="dir" href="${dirUrl(s)}" target="_blank" rel="noopener">🧭 Cómo llegar (Google Maps)</a></div>`;
}
function openPopup(s){ if(!map) return; map.setView([s.lat,s.lon],17); markers[s.id]&&markers[s.id].openPopup() }

async function dayCachedCount(){
  if(!('caches' in window)) return 0;
  const c=await caches.open(AUDIO_CACHE); let n=0;
  for(const s of stopsOfDay()) if(await c.match(absAudio(s.audio))) n++;
  return n;
}
async function refreshDlBtn(){
  const b=$('#dlBtn'); const ss=stopsOfDay(); const n=await dayCachedCount(); const info=DATA.days.find(d=>d.day===day);
  if(n===ss.length){b.textContent='✓ Día sin conexión';b.classList.add('done')}
  else{b.textContent=`⬇︎ Descargar día (${(info.bytes/1e6).toFixed(1).replace('.',',')} MB)`;b.classList.remove('done')}
}
let downloading=false;
async function downloadDay(){
  if(downloading) return;
  if(!('caches' in window)){alert('Este navegador no permite guardar sin conexión.');return}
  const b=$('#dlBtn'); const ss=stopsOfDay(); const c=await caches.open(AUDIO_CACHE);
  if(b.classList.contains('done')){ if(!confirm('Este día ya está descargado. ¿Borrarlo del móvil para liberar espacio?')) return; for(const s of ss) await c.delete(absAudio(s.audio)); refreshDlBtn(); return; }
  downloading=true; let ok=0, fail=0;
  for(const [i,s] of ss.entries()){
    b.textContent=`⬇︎ ${i+1}/${ss.length}…`;
    const key=absAudio(s.audio);
    if(await c.match(key)){ok++;continue}
    try{const r=await fetch(s.audio,{cache:'no-store'}); if(!r.ok) throw 0; await c.put(key,r); ok++}catch(e){fail++}
  }
  downloading=false;
  if(fail) alert(`Descargados ${ok} de ${ss.length}. Faltan ${fail}: vuelve a pulsar con buena conexión.`);
  refreshDlBtn();
}
init();
