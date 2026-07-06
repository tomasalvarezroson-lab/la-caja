
/* ---------- GATE ---------- */
const PASS_HASH='11d3e5795e5d027045849d29cdd8f1ea409b8b92624899525d4758b6bfdd6bd2';
async function sha256(str){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function unlockGate(){document.getElementById('gate').style.display='none';loadData();}
async function checkGate(){
  const stored=sessionStorage.getItem('lc_auth');
  if(stored===PASS_HASH){unlockGate();return;}
  document.getElementById('gate').style.display='flex';
}
document.getElementById('gateBtn').addEventListener('click',async()=>{
  const val=document.getElementById('gateInput').value;
  if(!val)return;
  const h=await sha256(val);
  if(h===PASS_HASH){sessionStorage.setItem('lc_auth',h);unlockGate();}
  else{document.getElementById('gateErr').textContent='Contraseña incorrecta';document.getElementById('gateInput').value='';document.getElementById('gateInput').focus();}
});
document.getElementById('gateInput').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('gateBtn').click();});
checkGate();

let DATA = [];

const COL={navy:'#1A2E60',azul:'#50B3EA',ing:'#2F5FD0',egr:'#E2615A',marie:'#D6455D',usd:'#3FA98A',lime:'#7BC23E',faint:'#8A94A6',border:'#E4E8F0'};
const CAT_COL={'Comida':'#E2615A','Vehículo':'#E89A4F','Servicios':'#50B3EA','Salud':'#3FA98A','Regalos':'#9B7ED8','Entradas/Eventos':'#2F5FD0','Educación':'#2E9B83','Supermercado':'#E8B84F','Transporte':'#6B9BD8','Deuda':'#8A93E6','Crédito/Cuotas':'#8A93E6','Ropa':'#D98A4F','Actividades':'#45B0C4','Gastos importantes':'#C96A4A','Otros':'#94A3B8','Deuda Marie':'#D6455D','Ahorro USD':'#3FA98A','Sueldo':'#2F5FD0','Bono/Extra':'#7BC23E','Reintegro':'#7BC23E','Préstamo recibido':'#F0875C'};
const NO_CONSUMO=['Deuda Marie','Ahorro USD'];
const NO_ING=['Reintegro','Préstamo recibido'];
const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const state={sAño:new Set([2026]),sMes:new Set(),tipo:'todos',sCat:new Set(),sMed:new Set(),q:'',dDesde:'',dHasta:'',sortK:'fecha',sortDir:'desc',compMesA:null,compMesB:null};
let chBar,chDonut,chEvo;

function pm(x){return typeof x==='number'?x:(parseFloat(x)||0);}
function fmt(n){return '$'+Math.round(n).toLocaleString('es-AR');}
function fmtShort(n){n=Math.round(n);if(Math.abs(n)>=1e6)return '$'+(n/1e6).toFixed(1)+'M';if(Math.abs(n)>=1e3)return '$'+Math.round(n/1e3)+'k';return '$'+n;}
function parseDate(f){if(!f)return '';if(/^\d{4}-\d{2}-\d{2}/.test(f))return f.slice(0,10);const p=f.toString().split('/');return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:f;}
function mesFromISO(f){const m=parseInt((f||'').slice(5,7),10);return m?MESES[m-1]||'':'';}
function añoFromISO(f){const y=parseInt((f||'').slice(0,4),10);return y||null;}

function getFil(){
  return DATA.filter(d=>{
    if(state.sAño.size && !state.sAño.has(d.año))return false;
    if(state.sMes.size && !state.sMes.has(d.mes))return false;
    if(state.tipo!=='todos' && d.tipo!==state.tipo)return false;
    if(state.sCat.size && !state.sCat.has(d.cat))return false;
    if(state.sMed.size && !state.sMed.has(d.medio))return false;
    if(state.dDesde && parseDate(d.fecha)<state.dDesde)return false;
    if(state.dHasta && parseDate(d.fecha)>state.dHasta)return false;
    if(state.q){const s=(d.concepto+' '+(d.contraparte||'')+' '+d.cat).toLowerCase();if(!s.includes(state.q.toLowerCase()))return false;}
    return true;
  });
}
function agg(rows){
  let ing=0,gastos=0,marie=0,usd=0;
  rows.forEach(d=>{const x=pm(d.monto);
    if(d.tipo==='Ingreso'){if(!NO_ING.includes(d.cat))ing+=x;}
    else{if(d.cat==='Deuda Marie')marie+=x;else if(d.cat==='Ahorro USD')usd+=x;else gastos+=x;}});
  return {ing,gastos,marie,usd,tasa:ing?(marie+usd)/ing*100:0};
}

