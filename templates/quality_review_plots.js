// Display-only filtering: never changes scientific review decisions.
function zoomPlotRows(rows,full=false){
 const active=rows.filter(r=>!r._screened_out&&r.quality!=='b');
 const median=v=>{const a=v.slice().sort((a,b)=>a-b),n=a.length;return n?(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2:NaN};
 const metrics=[{value:r=>Number(r.dir_csd),floor:4},{value:r=>Number(r.magn_moment)>0?Math.log10(Number(r.magn_moment)):NaN,floor:1.5}];
 const limits=metrics.map(m=>{const values=active.map(m.value).filter(Number.isFinite),center=median(values),mad=median(values.map(v=>Math.abs(v-center)));return {...m,center,span:Math.max(m.floor,6*1.4826*(mad||0)),enabled:values.length>=3}});
 return rows.map(r=>({...r,_plot_hidden:r._screened_out||r.quality==='b'||(!full&&limits.some(m=>m.enabled&&Number.isFinite(m.value(r))&&Math.abs(m.value(r)-m.center)>m.span))}));
}
// Break trajectories at excluded or unplottable observations.
function plotRuns(rows,project){
 const runs=[];let run=[],previous=null;
 const removed=rows.filter(r=>r._screened_out).map(r=>Number(r.treat_temp)).filter(Number.isFinite);
 for(const row of rows){const v=project(row);if(row._screened_out||row._plot_hidden||!v||!v.every(Number.isFinite)){if(run.length)runs.push(run);run=[]}else {if(previous&&removed.some(t=>t>=Math.min(Number(previous.treat_temp),Number(row.treat_temp))&&t<=Math.max(Number(previous.treat_temp),Number(row.treat_temp)))){if(run.length)runs.push(run);run=[]}run.push(v);previous=row}}
 if(run.length)runs.push(run);return runs;
}
// Stable specimen-wide temperature colors: yellow → orange → red.
function temperatureColor(value,min,max,dark=false){const fraction=max>min?Math.max(0,Math.min(1,(value-min)/(max-min))):0;return `hsl(${55*(1-fraction)},90%,${dark?62:42}%)`}
// PmagPy Demag convention: rotate D about vertical, East and Down plot downward.
function zijderveldProjection(row,rotation=0,scale=1){
 if(![row.dir_dec,row.dir_inc,row.magn_moment].every(v=>v!==''&&v!=null&&Number.isFinite(Number(v)))||!(scale>0))return null;
 const d=(Number(row.dir_dec)-rotation)*Math.PI/180,i=Number(row.dir_inc)*Math.PI/180,m=Number(row.magn_moment)/scale;
 const x=m*Math.cos(i)*Math.cos(d),y=m*Math.cos(i)*Math.sin(d),z=m*Math.sin(i);
 return {horizontal:[x,-y],vertical:[x,-z]};
}
// Local Ollama draft reviewed and corrected for specimen-coordinate geometry,
// finite-value handling, units, equal scales and hemisphere conventions.
function drawReviewPlots(canvas, rows, suspect, proposed, options={kelvinOffset:273.15}) {
  const repeatHits=[];
  canvas._repeatHitTargets=repeatHits;canvas.onclick=null;canvas.onmousemove=null;canvas.style.cursor='default';
  const dark=document.documentElement.dataset.theme==='dark';
  const palette={'#fff':'#24264b','#20333b':'#eff0ff','#40565e':'#c0d3da','#52676f':'#b7cbd2','#d5dfe1':'#555e9d','#777':'#b1c2ca','#a6afb2':'#97adb7','#96a6ab':'#9db7c2','#8f9da3':'#b0c8d3','#b2bcc1':'#7f9eac','#bac0c3':'#7a929d','#b7bdc0':'#7a929d','#bd352f':'#ff8178','#c62828':'#ff8178','#ef8c00':'#ffb854','#b86b00':'#ffb854','#007d80':'#65ded7'};
  const ink=color=>dark?(palette[color]||color):color;
  const ctx=canvas.getContext('2d'), width=Math.max(320,canvas.clientWidth||900);
  const narrow=width<650;
  const pane=canvas.closest?.('.review-plots'), toolbar=pane?.querySelector?.('.toolbar');
  const fit=window.innerWidth>=1100&&pane?.clientHeight>0;
  const chrome=fit&&pane.getBoundingClientRect?Math.max(toolbar?.offsetHeight||0,canvas.getBoundingClientRect().top-pane.getBoundingClientRect().top):12;
  const height=fit?Math.max(340,pane.clientHeight-chrome-32):(narrow?1800:1080), dpi=window.devicePixelRatio||1;
  canvas.style.height=height+'px';canvas.width=Math.round(width*dpi);canvas.height=Math.round(height*dpi);
  ctx.setTransform(dpi,0,0,dpi,0,0);ctx.fillStyle=ink('#fff');ctx.fillRect(0,0,width,height);
  ctx.font='12px system-ui';
  const finite=x=>x!==''&&x!=null&&Number.isFinite(Number(x));
  const temperature=r=>Number(r.treat_temp)-options.kelvinOffset;
  const chronological=zoomPlotRows(rows,true).sort((a,b)=>Number(a.treat_temp)-Number(b.treat_temp)||a.timestamp.localeCompare(b.timestamp));
  const index=chronological.findIndex(r=>r.timestamp===suspect.timestamp&&r.specimen===suspect.specimen);
  const levels=[...new Set(chronological.map(r=>Number(r.treat_temp)))].sort((a,b)=>a-b);
  const center=levels.indexOf(Number(suspect.treat_temp));
  const nearby=new Set(levels.slice(Math.max(0,center-2),center+3));
  const local=zoomPlotRows(options.full?chronological:chronological.filter(r=>nearby.has(Number(r.treat_temp))),options.full);
  // The dedicated repeat picker must show every remaining choice explicitly.
  for(const row of local)if(options.repeatCandidates?.some(c=>c.specimen===row.specimen&&c.timestamp===row.timestamp))row._plot_hidden=false;
  const ghosts=[];
  const localGhosts=[];
  const selectedRow=local.find(r=>r.timestamp===suspect.timestamp&&r.specimen===suspect.specimen);
  if(selectedRow)selectedRow._plot_hidden=false;
  const visible=local.filter(r=>!r._plot_hidden);
  const hiddenCount=local.length-visible.length;
  const panels=narrow?[
    {x:60,y:40,w:width-88,h:210},{x:60,y:630,w:width-88,h:240},
    {x:60,y:1000,w:width-88,h:570},{x:60,y:335,w:width-88,h:210}
  ]:[
    {x:60,y:40,w:width/2-88,h:220},{x:60,y:390,w:width*.36-85,h:400},
    {x:width*.36+60,y:390,w:width*.64-90,h:520},{x:width/2+60,y:40,w:width/2-88,h:220}
  ];
  for(const panel of panels)panel.y+=narrow?60:40;
  if(fit){
    // Resize panel geometry, rather than stretching the rendered canvas or changing vector aspect ratios.
    const scale=height/(narrow?1800:1080);
    for(const panel of panels){panel.y*=scale;panel.h*=scale}
  }
  function text(value,x,y,color=ink('#40565e'),align='left'){ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y)}
  function title(p,s){text(s,p.x,p.y-16,ink('#20333b'))}
  function point(x,y,color=ink('#777'),shape='circle',filled=true,size=4){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    ctx.beginPath();if(shape==='square')ctx.rect(x-size,y-size,size*2,size*2);
    else if(shape==='cross'){ctx.moveTo(x-size,y-size);ctx.lineTo(x+size,y+size);ctx.moveTo(x-size,y+size);ctx.lineTo(x+size,y-size)}
    else if(shape==='diamond'){ctx.moveTo(x,y-size-1);ctx.lineTo(x+size+1,y);ctx.lineTo(x,y+size+1);ctx.lineTo(x-size-1,y);ctx.closePath()}
    else ctx.arc(x,y,size,0,2*Math.PI);
    ctx.fillStyle=filled?color:ink('#fff');ctx.strokeStyle=color;ctx.lineWidth=1.5;if(shape!=='cross')ctx.fill();ctx.stroke();
  }
  const tick=v=>Math.abs(v)>999?Number(v).toExponential(0):Math.abs(v)<.01&&v!==0?Number(v).toExponential(0):Number(v.toFixed(1)).toString();
  function axes(p,xlo,xhi,ylo,yhi,xlabel,ylabel){
    if(xhi===xlo){xlo-=1;xhi+=1}if(yhi===ylo){ylo-=1;yhi+=1}
    const sx=x=>p.x+(x-xlo)/(xhi-xlo)*p.w,sy=y=>p.y+p.h-(y-ylo)/(yhi-ylo)*p.h;
    ctx.lineWidth=1;ctx.strokeStyle=ink('#d5dfe1');ctx.strokeRect(p.x,p.y,p.w,p.h);
    for(let j=0;j<=4;j++){const x=xlo+(xhi-xlo)*j/4,y=ylo+(yhi-ylo)*j/4;
      text(tick(x),sx(x),p.y+p.h+16,ink('#52676f'),'center');text(tick(y),p.x-7,sy(y)+4,ink('#52676f'),'right')}
    text(xlabel,p.x+p.w/2,p.y+p.h+34,ink('#40565e'),'center');
    ctx.save();ctx.translate(p.x-40,p.y+p.h/2);ctx.rotate(-Math.PI/2);text(ylabel,0,0,ink('#40565e'),'center');ctx.restore();
    return {sx,sy};
  }
  function series(data,project,scales,color=ink('#a6afb2'),connect=true){
    ctx.beginPath();for(const run of plotRuns(data,project))run.forEach((v,i)=>{const x=scales.sx(v[0]),y=scales.sy(v[1]);if(connect){if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}});
    ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();
    for(const row of data){const v=project(row);if(v&&v.every(Number.isFinite))mark(row,()=>point(scales.sx(v[0]),scales.sy(v[1]),rowColor(row,color),row._screened_out?'cross':row._screened_changed?'diamond':'circle',row.quality!=='b',3))}
  }
  function rowColor(row,fallback){return row._screened_out?ink('#bd352f'):row._screened_changed?ink('#007d80'):Number(row.dir_csd)>10?ink('#c62828'):Number(row.dir_csd)>4?ink('#ef8c00'):row.quality==='b'?ink('#b7bdc0'):fallback}
  function mark(row,draw){if(row._plot_hidden)return;ctx.save();if(row._screened_out)ctx.globalAlpha=0.3;draw();ctx.restore()}
  function highlight(row,project,scales,color,shape){if(local.some(r=>r.timestamp===row.timestamp&&r.specimen===row.specimen&&r._plot_hidden))return;const v=project(row);if(v&&v.every(Number.isFinite))mark(row,()=>point(scales.sx(v[0]),scales.sy(v[1]),row._screened_out?ink('#bd352f'):row._screened_changed?ink('#007d80'):color,row._screened_out?'cross':row._screened_changed?'diamond':shape,true,5))}

  const temps=visible.filter(r=>finite(r.treat_temp)).map(temperature);
  let tmin=Math.min(...temps),tmax=Math.max(...temps);if(!Number.isFinite(tmin)){tmin=0;tmax=1}if(tmin===tmax)tmax++;
  // Intensity is logarithmic; zeros cannot be plotted on a log scale.
  const p0=panels[0];title(p0,'Moment versus treatment temperature');
  const moments=visible.filter(r=>finite(r.magn_moment)&&Number(r.magn_moment)>0).map(r=>Math.log10(Number(r.magn_moment)));
  let mlo=Math.floor(Math.min(...moments)),mhi=Math.ceil(Math.max(...moments));if(!Number.isFinite(mlo)){mlo=-12;mhi=-8}if(mhi===mlo)mhi++;
  const ms=axes(p0,tmin,tmax,mlo,mhi,'Temperature (°C)','log₁₀ moment (A·m²)');
  const mp=r=>!r._plot_hidden&&finite(r.magn_moment)&&Number(r.magn_moment)>0?[temperature(r),Math.log10(Number(r.magn_moment))]:null;
  series(local,mp,ms);series(localGhosts,mp,ms,ink('#bd352f'),false);highlight(suspect,mp,ms,ink('#bd352f'),'square');
  if(proposed)highlight(proposed,mp,ms,ink('#007d80'),'diamond');
  if(Number(suspect.magn_moment)===0)text('Suspect moment = 0 (not on log axis)',p0.x,p0.y+13,ink('#bd352f'));
  // Schmidt equal-area projection: both hemispheres shown with different fill.
  const p1=panels[1];title(p1,'Equal-area · '+(options.coordinateLabel||'specimen')+' directions');
  const radius=Math.min(p1.w,p1.h)/2,cx=p1.x+p1.w/2,cy=p1.y+p1.h/2;
  ctx.beginPath();ctx.arc(cx,cy,radius,0,2*Math.PI);ctx.strokeStyle=ink('#96a6ab');ctx.stroke();
  text('+X',cx,cy-radius-3,ink('#52676f'),'center');text('+Y',cx+radius+3,cy+4);
  const colorTemps=chronological.filter(r=>!r._plot_hidden&&finite(r.treat_temp)).map(temperature),colorMin=Math.min(...colorTemps),colorMax=Math.max(...colorTemps);
  const warmColor=row=>temperatureColor(temperature(row),colorMin,colorMax,dark);
  const stereoCoordinates=row=>{if(row._plot_hidden||!finite(row.dir_dec)||!finite(row.dir_inc))return null;const d=Number(row.dir_dec)*Math.PI/180,i=Number(row.dir_inc)*Math.PI/180,r=Math.sqrt(Math.max(0,1-Math.abs(Math.sin(i))));return [cx+radius*r*Math.sin(d),cy-radius*r*Math.cos(d),temperature(row)]};
  // These are treatment-order connectors, not fitted directions or angular-distance estimates.
  for(const run of plotRuns(local,stereoCoordinates))for(let i=1;i<run.length;i++){
   const a=run[i-1],b=run[i];ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.strokeStyle=temperatureColor((a[2]+b[2])/2,colorMin,colorMax,dark);ctx.lineWidth=1.6;ctx.stroke();
  }
  function stereo(row,color,shape,size=4){const v=stereoCoordinates(row);if(v)point(v[0],v[1],color,shape,Number(row.dir_inc)>=0,size)}
  local.concat(localGhosts).forEach(row=>mark(row,()=>stereo(row,row._screened_out?ink('#bd352f'):warmColor(row),row._screened_out?'cross':row._screened_changed?'diamond':'circle',4)));if(proposed)stereo(proposed,ink('#007d80'),'diamond',5);
  text('Filled = down I; open = up I (not loading)',p1.x,p1.y+p1.h+24);
  for(let i=0;i<24;i++){ctx.fillStyle=temperatureColor(colorMin+(colorMax-colorMin)*i/23,colorMin,colorMax,dark);ctx.fillRect(p1.x+i*p1.w/24,p1.y+p1.h+38,p1.w/24+1,8)}
  text(`${colorMin.toFixed(0)}°C · coolest`,p1.x,p1.y+p1.h+64);text(`${colorMax.toFixed(0)}°C · hottest`,p1.x+p1.w,p1.y+p1.h+82,ink('#40565e'),'right');
  // Cartesian vectors: X=M cos I cos D, Y=M cos I sin D, Z=M sin I.
  const p2=panels[2];title(p2,'Zijderveld · '+(options.coordinateLabel||'specimen')+' coordinates');
  // Normalize consistently to the first retained observation, even in zoom mode.
  const reference=chronological.find(r=>!r._screened_out&&r.quality!=='b'&&finite(r.magn_moment)&&Number(r.magn_moment)>0)||chronological.find(r=>finite(r.magn_moment)&&Number(r.magn_moment)>0);
  const scale=reference?Number(reference.magn_moment):1;
  const alongY=options.axis==='y',nrmAligned=options.axis==='nrm',rotation=nrmAligned?Number(reference?.dir_dec)||0:alongY?90:0;
  const horizontalAxis=nrmAligned?'X′':alongY?'Y':'X';
  const horizontal=r=>r._plot_hidden?null:zijderveldProjection(r,rotation,scale)?.horizontal||null,vertical=r=>r._plot_hidden?null:zijderveldProjection(r,rotation,scale)?.vertical||null;
  const size=Math.min(p2.w,p2.h);p2.x+=(p2.w-size)/2;p2.w=size;p2.h=size;
  const values=[0,...visible.concat(proposed?[proposed]:[]).flatMap(r=>{const a=horizontal(r),b=vertical(r);return a&&b?a.concat(b):[]}).filter(Number.isFinite)];
  let lo=Math.min(...values),hi=Math.max(...values);if(hi===lo){lo-=1;hi+=1}const padding=(hi-lo)*.08;lo-=padding;hi+=padding;
  const zs=axes(p2,lo,hi,lo,hi,horizontalAxis+' / M₀','Horizontal / vertical component / M₀');
  ctx.save();ctx.setLineDash([]);ctx.strokeStyle=ink('#96a6ab');ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(zs.sx(0),zs.sy(lo));ctx.lineTo(zs.sx(0),zs.sy(hi));ctx.moveTo(zs.sx(lo),zs.sy(0));ctx.lineTo(zs.sx(hi),zs.sy(0));ctx.stroke();ctx.restore();
  const hColor=dark?'#ff8178':'#bd352f',vColor=dark?'#80b9ff':'#245cb5';
  text('+'+horizontalAxis,p2.x+p2.w-3,zs.sy(0)-6,ink('#20333b'),'right');
  text((alongY?'+X':nrmAligned?'−Y′':'−Y')+' / Up',p2.x+p2.w-3,p2.y+14,ink('#20333b'),'right');
  text((alongY?'−X':nrmAligned?'+Y′':'+Y')+' / Down',p2.x+p2.w-3,p2.y+p2.h-7,ink('#20333b'),'right');
  function vectorSeries(data,project,verticalProjection){
   ctx.beginPath();for(const run of plotRuns(data,project))run.forEach((v,i)=>{if(i===0)ctx.moveTo(zs.sx(v[0]),zs.sy(v[1]));else ctx.lineTo(zs.sx(v[0]),zs.sy(v[1]))});
   ctx.strokeStyle=verticalProjection?vColor:hColor;ctx.lineWidth=1.3;ctx.stroke();
   for(const row of data){const v=project(row);if(!v||!v.every(Number.isFinite))continue;
    const current=rowIdentityForPlot(row)===rowIdentityForPlot(suspect);
    mark(row,()=>point(zs.sx(v[0]),zs.sy(v[1]),row._screened_out?ink('#bd352f'):row._screened_changed?ink('#007d80'):(verticalProjection?vColor:hColor),row._screened_out?'cross':verticalProjection?'square':'circle',!verticalProjection,current?6:4));
   }
  }
  function rowIdentityForPlot(row){return row._review_identity||row.specimen+'|'+row.timestamp}
  vectorSeries(local,horizontal,false);vectorSeries(local,vertical,true);
  for(const ghost of localGhosts)for(const project of [horizontal,vertical])highlight(ghost,project,zs,ink('#bd352f'),'cross');
  if(proposed)for(const project of [horizontal,vertical])highlight(proposed,project,zs,ink('#007d80'),'diamond');
  text(options.repeatCandidates?.length?'● Horizontal   □ Vertical · repeat colors':'● Horizontal (red)   □ Vertical (blue)',p2.x,p2.y+p2.h+54);
  text(`M₀ = ${scale.toExponential(2)} A·m² · first retained observation`,p2.x,p2.y+p2.h+72);
  text(nrmAligned?`Rotated to first retained D = ${rotation.toFixed(1)}°`:'East/Y and Down/Z plot downward · equal component scales',p2.x,p2.y+p2.h+90);
  // Sparse temperature annotations on the vertical projection aid step tracking.
  const labelled=visible,stride=Math.max(1,Math.ceil(labelled.length/8));
  labelled.forEach((row,i)=>{if(i%stride&&i!==labelled.length-1)return;const v=vertical(row);if(v&&v.every(Number.isFinite))text(`${temperature(row).toFixed(0)}°`,zs.sx(v[0])+7,zs.sy(v[1])-5,vColor)});
  // CSD retains all observations, including excluded or noisy readings.
  const p3=panels[3];title(p3,options.full?'Directional scatter · all specimen observations':'Directional scatter · nearby steps');
  const maxCsd=Math.max(12,...visible.filter(r=>finite(r.dir_csd)).map(r=>Number(r.dir_csd)));
  const cs=axes(p3,tmin,tmax,0,maxCsd*1.05,'Temperature (°C)','CSD (°)');
  const cp=r=>!r._plot_hidden&&finite(r.dir_csd)?[temperature(r),Number(r.dir_csd)]:null;
  series(local,cp,cs);series(localGhosts,cp,cs,ink('#bd352f'),false);for(const [threshold,color] of [[4,ink('#ef8c00')],[10,ink('#c62828')]]){ctx.beginPath();ctx.setLineDash([4,4]);ctx.moveTo(p3.x,cs.sy(threshold));ctx.lineTo(p3.x+p3.w,cs.sy(threshold));ctx.strokeStyle=color;ctx.stroke()}ctx.setLineDash([]);
  highlight(suspect,cp,cs,ink('#bd352f'),'square');text('10° high',p3.x+5,cs.sy(10)-5,ink('#c62828'));text('4° review',p3.x+p3.w-5,cs.sy(4)-5,ink('#b86b00'),'right');
  // Optional fit-review overlay: highlight the measured treatment window, not a PCA line.
  if(options.fitIdentities?.length){
    const ids=new Set(options.fitIdentities),gold=dark?'#ffd36c':'#a36a00';
    const windowRows=local.map(r=>({...r,_plot_hidden:r._plot_hidden||!ids.has(r.measurement),_screened_out:r._screened_out||!ids.has(r.measurement)}));
    function trace(project,scales){ctx.beginPath();for(const run of plotRuns(windowRows,project))run.forEach((v,i)=>{if(i===0)ctx.moveTo(scales.sx(v[0]),scales.sy(v[1]));else ctx.lineTo(scales.sx(v[0]),scales.sy(v[1]))});ctx.strokeStyle=gold;ctx.lineWidth=3;ctx.stroke();for(const r of windowRows){if(r._plot_hidden||r._screened_out)continue;const v=project(r);if(v)point(scales.sx(v[0]),scales.sy(v[1]),gold,'circle',false,5)}}
    trace(mp,ms);trace(cp,cs);trace(horizontal,zs);trace(vertical,zs);
    trace(stereoCoordinates,{sx:x=>x,sy:y=>y});
  }
  // Explicit repeat comparison: preserve true coordinates and separate clickable
  // numbered callouts so even coincident readings remain individually selectable.
  const candidates=options.repeatCandidates||[];
  if(candidates.length){
   const colors=options.candidateColors||candidates.map((_,i)=>`hsl(${(i*137.508)%360},75%,${dark?70:38}%)`);
   const labels=[];
   function candidateMark(row,i,x,y,panel,projection=''){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    const identity=rowIdentityForPlot(row),selected=identity===options.selectedIdentity,color=colors[i];
    point(x,y,color,projection==='vertical'?'square':'circle',projection!=='vertical',selected?7:5);
    if(selected){ctx.beginPath();ctx.arc(x,y,10,0,2*Math.PI);ctx.strokeStyle=ink('#20333b');ctx.lineWidth=2;ctx.stroke()}
    let lx=Math.max(panel.x+3,Math.min(x+12,panel.x+panel.w-40));
    let ly=Math.max(panel.y+3,Math.min(y-24-i*20,panel.y+panel.h-20));
    for(let tries=0;tries<candidates.length*4+8&&labels.some(r=>Math.abs(r.x-lx)<40&&Math.abs(r.y-ly)<20);tries++){
     ly+=21;if(ly>panel.y+panel.h-20){ly=panel.y+3;lx=Math.min(panel.x+panel.w-40,lx+42)}
    }
    labels.push({x:lx,y:ly});
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx+16,ly+9);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle=ink('#fff');ctx.fillRect(lx,ly,36,18);ctx.strokeStyle=color;ctx.lineWidth=selected?3:1;ctx.strokeRect(lx,ly,36,18);
    text(String(i+1)+(projection==='vertical'?' V':projection==='horizontal'?' H':''),lx+18,ly+13,color,'center');
    repeatHits.push({identity,x:lx,y:ly,w:36,h:18,kind:'label'},{identity,x:x-9,y:y-9,w:18,h:18,kind:'point'});
   }
   candidates.forEach((row,i)=>{
    if(local.some(r=>r.timestamp===row.timestamp&&r.specimen===row.specimen&&r._plot_hidden))return;
    for(const [project,scales,panel,name] of [[mp,ms,p0,''],[cp,cs,p3,''],[horizontal,zs,p2,'horizontal'],[vertical,zs,p2,'vertical']]){
     const v=project(row);if(v&&v.every(Number.isFinite))candidateMark(row,i,scales.sx(v[0]),scales.sy(v[1]),panel,name);
    }
    if(finite(row.dir_dec)&&finite(row.dir_inc)){
     const d=Number(row.dir_dec)*Math.PI/180,inc=Number(row.dir_inc)*Math.PI/180,r=Math.sqrt(Math.max(0,1-Math.abs(Math.sin(inc))));
     candidateMark(row,i,cx+radius*r*Math.sin(d),cy-radius*r*Math.cos(d),p1);
    }
   });
   function hitsAt(event){const rect=canvas.getBoundingClientRect();const x=(event.clientX-rect.left)*width/rect.width,y=(event.clientY-rect.top)*height/rect.height;
    const hits=repeatHits.filter(hit=>x>=hit.x&&x<=hit.x+hit.w&&y>=hit.y&&y<=hit.y+hit.h);
    const label=hits.find(hit=>hit.kind==='label');return label?[label.identity]:[...new Set(hits.map(hit=>hit.identity))];
   }
   canvas.onclick=event=>{const hits=hitsAt(event);if(hits.length===1)options.onCandidateClick?.(hits[0]);else if(hits.length>1)options.onCandidateOverlap?.(hits)};
   canvas.onmousemove=event=>{const hits=hitsAt(event);canvas.style.cursor=hits.length?'pointer':'default';canvas.title=hits.length>1?'Overlapping measurements: click a numbered callout or candidate button.':hits.length?'Select repeat '+(candidates.findIndex(r=>rowIdentityForPlot(r)===hits[0])+1):''};
  }
  // Selection is a UI focus marker, separate from quality/severity colors.
  // Draw last and at full opacity, including when this observation is excluded.
  const selectionColor=dark?'#ff70e8':'#b0008f',selectedTemp=temperature(suspect);
  const selectionLabel=`${Number.isFinite(selectedTemp)?selectedTemp.toFixed(1)+'°C':'temperature unavailable'}`;
  const selectedState=suspect._screened_out?' · EXCLUDED':suspect._screened_changed?' · CORRECTED':'';
  ctx.font='bold 13px system-ui';
  text(`SELECTED: ${suspect.specimen} · ${selectionLabel}${selectedState}${narrow?'':' · '+suspect.timestamp}`,12,18,selectionColor);
  ctx.font='12px system-ui';
  if(narrow){text(suspect.timestamp,12,36,ink('#40565e'));text('Pink halo = selected · H horizontal / V vertical',12,54,ink('#40565e'))}
  else text('Pink halo + leader = selected measurement; H = horizontal, V = vertical projection',12,36,ink('#40565e'));
  function selectionMarker(project,scales,panel,projection='',slot=0){
   const selectedRow=local.find(r=>r.timestamp===suspect.timestamp&&r.specimen===suspect.specimen)||suspect;
   const value=selectedRow._plot_hidden?null:project(selectedRow),label=`SELECTED${projection?' '+projection:''} · ${selectionLabel}`;
   const lx=panel.x+7,ly=panel.y+8+slot*27,lw=Math.min(panel.w-14,215);
   ctx.save();ctx.globalAlpha=1;ctx.setLineDash([]);
   if(value&&value.every(Number.isFinite)){
    const x=scales.sx(value[0]),y=scales.sy(value[1]);
    // Dark outer rim and light inner rim remain visible over any trajectory.
    for(const [radius,color,lineWidth] of [[11,'#101c22',5],[10,'#ffffff',3],[8,selectionColor,3]]){
     ctx.beginPath();ctx.arc(x,y,radius,0,2*Math.PI);ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();
    }
    point(x,y,selectionColor,projection==='V'?'square':'circle',projection!=='V',5);
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(lx+lw/2,ly+11);ctx.strokeStyle=selectionColor;ctx.lineWidth=1.5;ctx.stroke();
   }
   ctx.fillStyle=ink('#fff');ctx.fillRect(lx,ly,lw,22);ctx.strokeStyle=selectionColor;ctx.lineWidth=2;ctx.strokeRect(lx,ly,lw,22);
   ctx.font='bold 11px system-ui';text(value&&value.every(Number.isFinite)?label:(selectedRow._plot_hidden?'SELECTED · hidden from this view':'SELECTED · value unavailable'),lx+6,ly+15,selectionColor);ctx.restore();
  }
  selectionMarker(mp,ms,p0);selectionMarker(cp,cs,p3);
  const stereoProject=row=>{if(!finite(row.dir_dec)||!finite(row.dir_inc))return null;const d=Number(row.dir_dec)*Math.PI/180,i=Number(row.dir_inc)*Math.PI/180,r=Math.sqrt(Math.max(0,1-Math.abs(Math.sin(i))));return [cx+radius*r*Math.sin(d),cy-radius*r*Math.cos(d)]};
  selectionMarker(stereoProject,{sx:x=>x,sy:y=>y},p1);
  selectionMarker(horizontal,zs,p2,'H');selectionMarker(vertical,zs,p2,'V',1);
  text(`${hiddenCount} other excluded/outlier observations hidden · selected case remains visible · current: ${options.status||'pending'}`,12,height-9,ink('#40565e'));
}
