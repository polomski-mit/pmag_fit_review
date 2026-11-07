const $=id=>document.getElementById(id);let data=null,position=0,pending=null,busy=false;
async function api(path,value){const r=await fetch(path,{method:value?'POST':'GET',headers:{'X-Review-Key':localKey,...(value?{'Content-Type':'application/json'}:{})},...(value?{body:JSON.stringify(value)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error||'Request failed');return j}
function list(){return (data?.fits||[]).filter(f=>($('filter').value==='all'||(f.decision.status||'undecided')===$('filter').value)&&($('location').value==='all'||f.location===$('location').value)&&($('specimen').value==='all'||f.specimen===$('specimen').value))}
function active(){return list()[position]}
function separation(a,b){if(!a||!b)return null;const rad=Math.PI/180;const d=(Number(a.dir_dec)-Number(b.dir_dec))*rad,i=Number(a.dir_inc)*rad,j=Number(b.dir_inc)*rad;return Math.acos(Math.max(-1,Math.min(1,Math.sin(i)*Math.sin(j)+Math.cos(i)*Math.cos(j)*Math.cos(d))))/rad}
const number=(value,d=1)=>value!=null&&value!==''&&Number.isFinite(Number(value))?Number(value).toFixed(d):'—';
function reasons(f,stats){const lines=[];const method=f.component.fit_type;
 lines.push([method==='DE-BFL-A'?'Origin-anchored PCA: the fit is constrained through the origin. DANG is not an independent reason to prefer it.':method==='DE-BFL'?'Free PCA line: position and direction are fitted. Inspect whether the segment trends toward the origin.':'Saved fitting method: '+method,'']);
 const n=Number(stats.dir_n_measurements),mad=Number(stats.dir_mad_free),dang=Number(stats.dir_dang);
 if(Number.isFinite(n)&&n<=3)lines.push([`${n} usable measurements: a short fit can appear precise; inspect the window and neighboring steps.`,'orange']);
 if(Number.isFinite(mad)&&mad>5)lines.push([`MAD ${mad}°: ${mad>10?'large':'elevated'} scatter about the fitted direction. These 5°/10° guide colors are screening aids, not acceptance criteria.`,mad>10?'red':'orange']);
 if(method==='DE-BFL'&&Number.isFinite(dang)&&dang>10)lines.push([`DANG ${dang}°: the free line points away from the origin; inspect residual components and the window. This does not establish an incorrect fit.`,'orange']);
 if(f.component.quality==='b')lines.push(['The saved fit is marked bad. Keeping it here does not change that scientific quality flag.','red']);
 if(f.changed_since_review)lines.push(['This fit or its measurements changed since the prior review. Reconfirmation is required.','orange']);
 lines.push([`Saved window ${number(f.bounds_C[0],0)}–${number(f.bounds_C[1],0)}°C. Compare alternative components separately; they are interpretations of the same specimen, not independent observations.`,'']);return lines}
function fitOverlap(a,b,rows){
 if(a.specimen!==b.specimen)return null;
 const lo=Math.max(...[a.bounds_C[0],b.bounds_C[0]]),hi=Math.min(a.bounds_C[1],b.bounds_C[1]);
 // A shared boundary alone is not an overlapping treatment interval.
 if(!(hi>lo))return null;
 const ids=new Set(a.window_observations||a.window_ids),other=new Set(b.good_observations||b.window_ids);
 return {lo,hi,sharedGood:rows.filter(r=>r.quality!=='b'&&ids.has(r.observation_id||r.measurement)&&other.has(r.observation_id||r.measurement)).length};
}
function paint(){const items=list();position=Math.max(0,Math.min(position,items.length-1));const f=items[position];$('counter').textContent=items.length?`${position+1} / ${items.length}`:'0 / 0';$('prev').disabled=!f||position===0;$('next').disabled=!f||position===items.length-1;for(const id of ['yes','no','undecided','note'])$(id).disabled=!f||busy;if(!f){$('title').textContent='No fits in this view';$('method').textContent='Choose All fits or another location to continue.';$('stats').replaceChildren();$('reasons').replaceChildren();$('alternatives').replaceChildren();$('other-fits').replaceChildren();$('other-components').hidden=true;$('plots').hidden=true;return}$('plots').hidden=false;
 const coord=$('coord').value,stats=f.results[coord]||{};
 $('source').textContent=`${f.dataset_label||''} · ${f.location} · ${f.site} · ${f.provenance.dataset||'saved fit'}`;$('title').textContent=`${f.specimen} · ${f.name}`;$('method').textContent=`${f.component.fit_type} · ${number(f.bounds_C[0],0)}–${number(f.bounds_C[1],0)}°C`;$('decision').textContent=(f.decision.status||'undecided').toUpperCase();$('note').value=f.decision.note||'';
 $('stats').replaceChildren(...[['Declination',number(stats.dir_dec)+'°'],['Inclination',number(stats.dir_inc)+'°'],['Usable steps',stats.dir_n_measurements??'—'],['MAD',number(stats.dir_mad_free)+'°'],['DANG',number(stats.dir_dang)+'°'],['Saved quality',f.component.quality]].map(([label,value])=>{const span=document.createElement('span'),name=document.createElement('strong'),v=document.createElement('span');name.textContent=label;v.textContent=value;span.append(name,v);return span}));
 $('reasons').replaceChildren(...reasons(f,stats).map(([text,color])=>{const li=document.createElement('li');li.textContent=text;li.className=color;return li}));
 const specimenFits=data.fits.filter(other=>other.specimen===f.specimen),rowsForSpecimen=data.context[f.context_key||f.specimen];
 function fitCard(other){
  const overlap=other.id===f.id?null:fitOverlap(f,other,rowsForSpecimen);
  const button=document.createElement('button');button.className='fit-card';button.setAttribute('aria-pressed',String(other.id===f.id));button.textContent=`${other.name} · ${other.component.fit_type}${other.dataset_label?' · '+other.dataset_label:''}`;
  const detail=document.createElement('small'),s=other.results[coord]||{};
  detail.textContent=`${number(other.bounds_C[0],0)}–${number(other.bounds_C[1],0)}°C · D ${number(s.dir_dec)}° / I ${number(s.dir_inc)}° · MAD ${number(s.dir_mad_free)}° · n ${s.dir_n_measurements??'—'} · ${other.decision.status||'undecided'}`;
  button.append(detail);
  const info=document.createElement('small');
  if(other.id===f.id)info.textContent='Selected window';
  else if(overlap)info.textContent=`Shared range ${number(overlap.lo,0)}–${number(overlap.hi,0)}°C · ${overlap.sharedGood} shared good measurements${f.results[coord]&&other.results[coord]?' · '+number(separation(f.results[coord],other.results[coord]))+'° from selected fit':''}`;
  else info.textContent='Separate temperature window · other component';
  button.append(info);button.onclick=()=>{$('filter').value='all';position=list().findIndex(x=>x.id===other.id);paint()};return button;
 }
 const alternatives=specimenFits.filter(other=>other.id===f.id||fitOverlap(f,other,rowsForSpecimen));
 const separate=specimenFits.filter(other=>other.id!==f.id&&!fitOverlap(f,other,rowsForSpecimen));
 $('alternatives').replaceChildren(...alternatives.map(fitCard));
 $('other-fits').replaceChildren(...separate.map(fitCard));$('other-components').hidden=!separate.length;
 $('other-components-label').textContent=`Other components · ${separate.length} non-overlapping windows`;

 $('evidence').textContent=JSON.stringify({source:f.provenance,component:f.component,coordinates:coord,results:stats},null,2);
 const rows=data.context[f.context_key||f.specimen].map(row=>{const di=row.directions[coord];return {...row,dir_dec:di?di[0]:'',dir_inc:di?di[1]:'',_screened_out:row.quality==='b'}});
 const selected=rows.find(r=>r.measurement===f.component.min.measurement)||rows[0];
 drawReviewPlots($('plots'),rows,selected,null,{kelvinOffset:273.15,axis:$('axis').value,full:$('range').value==='all',fitIdentities:f.window_ids,coordinateLabel:$('coord').selectedOptions[0].text.toLowerCase(),status:f.decision.status||'undecided'});
 // Shared renderer defaults to specimen labels; label this app's coordinate choice accurately.
 $('plots').setAttribute('aria-label',`Selected saved fit window in ${$('coord').selectedOptions[0].text} coordinates`);
 try{localStorage.setItem('pmag-fit-position',f.id)}catch(error){}
}
function choose(status){if(!active()||busy)return;clearTimeout(noteTimer);pending={id:active().id,fingerprint:active().fingerprint,status,note:$('note').value};$('confirm-title').textContent=`Confirm ${status}: ${active().specimen} · ${active().name}?`;$('confirm').showModal()}
async function confirm(){if(!pending||busy)return;busy=true;$('confirm-yes').disabled=true;try{const item=data.fits.find(f=>f.id===pending.id),old=position,result=await api('/api/fit-review/choice',pending);item.decision=result.decision;pending=null;$('confirm').close();if($('filter').value==='all')position=old+1;else position=old;$('status').textContent='Decision autosaved to disk. Original fits remain unchanged.';paint()}catch(error){$('status').textContent=error.message}finally{busy=false;$('confirm-yes').disabled=false;paint()}}
function cancel(){pending=null;$('confirm').close()}
$('yes').onclick=()=>choose('keep');$('no').onclick=()=>choose('reject');$('undecided').onclick=()=>choose('undecided');$('confirm-yes').onclick=confirm;$('confirm-no').onclick=cancel;$('confirm').oncancel=()=>{pending=null};
$('prev').onclick=()=>{position--;paint()};$('next').onclick=()=>{position++;paint()};for(const id of ['filter','location','specimen'])$(id).onchange=()=>{position=0;paint()};for(const id of ['coord','range','axis'])$(id).onchange=paint;
let noteTimer=null;$('note').oninput=()=>{clearTimeout(noteTimer);const f=active();if(!f)return;const value={id:f.id,fingerprint:f.fingerprint,status:f.decision.status||'undecided',note:$('note').value,note_only:true};noteTimer=setTimeout(async()=>{try{const r=await api('/api/fit-review/choice',value);f.decision=r.decision;$('status').textContent='Note autosaved.'}catch(e){$('status').textContent=e.message}},500)};
async function flushFitNote(){clearTimeout(noteTimer);const f=active();if(!f||$('note').value===(f.decision.note||''))return;const result=await api('/api/fit-review/choice',{id:f.id,fingerprint:f.fingerprint,status:f.decision.status||'undecided',note:$('note').value,note_only:true});f.decision=result.decision}
async function load(){try{data=await api('/api/fit-review');$('directories').value=(data.datasets||[]).map(d=>d.directory).join('\n');$('dataset-list').textContent=(data.datasets||[]).map(d=>`${d.label}: ${d.fits} fits`).join(' · ');if(!data.datasets?.length)$('directory-panel').open=true;const oldLocation=$('location').value;$('location').replaceChildren(...['all',...new Set(data.fits.map(f=>f.location).filter(Boolean))].map(name=>{const o=document.createElement('option');o.value=name;o.textContent=name==='all'?'All locations':name;return o}));$('location').value=[...new Set(data.fits.map(f=>f.location))].includes(oldLocation)?oldLocation:'all';const names=[...new Set(data.fits.map(f=>f.specimen))];$('specimen').replaceChildren(...['all',...names].map(name=>{const o=document.createElement('option');o.value=name;o.textContent=name==='all'?'All specimens':name;return o}));position=0;let previous=null;try{previous=localStorage.getItem('pmag-fit-position')}catch(e){}const i=list().findIndex(f=>f.id===previous);if(i>=0)position=i;$('status').textContent=`${data.fits.length} saved fits · ${data.directory} · arrows browse; Y/N/U choose; Enter confirms.`;paint()}catch(e){$('status').textContent=e.message}}
$('folders').onclick=()=>{$('directory-panel').open=!$('directory-panel').open};$('load-directories').onclick=async()=>{try{await flushFitNote();await api('/api/directories',{directories:$('directories').value.split('\n').map(p=>p.trim()).filter(Boolean)});await load();$('directory-panel').open=false}catch(e){$('status').textContent=e.message}};$('reload').onclick=load;$('export').onclick=async()=>{try{const r=await api('/api/fit-review/export',{});$('status').textContent=`Exported ${r.kept} kept fits (${r.withheld} withheld) to ${r.directory}`;const response=await fetch(r.download,{headers:{'X-Review-Key':localKey}});if(!response.ok)throw Error('Could not download export');const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='reviewed-magic-fits.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){$('status').textContent=e.message}};
function theme(dark){document.documentElement.dataset.theme=dark?'dark':'light';$('theme').textContent=dark?'Light mode':'Dark mode';try{localStorage.setItem('measurement-review-theme',dark?'dark':'light')}catch(e){}if(data)paint()};let pref='dark';try{pref=localStorage.getItem('measurement-review-theme')||'dark'}catch(e){}theme(pref==='dark');$('theme').onclick=()=>theme(document.documentElement.dataset.theme!=='dark');
window.addEventListener('resize',()=>data&&paint());document.addEventListener('keydown',e=>{if(e.repeat||e.metaKey||e.ctrlKey||e.altKey)return;if(pending){if(e.key==='Enter'){e.preventDefault();confirm()}if(e.key==='Escape'){e.preventDefault();cancel()}return}if(e.target.closest('input,select,textarea'))return;const k=e.key.toLowerCase();if(['arrowleft','arrowright','y','n','u'].includes(k)){e.preventDefault();if(k==='arrowleft')$('prev').onclick();if(k==='arrowright')$('next').onclick();if(k==='y')choose('keep');if(k==='n')choose('reject');if(k==='u')choose('undecided')}});load();