/* ---------- FILTER UI ---------- */
function buildFilters(){
  // Año chips
  const años=[...new Set(DATA.map(d=>d.año))].filter(Boolean).sort();
  document.getElementById('fAño').innerHTML=
    `<button class="chip${!state.sAño.size?' on':''}" data-año="todos">Todos</button>`+
    años.map(y=>`<button class="chip${state.sAño.has(y)?' on':''}" data-año="${y}">${y}</button>`).join('');

  // Tipo chips
  document.getElementById('fTipo').innerHTML=['todos','Ingreso','Egreso'].map(t=>{
    const on=(t==='todos'&&state.tipo==='todos')||(t!=='todos'&&t===state.tipo);
    return `<button class="chip${on?' on':''}" data-tipo="${t}">${t==='todos'?'Todos':t}</button>`;
  }).join('');

  // Mes dropdown panel
  buildMesPanel();

  // Cat dropdown (ordered by spend across all data)
  const catTot={};DATA.filter(d=>d.tipo==='Egreso').forEach(d=>catTot[d.cat]=(catTot[d.cat]||0)+pm(d.monto));
  const cats=Object.keys(catTot).sort((a,b)=>catTot[b]-catTot[a]);
  document.getElementById('catPanel').innerHTML=cats.map(c=>`<label class="dd-opt"><input type="checkbox" data-cat="${c}"${state.sCat.has(c)?' checked':''}><span class="dot" style="background:${CAT_COL[c]||'#94A3B8'}"></span>${c}</label>`).join('')
    +`<div class="dd-foot"><button id="catNone">Limpiar</button><button id="catClose">Cerrar</button></div>`;

  // Medio dropdown panel
  buildMedPanel();

  refreshCatBtn();refreshMesBtn();refreshMedBtn();
}

function buildMesPanel(){
  const añosActivos=state.sAño.size?[...state.sAño]:[...new Set(DATA.map(d=>d.año).filter(Boolean))];
  const meses=MESES.filter(m=>DATA.some(d=>d.mes===m&&añosActivos.includes(d.año)));
  document.getElementById('mesPanel').innerHTML=meses.map(m=>`<label class="dd-opt"><input type="checkbox" data-mes="${m}"${state.sMes.has(m)?' checked':''}><span>${m}</span></label>`).join('')
    +`<div class="dd-foot"><button id="mesNone">Limpiar</button><button id="mesClose">Cerrar</button></div>`;
}

function buildMedPanel(){
  const medios=[...new Set(DATA.map(d=>d.medio))].filter(Boolean).sort();
  document.getElementById('medPanel').innerHTML=medios.map(m=>{
    const lab=m.replace('Santander - ','S·').replace('Mercado Pago - ','MP·');
    return `<label class="dd-opt"><input type="checkbox" data-med="${m}"${state.sMed.has(m)?' checked':''}><span>${lab}</span></label>`;
  }).join('')+`<div class="dd-foot"><button id="medNone">Limpiar</button><button id="medClose">Cerrar</button></div>`;
}

function refreshMesBtn(){
  const cnt=document.getElementById('mesCnt'),btn=document.getElementById('mesDDbtn');
  if(state.sMes.size){cnt.style.display='inline-block';cnt.textContent=state.sMes.size;btn.childNodes[0].nodeValue='Meses ';}
  else{cnt.style.display='none';btn.childNodes[0].nodeValue='Todos ';}
}
function refreshMedBtn(){
  const cnt=document.getElementById('medCnt'),btn=document.getElementById('medDDbtn');
  if(state.sMed.size){cnt.style.display='inline-block';cnt.textContent=state.sMed.size;btn.childNodes[0].nodeValue='Medios ';}
  else{cnt.style.display='none';btn.childNodes[0].nodeValue='Todos ';}
}
function refreshCatBtn(){
  const cnt=document.getElementById('catCnt'),btn=document.getElementById('catDDbtn');
  if(state.sCat.size){cnt.style.display='inline-block';cnt.textContent=state.sCat.size;btn.childNodes[0].nodeValue='Categorías ';}
  else{cnt.style.display='none';btn.childNodes[0].nodeValue='Todas ';}
}

/* ---------- KPIs ---------- */
function renderKpis(rows){
  const a=agg(rows);
  document.getElementById('kIng').textContent=fmt(a.ing);
  document.getElementById('kGas').textContent=fmt(a.gastos);
  document.getElementById('kGasH').textContent=a.ing?((a.gastos/a.ing*100).toFixed(0)+'% de ingresos'):'—';
  document.getElementById('kMarie').textContent=fmt(a.marie);
  document.getElementById('kUsd').textContent=fmt(a.usd);
  document.getElementById('kTasa').textContent=a.tasa.toFixed(0)+'%';
}

/* ---------- SMART ALERTS ---------- */
function renderAlerts(rows){
  const bar=document.getElementById('alertsRow');
  const eRows=rows.filter(d=>d.tipo==='Egreso'&&!NO_CONSUMO.includes(d.cat));
  const monthsWithData=MESES.filter(m=>eRows.some(d=>d.mes===m));
  const alerts=[];

  if(monthsWithData.length>=2){
    const lastM=monthsWithData[monthsWithData.length-1];
    const prevMs=monthsWithData.slice(0,-1);

    // Gasto total: último mes vs promedio
    const lastTotal=eRows.filter(d=>d.mes===lastM).reduce((s,d)=>s+pm(d.monto),0);
    const prevVals=prevMs.map(m=>eRows.filter(d=>d.mes===m).reduce((s,d)=>s+pm(d.monto),0));
    const prevAvg=prevVals.reduce((s,v)=>s+v,0)/prevMs.length;
    if(prevAvg>0){
      const pct=(lastTotal-prevAvg)/prevAvg*100;
      if(pct>15)alerts.push({type:'warn',ico:'📈',txt:`<b>${lastM}</b>: gasto total <b>+${pct.toFixed(0)}%</b> vs. promedio mensual (${fmt(lastTotal)} vs. ${fmt(prevAvg)}/mes)`});
      else if(pct<-15)alerts.push({type:'good',ico:'📉',txt:`<b>${lastM}</b>: gasto total <b>${pct.toFixed(0)}%</b> vs. promedio mensual (${fmt(lastTotal)} vs. ${fmt(prevAvg)}/mes)`});
    }

    // Por categoría: último mes vs promedio meses anteriores
    const catAlerts=[];
    [...new Set(eRows.map(d=>d.cat))].forEach(cat=>{
      const lv=eRows.filter(d=>d.mes===lastM&&d.cat===cat).reduce((s,d)=>s+pm(d.monto),0);
      const pvs=prevMs.map(m=>eRows.filter(d=>d.mes===m&&d.cat===cat).reduce((s,d)=>s+pm(d.monto),0));
      const pva=pvs.reduce((s,v)=>s+v,0)/prevMs.length;
      if(pva>5000&&lv>5000){const p=(lv-pva)/pva*100;if(Math.abs(p)>30)catAlerts.push({cat,p,lv,pva});}
    });
    catAlerts.sort((a,b)=>Math.abs(b.p)-Math.abs(a.p)).slice(0,3).forEach(({cat,p,lv,pva})=>{
      if(p>0)alerts.push({type:'warn',ico:'⚠️',txt:`<b>${cat}</b> en ${lastM}: <b>+${p.toFixed(0)}%</b> vs. promedio (${fmt(lv)} vs. ${fmt(pva)}/mes)`});
      else alerts.push({type:'good',ico:'✅',txt:`<b>${cat}</b> en ${lastM}: <b>${p.toFixed(0)}%</b> vs. promedio (${fmt(lv)} vs. ${fmt(pva)}/mes)`});
    });

    // Mes pico
    let peak=null,peakV=-1;
    monthsWithData.forEach(m=>{const v=eRows.filter(d=>d.mes===m).reduce((s,d)=>s+pm(d.monto),0);if(v>peakV){peakV=v;peak=m;}});
    if(peak)alerts.push({type:'info',ico:'📅',txt:`Mes pico del período: <b>${peak}</b> (${fmt(peakV)})`});
  }

  // Categoría dominante
  const byCat={};
  eRows.forEach(d=>byCat[d.cat]=(byCat[d.cat]||0)+pm(d.monto));
  const totalCat=Object.values(byCat).reduce((s,v)=>s+v,0);
  const sorted=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  if(sorted.length&&totalCat>0){
    const[tc,tv]=sorted[0];const pct=tv/totalCat*100;
    if(pct>20)alerts.push({type:'info',ico:'🏷️',txt:`<b>${tc}</b> concentra el <b>${pct.toFixed(0)}%</b> de tus gastos de consumo (${fmt(tv)})`});
  }

  // Tasa de ahorro
  const a=agg(rows);
  if(a.ing>0){
    if(a.tasa<10)alerts.push({type:'alert',ico:'🔴',txt:`Tasa de ahorro del período: <b>${a.tasa.toFixed(0)}%</b> — revisá gastos recurrentes`});
    else if(a.tasa>35)alerts.push({type:'good',ico:'🟢',txt:`Tasa de ahorro del período: <b>${a.tasa.toFixed(0)}%</b> — excelente ritmo`});
  }

  if(!alerts.length){bar.style.display='none';return;}
  bar.style.display='flex';
  bar.innerHTML=alerts.map(al=>`<div class="al-card al-${al.type}"><span class="al-ico">${al.ico}</span><div class="al-txt">${al.txt}</div></div>`).join('');
}

/* ---------- CHART 1: barras ---------- */
function renderBar(rows){
  const meses=MESES.filter(m=>(state.sMes.size?state.sMes.has(m):true)&&rows.some(d=>d.mes===m));
  const ing=[],gas=[],mar=[],usd=[];
  meses.forEach(m=>{const a=agg(rows.filter(d=>d.mes===m));ing.push(a.ing);gas.push(a.gastos);mar.push(a.marie);usd.push(a.usd);});
  const ds=[
    {label:'Ingresos',data:ing,backgroundColor:COL.ing,stack:'ing',borderRadius:5,maxBarThickness:46},
    {label:'Gastos',data:gas,backgroundColor:COL.egr,stack:'egr',borderRadius:{topLeft:0,topRight:0},maxBarThickness:46},
    {label:'Deuda Marie',data:mar,backgroundColor:COL.marie,stack:'egr',maxBarThickness:46},
    {label:'Compra USD',data:usd,backgroundColor:COL.usd,stack:'egr',borderRadius:5,maxBarThickness:46},
  ];
  if(chBar)chBar.destroy();
  chBar=new Chart(document.getElementById('chBar'),{type:'bar',data:{labels:meses.map(m=>m.slice(0,3)),datasets:ds},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'bottom',labels:{font:{family:'Lato',size:11},boxWidth:12,boxHeight:12,padding:14,usePointStyle:true,pointStyle:'rectRounded'}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmt(c.parsed.y)}}},
      scales:{x:{stacked:true,grid:{display:false},ticks:{font:{family:'Lato',size:12}}},
        y:{stacked:true,grid:{color:'#EEF1F7'},ticks:{font:{family:'Lato',size:11},callback:v=>fmtShort(v)}}}}});
}

/* ---------- CHART 2: donut ---------- */
function renderDonut(rows){
  const byCat={};
  rows.filter(d=>d.tipo==='Egreso'&&!NO_CONSUMO.includes(d.cat)).forEach(d=>byCat[d.cat]=(byCat[d.cat]||0)+pm(d.monto));
  const ents=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const labels=ents.map(e=>e[0]),vals=ents.map(e=>e[1]),cols=labels.map(c=>CAT_COL[c]||'#94A3B8');
  const total=vals.reduce((s,v)=>s+v,0);
  if(chDonut)chDonut.destroy();
  chDonut=new Chart(document.getElementById('chDonut'),{type:'doughnut',data:{labels,datasets:[{data:vals,backgroundColor:cols,borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{position:'right',labels:{font:{family:'Lato',size:11},boxWidth:11,boxHeight:11,padding:8,usePointStyle:true,pointStyle:'rectRounded'}},
        tooltip:{callbacks:{label:c=>c.label+': '+fmt(c.parsed)+' ('+(total?(c.parsed/total*100).toFixed(1):0)+'%)'}}}}});
}

/* ---------- CHART 3: evolución ---------- */
function renderEvo(rows){
  const meses=MESES.filter(m=>rows.some(d=>d.mes===m));
  const gas=[],tasa=[];
  meses.forEach(m=>{const a=agg(rows.filter(d=>d.mes===m));gas.push(a.gastos);tasa.push(+a.tasa.toFixed(1));});
  if(chEvo)chEvo.destroy();
  chEvo=new Chart(document.getElementById('chEvo'),{data:{labels:meses,datasets:[
    {type:'bar',label:'Gasto de consumo',data:gas,backgroundColor:'rgba(226,97,90,.78)',borderRadius:6,maxBarThickness:54,yAxisID:'y'},
    {type:'line',label:'Tasa de ahorro %',data:tasa,borderColor:COL.navy,backgroundColor:'rgba(26,46,96,.08)',borderWidth:2.5,tension:.35,fill:true,pointRadius:4,pointBackgroundColor:COL.navy,yAxisID:'y1'}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'bottom',labels:{font:{family:'Lato',size:11},boxWidth:12,padding:14,usePointStyle:true,pointStyle:'rectRounded'}},
        tooltip:{callbacks:{label:c=>c.dataset.yAxisID==='y1'?c.dataset.label+': '+c.parsed.y+'%':c.dataset.label+': '+fmt(c.parsed.y)}}},
      scales:{x:{grid:{display:false},ticks:{font:{family:'Lato',size:12}}},
        y:{position:'left',grid:{color:'#EEF1F7'},ticks:{font:{family:'Lato',size:11},callback:v=>fmtShort(v)}},
        y1:{position:'right',grid:{display:false},min:0,ticks:{font:{family:'Lato',size:11},callback:v=>v+'%'}}}}});
}

/* ---------- COMPARATIVO MES A MES ---------- */
function renderComparacion(){
  const card=document.getElementById('compCard');
  const yearData=DATA.filter(d=>!state.sAño.size||state.sAño.has(d.año));
  const eRows=yearData.filter(d=>d.tipo==='Egreso'&&!NO_CONSUMO.includes(d.cat));
  const monthsWithData=MESES.filter(m=>eRows.some(d=>d.mes===m));
  if(monthsWithData.length<2){card.style.display='none';return;}
  card.style.display='';
  // Auto-pick or validate selected months
  if(!state.compMesB||!monthsWithData.includes(state.compMesB))
    state.compMesB=monthsWithData[monthsWithData.length-1];
  if(!state.compMesA||!monthsWithData.includes(state.compMesA)||state.compMesA===state.compMesB)
    state.compMesA=monthsWithData[monthsWithData.length-2]||monthsWithData[0];
  const mesA=state.compMesA,mesB=state.compMesB;
  const catA={},catB={};
  eRows.filter(d=>d.mes===mesA).forEach(d=>catA[d.cat]=(catA[d.cat]||0)+pm(d.monto));
  eRows.filter(d=>d.mes===mesB).forEach(d=>catB[d.cat]=(catB[d.cat]||0)+pm(d.monto));
  const totalA=Object.values(catA).reduce((s,v)=>s+v,0);
  const totalB=Object.values(catB).reduce((s,v)=>s+v,0);
  const dTotal=totalA?(totalB-totalA)/totalA*100:0;
  const dTSign=dTotal>=0?'+':'';
  const dTCls=dTotal>2?'comp-bad':dTotal<-2?'comp-good':'comp-flat';
  const cats=[...new Set([...Object.keys(catA),...Object.keys(catB)])].sort((a,b)=>(catB[b]||0)-(catB[a]||0));
  const maxV=Math.max(...cats.map(c=>Math.max(catA[c]||0,catB[c]||0)),1);
  const rowsHtml=cats.map(c=>{
    const va=catA[c]||0,vb=catB[c]||0;
    const d=va?(vb-va)/va*100:(vb>0?100:0);
    const dCl=d>5?'comp-bad':d<-5?'comp-good':'comp-flat';
    const dAr=d>5?'↑':d<-5?'↓':'→';
    const col=CAT_COL[c]||'#94A3B8';
    const bA=(va/maxV*100).toFixed(0),bB=(vb/maxV*100).toFixed(0);
    return `<div class="comp-row">
      <div class="comp-cat"><span class="dot" style="background:${col}"></span>${c}</div>
      <div class="comp-cell"><div class="comp-bar-wrap"><div class="comp-bar" style="width:${bA}%;background:${col}55"></div></div><span class="comp-amt">${fmtShort(va)}</span></div>
      <div class="comp-cell"><div class="comp-bar-wrap"><div class="comp-bar" style="width:${bB}%;background:${col}"></div></div><span class="comp-amt">${fmtShort(vb)}</span></div>
      <div class="comp-delta ${dCl}">${dAr} ${va?(d>=0?'+':'')+d.toFixed(0)+'%':'nuevo'}</div>
    </div>`;}).join('');
  const mkOpts=(sel)=>monthsWithData.map(m=>`<option value="${m}"${m===sel?' selected':''}>${m}</option>`).join('');
  card.innerHTML=`<div class="comp-top">
    <div class="ct" style="margin:0">Comparativo de consumo</div>
    <div class="comp-sel-wrap">
      <select class="comp-sel" id="compSelA">${mkOpts(mesA)}</select>
      <span class="comp-vs">vs</span>
      <select class="comp-sel" id="compSelB">${mkOpts(mesB)}</select>
    </div>
  </div>
  <div class="comp-summary">
    <div class="comp-sum-card comp-sum-a"><div class="lab">${mesA}</div><div class="val">${fmt(totalA)}</div><div class="hint">gasto de consumo</div></div>
    <div class="comp-sum-card comp-sum-mid"><div class="lab">Variación</div><div class="val ${dTCls}">${dTSign}${dTotal.toFixed(1)}%</div><div class="hint">${totalB>totalA?'gastás más':'gastás menos'}</div></div>
    <div class="comp-sum-card comp-sum-b"><div class="lab">${mesB}</div><div class="val">${fmt(totalB)}</div><div class="hint">gasto de consumo</div></div>
  </div>
  <div class="comp-header-row">
    <div class="comp-cat">Categoría</div>
    <div class="comp-cell"><span class="comp-col-lab">${mesA}</span></div>
    <div class="comp-cell"><span class="comp-col-lab">${mesB}</span></div>
    <div class="comp-delta" style="color:var(--faint);font-weight:800;font-size:11px">VARIACIÓN</div>
  </div>
  <div class="comp-rows">${rowsHtml}</div>`;
  document.getElementById('compSelA').addEventListener('change',e=>{state.compMesA=e.target.value;renderComparacion();});
  document.getElementById('compSelB').addEventListener('change',e=>{state.compMesB=e.target.value;renderComparacion();});
}

/* ---------- TABLE ---------- */
function renderTable(){
  let rows=getFil().slice();const mu=state.sortDir==='asc'?1:-1,k=state.sortK;
  rows.sort((a,b)=>{
    if(k==='monto')return(pm(a.monto)-pm(b.monto))*mu;
    if(k==='fecha'){const pa=parseDate(a.fecha),pb=parseDate(b.fecha);return pa<pb?-mu:pa>pb?mu:0;}
    const va=(a[k]||'').toString().toLowerCase(),vb=(b[k]||'').toString().toLowerCase();return va<vb?-mu:va>vb?mu:0;});
  const tb=document.getElementById('tbody');
  tb.innerHTML=rows.map(d=>{
    const c=CAT_COL[d.cat]||'#94A3B8';const eg=d.tipo==='Egreso';
    return `<tr><td class="mono">${d.fecha}</td><td>${d.mes.slice(0,3)}</td><td>${d.tipo}</td>
      <td><span class="pill" style="background:${c}">${d.cat}</span></td>
      <td>${d.concepto}${d.cuotaN?` <span style="color:${COL.faint};font-size:11px">(${d.cuotaN}/${d.cuotaT})</span>`:''}</td>
      <td style="color:${COL.faint}">${d.medio.replace('Santander - ','S·').replace('Mercado Pago - ','MP·')}</td>
      <td class="amt ${eg?'eg':'in'} mono">${eg?'-':'+'}${fmt(pm(d.monto))}</td></tr>`;}).join('');
  document.getElementById('tblTitle').textContent=`Movimientos (${rows.length})`;
}

function renderAll(){
  const rows=getFil();
  renderKpis(rows);renderBar(rows);renderDonut(rows);renderEvo(rows);renderTable();renderAlerts(rows);renderComparacion();
}

/* ---------- INSIGHTS (snapshot) ---------- */
function snapshot(){
  const s={byCat:{},byMonth:{},ts:Date.now()};let ing=0,gastos=0,marie=0,usd=0;
  DATA.forEach(d=>{const x=pm(d.monto);
    if(d.tipo==='Ingreso'){if(!NO_ING.includes(d.cat))ing+=x;}
    else{if(d.cat==='Deuda Marie')marie+=x;else if(d.cat==='Ahorro USD')usd+=x;else{gastos+=x;s.byCat[d.cat]=(s.byCat[d.cat]||0)+x;}}});
  s.ing=ing;s.gastos=gastos;s.marie=marie;s.usd=usd;
  MESES.forEach(m=>{s.byMonth[m]=DATA.filter(d=>d.mes===m&&d.tipo==='Egreso'&&!NO_CONSUMO.includes(d.cat)).reduce((a,d)=>a+pm(d.monto),0);});
  return s;
}
function pctDelta(cur,prev){if(!prev)return null;if(prev===0)return cur>0?100:0;return (cur-prev)/prev*100;}
function deltaTag(p){if(p===null)return '<span class="flat">— sin dato previo</span>';
  const cls=p>1?'up':(p<-1?'down':'flat');const ar=p>1?'▲':(p<-1?'▼':'■');return `<span class="${cls}">${ar} ${p>=0?'+':''}${p.toFixed(1)}% vs última</span>`;}
function statCard(lab,val,delta){return `<div class="ins-card"><div class="lab">${lab}</div><div class="val">${val}</div><div class="dlt">${delta}</div></div>`;}

function topMonth(s){let best=null,bv=-1;MESES.forEach(m=>{if(s.byMonth[m]>bv){bv=s.byMonth[m];best=m;}});return {m:best,v:bv};}
function topGrowCat(cur,prev){
  if(!prev)return null;let best=null,bd=-1e9;
  Object.keys(cur.byCat).forEach(c=>{const d=cur.byCat[c]-(prev.byCat[c]||0);if(d>bd){bd=d;best=c;}});
  return bd>0?{c:best,d:bd}:null;
}
function renderInsights(){
  const cur=snapshot();let prev=null;
  try{const raw=localStorage.getItem('cf_snap_v1');if(raw)prev=JSON.parse(raw);}catch(e){}
  const body=document.getElementById('insightsBody');
  const when=document.getElementById('insWhen');
  const tm=topMonth(cur);
  const avgTasa=cur.ing?((cur.marie+cur.usd)/cur.ing*100):0;
  if(!prev){
    when.textContent='Primera carga · '+new Date().toLocaleString('es-AR');
    body.innerHTML=`<div class="ins-first">Primera carga. Guardé una foto del estado actual (ingresos, gastos por categoría, deuda y dolarización). La próxima vez que cargues una planilla actualizada, acá vas a ver exactamente qué cambió.</div>
    <div class="ins-grid" style="margin-top:12px">
      ${statCard('Ingresos',fmt(cur.ing),'<span class="flat">base</span>')}
      ${statCard('Gastos de consumo',fmt(cur.gastos),'<span class="flat">base</span>')}
      ${statCard('Deuda Marie pagada',fmt(cur.marie),'<span class="flat">base</span>')}
      ${statCard('Compra de dólares',fmt(cur.usd),'<span class="flat">base</span>')}
    </div>
    <div class="ins-concl">Mes de mayor consumo: <b>${tm.m}</b> (${fmt(tm.v)}). Tasa de ahorro promedio del período: <b>${avgTasa.toFixed(0)}%</b>.</div>`;
  } else {
    when.textContent='Comparado contra la última actualización · '+new Date(prev.ts).toLocaleString('es-AR');
    const gc=topGrowCat(cur,prev);
    const dGastos=pctDelta(cur.gastos,prev.gastos);
    let concl='';
    if(dGastos!==null){concl+=`Tu gasto de consumo ${dGastos>1?'subió':(dGastos<-1?'bajó':'se mantuvo')} ${Math.abs(dGastos).toFixed(1)}% respecto de la última vez. `;}
    if(gc){concl+=`La categoría que más creció fue <b>${gc.c}</b> (+${fmt(gc.d)}). `;}
    const topCat=Object.entries(cur.byCat).sort((a,b)=>b[1]-a[1])[0];
    if(topCat)concl+=`Tu mayor categoría de consumo sigue siendo <b>${topCat[0]}</b> (${fmt(topCat[1])}). `;
    concl+=`Deuda con Marie pagada acumulada: <b>${fmt(cur.marie)}</b>.`;
    body.innerHTML=`<div class="ins-grid">
      ${statCard('Ingresos',fmt(cur.ing),deltaTag(pctDelta(cur.ing,prev.ing)))}
      ${statCard('Gastos de consumo',fmt(cur.gastos),deltaTag(dGastos))}
      ${statCard('Deuda Marie pagada',fmt(cur.marie),deltaTag(pctDelta(cur.marie,prev.marie)))}
      ${statCard('Compra de dólares',fmt(cur.usd),deltaTag(pctDelta(cur.usd,prev.usd)))}
      ${statCard('Tasa de ahorro',avgTasa.toFixed(0)+'%','<span class="flat">prom. período</span>')}
      ${statCard('Mayor consumo',tm.m,'<span class="flat">'+fmt(tm.v)+'</span>')}
    </div>
    <div class="ins-concl">${concl}</div>`;
  }
  try{localStorage.setItem('cf_snap_v1',JSON.stringify(cur));}catch(e){}
}

/* ---------- EXPORT ---------- */
function exportCSV(){
  let rows=getFil().slice();const mu=state.sortDir==='asc'?1:-1,k=state.sortK;
  rows.sort((a,b)=>{if(k==='monto')return(pm(a.monto)-pm(b.monto))*mu;if(k==='fecha'){const pa=parseDate(a.fecha),pb=parseDate(b.fecha);return pa<pb?-mu:pa>pb?mu:0;}const va=(a[k]||'').toString().toLowerCase(),vb=(b[k]||'').toString().toLowerCase();return va<vb?-mu:va>vb?mu:0;});
  const cols=['Fecha','Mes','Tipo','Categoría','Concepto','Contraparte','Medio','Cuota','Monto','Divisa','Estado','Descripción'];
  const esc=v=>{v=(v==null?'':String(v));return '"'+v.replace(/"/g,'""')+'"';};
  const lines=[cols.join(',')];
  rows.forEach(d=>lines.push([d.fecha,d.mes,d.tipo,d.cat,d.concepto,d.contraparte||'',d.medio,(d.cuotaN?d.cuotaN+'/'+d.cuotaT:''),pm(d.monto),d.divisa,d.estado||'',(d.desc||'')].map(esc).join(',')));
  const csv='﻿'+lines.join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  const filt=state.sMes.size?[...state.sMes].join('-'):'todos';
  a.href=url;a.download='movimientos_'+filt+'.csv';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
  msg('✓ '+rows.length+' movimientos exportados',true);
}

/* ---------- LOAD PLANILLA ---------- */
function msg(t,ok){const el=document.getElementById('msg');el.textContent=t;el.style.color=ok?COL.lime:COL.egr;if(t)setTimeout(()=>{el.textContent='';},4500);}
function onFile(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=ev=>{try{
    const wb=XLSX.read(ev.target.result,{type:'binary'});
    const sh=wb.Sheets['Registro 2026']||wb.Sheets[wb.SheetNames[0]];
    const raw=XLSX.utils.sheet_to_json(sh,{defval:''});
    if(!raw.length){msg('La planilla está vacía',false);return;}
    DATA=raw.map((r,i)=>{const f=parseDate(r.fecha||r.Fecha||'');return {id:'x-'+i,fecha:f,año:añoFromISO(f),mes:r.mes||r.Mes||mesFromISO(f),hora:r.hora||r.Hora||'',tipo:r.tipo||r.Tipo||'Egreso',
      cat:r.cat||r.Categoría||r.Categoria||'Otros',concepto:r.concepto||r.Concepto||'',contraparte:r.contraparte||r.Contraparte||'',
      monto:Math.abs(pm(r.monto||r.Monto||0)),divisa:r.divisa||'ARS',medio:r.medio||r.Medio||'',
      cuotaN:r.cuotaN||'',cuotaT:r.cuotaT||'',reint:r.reint||'No',fuente:'manual',ref_banco:'',estado:r.estado||'',desc:r.desc||''}});
    buildFilters();renderAll();renderInsights();
    msg('✓ Planilla cargada: '+DATA.length+' movimientos',true);
  }catch(err){msg('Error al leer: '+err.message,false);}};
  r.readAsBinaryString(f);}

/* ---------- EVENTS ---------- */
// Año chips (single-select)
document.getElementById('fAño').addEventListener('click',e=>{
  const c=e.target.closest('[data-año]');if(!c)return;
  const v=c.dataset.año;
  if(v==='todos'){state.sAño.clear();}
  else{state.sAño.clear();state.sAño.add(parseInt(v,10));}
  document.querySelectorAll('#fAño .chip').forEach(x=>x.classList.remove('on'));
  c.classList.add('on');
  state.sMes.clear();
  buildMesPanel();refreshMesBtn();
  renderAll();
});

// Tipo chips
document.getElementById('fTipo').addEventListener('click',e=>{
  const c=e.target.closest('[data-tipo]');if(!c)return;
  state.tipo=c.dataset.tipo;
  document.querySelectorAll('#fTipo .chip').forEach(x=>x.classList.toggle('on',x.dataset.tipo===state.tipo));
  renderAll();
});

// Mes dropdown
document.getElementById('mesDDbtn').addEventListener('click',()=>{
  const p=document.getElementById('mesPanel');p.style.display=p.style.display==='none'?'block':'none';
});
document.getElementById('mesPanel').addEventListener('click',e=>{
  if(e.target.id==='mesNone'){state.sMes.clear();document.querySelectorAll('#mesPanel input').forEach(x=>x.checked=false);refreshMesBtn();renderAll();return;}
  if(e.target.id==='mesClose'){document.getElementById('mesPanel').style.display='none';return;}
});
document.getElementById('mesPanel').addEventListener('change',e=>{
  const m=e.target.dataset.mes;if(!m)return;tog(state.sMes,m);refreshMesBtn();renderAll();
});

// Cat dropdown
document.getElementById('catDDbtn').addEventListener('click',()=>{
  const p=document.getElementById('catPanel');p.style.display=p.style.display==='none'?'block':'none';
});
document.getElementById('catPanel').addEventListener('click',e=>{
  if(e.target.id==='catNone'){state.sCat.clear();document.querySelectorAll('#catPanel input').forEach(x=>x.checked=false);refreshCatBtn();renderAll();return;}
  if(e.target.id==='catClose'){document.getElementById('catPanel').style.display='none';return;}
});
document.getElementById('catPanel').addEventListener('change',e=>{const c=e.target.dataset.cat;if(!c)return;tog(state.sCat,c);refreshCatBtn();renderAll();});

// Med dropdown
document.getElementById('medDDbtn').addEventListener('click',()=>{
  const p=document.getElementById('medPanel');p.style.display=p.style.display==='none'?'block':'none';
});
document.getElementById('medPanel').addEventListener('click',e=>{
  if(e.target.id==='medNone'){state.sMed.clear();document.querySelectorAll('#medPanel input').forEach(x=>x.checked=false);refreshMedBtn();renderAll();return;}
  if(e.target.id==='medClose'){document.getElementById('medPanel').style.display='none';return;}
});
document.getElementById('medPanel').addEventListener('change',e=>{
  const m=e.target.dataset.med;if(!m)return;tog(state.sMed,m);refreshMedBtn();renderAll();
});

// Cerrar dropdowns al hacer click afuera
document.addEventListener('click',e=>{
  if(!e.target.closest('#catDD'))document.getElementById('catPanel').style.display='none';
  if(!e.target.closest('#mesDD'))document.getElementById('mesPanel').style.display='none';
  if(!e.target.closest('#medDD'))document.getElementById('medPanel').style.display='none';
});

document.getElementById('dDesde').addEventListener('change',e=>{state.dDesde=e.target.value;renderAll();});
document.getElementById('dHasta').addEventListener('change',e=>{state.dHasta=e.target.value;renderAll();});
document.getElementById('thead').addEventListener('click',e=>{const th=e.target.closest('[data-k]');if(!th)return;const k=th.dataset.k;if(state.sortK===k)state.sortDir=state.sortDir==='asc'?'desc':'asc';else{state.sortK=k;state.sortDir='asc';}renderTable();});
document.getElementById('search').addEventListener('input',e=>{state.q=e.target.value;renderTable();});

document.getElementById('clrBtn').addEventListener('click',()=>{
  state.sAño=new Set([2026]);state.sMes.clear();state.sCat.clear();state.sMed.clear();state.tipo='todos';state.q='';state.dDesde='';state.dHasta='';
  document.getElementById('search').value='';document.getElementById('dDesde').value='';document.getElementById('dHasta').value='';
  document.querySelectorAll('#fAño .chip').forEach(x=>x.classList.toggle('on',x.dataset.año==='2026'));
  document.querySelectorAll('#fTipo .chip').forEach(x=>x.classList.toggle('on',x.dataset.tipo==='todos'));
  document.querySelectorAll('#catPanel input').forEach(x=>x.checked=false);refreshCatBtn();
  buildMesPanel();refreshMesBtn();
  document.querySelectorAll('#medPanel input').forEach(x=>x.checked=false);refreshMedBtn();
  renderAll();
});

document.getElementById('loadBtn').addEventListener('click',()=>document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change',onFile);
document.getElementById('exportBtn').addEventListener('click',exportCSV);
document.getElementById('qBtn').addEventListener('click',()=>{const ins=document.getElementById('insights');ins.classList.toggle('open');document.getElementById('qBtn').classList.toggle('on');});

function tog(set,v){set.has(v)?set.delete(v):set.add(v);}

/* ---------- INIT ---------- */
async function loadData(){
  try{
    const res=await fetch('./data.json?t='+Date.now(),{cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    DATA=await res.json();
  }catch(err){
    msg('No pude cargar data.json: '+err.message+'. Cargá una planilla manualmente.',false);
    DATA=[];
  }
  document.getElementById('dDesde').value='';
  document.getElementById('dHasta').value='';
  buildFilters();renderAll();renderInsights();
}
