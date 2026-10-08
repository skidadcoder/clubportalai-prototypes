// Disposable #406 prototype. Synthetic fixtures and in-memory state only.
'use strict';
const TODAY='2027-01-20', SEASON_START='2026-09-01', SEASON_END='2027-04-30';
const MIN_DUE_DATE=TODAY>SEASON_START?TODAY:SEASON_START;
const CADENCES=['monthly','semi','biweekly','weekly'];
const LABELS={monthly:'Monthly',semi:'1st & 15th',biweekly:'Every 2 weeks',weekly:'Weekly',full:'Pay in Full'};
const DESCRIPTIONS={monthly:'One payment per month.',semi:'Two payments per month, on the 1st and 15th.',biweekly:'One payment every 14 days.',weekly:'One payment every 7 days.'};
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
const dateText=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Choose a date';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
const monthIndex=d=>{const [y,m]=d.split('-').map(Number);return y*12+m-1};
const monthDate=(i,day=15)=>`${Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
const allocate=(total,count)=>Array.from({length:count},(_,i)=>Math.floor(total/count)+(i===count-1?total%count:0));
const railLabel=r=>r==='ach'?'Check/ACH':'Credit/Debit';
let fixture='all',step=0,choice='monthly',errors=[],message='',screen='staff',familyStep=0,familyRail='ach',familyChoice='monthly',optional=false,signed=false,authorized=false,sent=null,history=[],enrolled=null,modalOpen=false;
let reviewChoice=null;
const dirtyDues=new Set();
function options(){return fixture==='full'?['full']:fixture==='plans'?CADENCES:fixture==='all'?[...CADENCES,'full']:['monthly','full']}
function name(c){return LABELS[c]}
function bases(data=draft){return data.dual?['ach','card']:['ach']}
function suggestion(start,basis){return Math.round(basis*(monthIndex(SEASON_END)-monthIndex(start)+1)/8)}
function dueDates(start,c){
  const dates=[];
  if(c==='monthly'||c==='semi'){
    for(let i=monthIndex(SEASON_START);i<=monthIndex(SEASON_END);i++)for(const day of c==='semi'?[1,15]:[15])dates.push(monthDate(i,day));
  }else{
    const cursor=new Date('2026-09-15T12:00:00Z'),interval=c==='weekly'?7:14;
    while(cursor.toISOString().slice(0,10)<=SEASON_END){dates.push(cursor.toISOString().slice(0,10));cursor.setUTCDate(cursor.getUTCDate()+interval)}
  }
  const before=dates.filter(d=>d<=start);const first=before.length?before[before.length-1]:dates[0];
  return dates.filter(d=>d>=first);
}
function schedule(start,c,total,publishedReference=false){const published=dueDates(start,c),dates=publishedReference?published:[...new Set(published.map(date=>date<MIN_DUE_DATE?MIN_DUE_DATE:date))],amounts=allocate(total,dates.length);return dates.map((date,i)=>({date,amount:amounts[i]}))}
function fresh(){
  const start='2027-01-20',dues={ach:40000,card:40000};
  return {start,dual:false,dues,schedules:Object.fromEntries(CADENCES.map(c=>[c,{ach:schedule(start,c,dues.ach),card:schedule(start,c,dues.card)}])),charges:{deposit:{name:'Enrollment Deposit',ach:10000,card:10000,date:MIN_DUE_DATE,required:true},uniform:{name:'Uniform package',ach:8000,card:8000,date:'2027-01-25',required:true},warmup:{name:'Warm-up jacket',ach:4500,card:4500,date:'2027-02-01',required:false}},reason:''};
}
let draft=fresh();
function announce(s){document.getElementById('announcer').textContent=s}
function baseHeader(portal=false){return `<header class="appbar"><div class="row"><div class="brand">C</div><span class="appbrand">ClubPortalAI</span>${portal?'<span class="badge">Parent Portal</span>':''}</div>${portal?'<div class="row"><span class="muted">Morgan Ellis</span><div class="avatar">ME</div></div>':'<div class="appnav"><span>Dashboard</span><span>Players</span><strong>Teams</strong><span>Finance</span></div><div class="row"><span class="muted">Alex · Director</span><div class="avatar">AR</div></div>'}</header>`}
function staff(){
  screen='staff';document.getElementById('app').innerHTML=baseHeader()+`<main class="workspace"><div class="crumb">Teams &nbsp; / &nbsp; 2026–27 Season &nbsp; / &nbsp; 14 Regional</div><div class="workspace-top row between wrap"><div><div class="eyebrow">Roster planning</div><h1 style="margin-top:7px">14 Regional</h1><div class="team-facts"><span>Regional · Girls 14U</span><span>Sep 1, 2026 – Apr 30, 2027</span><span>10 rostered players</span></div></div><span class="badge green">Season active</span></div><div class="tabs"><span>Roster</span><strong>Team Offers</strong></div><section class="offer-list"><div class="offer-head row between"><h3>${enrolled?'Completed enrollment':sent?'Sent Team Offer':'Draft Team Offer'}</h3><span class="badge ${sent?'green':'amber'}">${enrolled?'Enrolled':sent?'Awaiting family':'Needs review'}</span></div><div class="offer-row"><div class="avatar">AE</div><div class="name"><strong>Amara Ellis</strong><small>Regular placement · Midseason joiner</small></div><div><small>Season Tuition Plan</small><p>Regional 14U · 2026–27</p></div><button class="primary" id="open-review">${enrolled?'View enrollment':sent?'View sent offer':'Confirm Team Offers'}</button></div></section><details class="review-note" open><summary>Prototype review notes</summary><p><strong>Staff console only.</strong> Issue #409 keeps the existing Parent Offers &amp; Enrollment experience. This prototype does not propose parent-facing UI changes.</p><p>Single price by default. Enable different payment-method prices in the Dues review to try dual pricing for every charge.</p><p>Changing Dues resets amounts in every offered Payment Plan when you leave the field. Edited dates stay as entered. To keep a custom first payment, set it and choose “Keep first payment & split the rest”.</p><p>The supported cadences are Monthly, 1st & 15th, Every 2 weeks and Weekly. The prototype bar changes the synthetic published choices; Pay in Full remains a separate option when offered.</p><p>Business date: January 20, 2027. All data, agreement and payment methods are synthetic. Split-payer enrollment and decommitment settlement are outside this demo. Nothing is sent or charged. Reload resets the demo.</p></details></main>`;
  document.getElementById('open-review').onclick=()=>sent?openSuccess():openModal();
}
function amountInput(id,label,value,help=''){return `<div class="field"><label for="${id}">${label}</label><div class="money-input"><span aria-hidden="true">$</span><input id="${id}" type="number" min="0" step=".01" value="${Number.isFinite(value)?(value/100).toFixed(2):''}" ${help?`aria-describedby="${id}-help"`:''}></div>${help?`<small id="${id}-help">${help}</small>`:''}</div>`}
function dateInput(id,label,value){return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="date" min="${id==='start'?SEASON_START:MIN_DUE_DATE}" max="${SEASON_END}" value="${value}"></div>`}
function validStart(){return draft.start>=SEASON_START&&draft.start<=SEASON_END}
// Reference payments use the synthetic published full-season schedule.
function referencePaymentSummary(rows){
  const amounts=rows.map(row=>row.amount),low=Math.min(...amounts),high=Math.max(...amounts);
  return low===high?money(low)+' per payment':money(low)+'–'+money(high)+' per payment';
}
function fullTuitionReference(){
  const selected=options().some(c=>c!=='full')?choice:'full';
  const rowsFor=r=>selected==='full'?[{amount:r==='card'?83200:80000}]:schedule(SEASON_START,selected,r==='card'?83200:80000,true);
  const count=rowsFor('ach').length;
  return `<section class="header-tuition" aria-label="Full Season Tuition reference"><div class="reference-heading"><span class="reference-label">Full Season Tuition</span><div class="reference-prices">${bases().map(r=>`<div>${draft.dual?`<small>${railLabel(r)}</small>`:''}<strong>${money(r==='card'?83200:80000)}</strong></div>`).join('')}</div></div><div class="reference-payments"><span class="reference-plan-label">${name(selected)} · ${count} payment${count===1?'':'s'}</span><div class="reference-payment-values">${bases().map(r=>`<span>${draft.dual?railLabel(r)+' ':''}${referencePaymentSummary(rowsFor(r))}</span>`).join('')}</div></div></section>`;
}
function duesView(){
  const prices=bases().map(r=>amountInput('dues-'+r,draft.dual?railLabel(r)+' Dues':'Adjusted Dues',draft.dues[r])).join('');
  return `<div class="section-top"><div><h2>Dues</h2></div></div><div class="setup-grid ${draft.dual?'dual':''}"><div class="date-setup"><div class="start-block">${dateInput('start','Player Start Date',draft.start)}<div class="field"><label for="season-end">Season End Date</label><input id="season-end" type="date" value="${SEASON_END}" readonly aria-readonly="true" class="read-only"></div></div><div class="months-remaining" id="proration">${validStart()?`<strong>${monthIndex(SEASON_END)-monthIndex(draft.start)+1} of 8 Season months remaining</strong>`:'<strong class="field-error">Choose a start date within this Season.</strong>'}</div></div><div class="tuition-setup ${draft.dual?'dual':''}"><div class="price-fields ${draft.dual?'two':'single-price'}">${prices}</div><p class="dues-reset-note" id="dues-reset-note">Changing Dues resets all installment amounts.</p></div></div><div class="pricing-tools"><label class="checkline pricing-toggle"><input id="dual-pricing" type="checkbox" ${draft.dual?'checked':''}><span>Use different prices by payment method</span></label></div>${options().some(c=>c!=='full')?`<div class="section-rule"><div class="choice-bar"><div class="cadence-selector"><h2 class="payment-schedule-heading">Payment Schedule</h2><div class="cadence-tabs" role="group" aria-label="Payment Schedule">${options().filter(c=>c!=='full').map(c=>`<button type="button" data-cadence="${c}" aria-pressed="${choice===c}" class="${choice===c?'selected':''}">${name(c)}</button>`).join('')}</div></div></div><div id="schedule-area">${scheduleEditor()}</div><div id="schedule-total"></div><div class="status" id="local-status" role="status">${esc(message)}</div></div>`:'<div class="empty"><h3>Pay in Full only</h3><p>No installment schedules are offered.</p></div>'}`;
}
function scheduleEditor(){
  const rows=draft.schedules[choice].ach;
  const labels=`<span>#</span><span>Due date</span>${bases().map(r=>`<span>${draft.dual?railLabel(r):'Amount'}</span>`).join('')}`;
  const inputs=(row,i)=>`<span class="payment-number">${i+1}</span><input type="date" id="date-${i}" min="${MIN_DUE_DATE}" max="${SEASON_END}" value="${row.date}" aria-label="${name(choice)} installment ${i+1} due date">${bases().map(r=>{const amount=draft.schedules[choice][r][i].amount;return `<div class="money-input"><span aria-hidden="true">$</span><input type="number" min="0" step=".01" id="amount-${r}-${i}" value="${Number.isFinite(amount)?(amount/100).toFixed(2):''}" aria-label="${name(choice)}${draft.dual?' '+railLabel(r):''} installment ${i+1} amount"></div>`}).join('')}`;
  return `<div class="schedule-editor ${draft.dual?'dual':''}"><section class="first-payment"><div class="first-payment-heading"><h3>Set the first payment</h3>${rows.length>1?'<button id="fill-down" class="fill-action">↓ Keep first payment & split the rest</button>':''}</div><div class="first-labels">${labels}</div><div class="first-fields">${inputs(rows[0],0)}</div></section>${rows.length>1?`<h3 class="remaining-title">Remaining payments</h3><div class="schedule-table"><div class="schedule-labels">${labels}</div>${rows.slice(1).map((row,i)=>`<div class="schedule-row">${inputs(row,i+1)}</div>`).join('')}</div>`:''}</div>`;
}
function itemsView(){return `<div class="section-top"><div><h2>Review Deposit & Season items</h2><p>Set the due date and amount for each one-time charge.</p></div></div>${Object.entries(draft.charges).map(([key,c])=>`<section class="charge-editor"><div class="charge-identity"><h3>${c.name}</h3>${c.required?'':'<span class="optional-choice">Optional choice</span>'}</div><div class="charge-fields ${draft.dual?'dual':''}">${dateInput(key+'-date','Due date',c.date)}${amountInput(key+'-ach',draft.dual?'Check/ACH amount':'Amount',c.ach)}${draft.dual?amountInput(key+'-card','Credit/Debit amount',c.card):''}</div></section>`).join('')}`}
function priceText(value,dual){return dual?`${money(value.ach)} Check/ACH · ${money(value.card)} Credit/Debit`:money(value.ach)}
function scheduleRead(data,c,r){return `<table class="read-schedule"><thead><tr><th scope="col">Due date</th><th scope="col" class="right">Dues</th></tr></thead><tbody>${data.schedules[c][r].map(row=>`<tr><td>${dateText(row.date)}</td><td class="right">${money(row.amount)}</td></tr>`).join('')}</tbody></table>`}
function hasAdjustment(){
  if(!validStart())return false;
  const original=fresh();
  return bases().some(r=>draft.dues[r]!==suggestion(draft.start,r==='card'?83200:80000))||Object.entries(draft.charges).some(([key,c])=>bases().some(r=>c[r]!==Math.round(original.charges[key].ach*(r==='card'&&draft.dual?1.04:1))))||options().filter(c=>c!=='full').some(c=>bases().some(r=>{const suggested=allocate(suggestion(draft.start,r==='card'?83200:80000),draft.schedules[c][r].length);return draft.schedules[c][r].some((row,i)=>row.amount!==suggested[i])}));
}
function selectedReviewPlan(){return options().includes(reviewChoice)?reviewChoice:options().includes(choice)?choice:options()[0]}
function offerLedgerRows(){
  const selected=selectedReviewPlan(),duesRows=selected==='full'?[{date:TODAY,amount:draft.dues.ach}]:draft.schedules[selected].ach;
  const rows=duesRows.map((row,i)=>({group:'dues',date:row.date,name:'Dues',detail:selected==='full'?'Pay in Full':`Payment ${i+1} of ${duesRows.length}`,optional:false,ach:row.amount,card:selected==='full'?draft.dues.card:draft.schedules[selected].card[i].amount,order:i}));
  Object.entries(draft.charges).forEach(([key,charge],i)=>rows.push({group:key==='deposit'?'deposit':'extras',date:selected==='full'?TODAY:charge.date,name:charge.name,detail:charge.required?'':'Optional choice',optional:!charge.required,ach:charge.ach,card:charge.card,order:duesRows.length+i}));
  const order={deposit:0,extras:1,dues:2};
  return rows.sort((a,b)=>order[a.group]-order[b.group]||a.date.localeCompare(b.date)||a.order-b.order);
}
function enrollmentDueReference(){
  const rows=offerLedgerRows().filter(row=>!row.optional&&row.date<=TODAY);
  const total=r=>rows.reduce((sum,row)=>sum+row[r],0);
  const nothingDue=bases().every(r=>total(r)===0),selected=selectedReviewPlan();
  const next=selected==='full'?'That covers all required charges.':nothingDue?`Use the ${name(selected)} schedule below for future payments.`:`The ${name(selected)} schedule below shows what comes next.`;
  return `<section class="header-tuition enrollment-reference" aria-label="Payment needed to enroll Amara"><div class="reference-heading"><span class="reference-label">${nothingDue?'No payment is due today':'To enroll Amara, the family pays'}</span><div class="reference-prices">${bases().map(r=>`<div>${draft.dual?`<small>${railLabel(r)}</small>`:''}<strong data-enrollment-total="${r}">${money(total(r))}</strong>${nothingDue?'':'<span class="enrollment-timing"> today</span>'}</div>`).join('')}</div></div><p class="enrollment-next">${next}</p></section>`;
}
function offerLedger(){
  const rows=offerLedgerRows(),sum=(r,filter)=>rows.filter(filter).reduce((total,row)=>total+row[r],0);
  const totals=[{label:'Total with optional items',detail:'If the family adds the jacket',value:r=>sum(r,()=>true)}];
  const groups=[{key:'deposit',label:'Deposit'},{key:'extras',label:'Season Extras'},{key:'dues',label:'Dues'}];
  const shortDate=d=>new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',...(d.slice(0,4)!==TODAY.slice(0,4)?{year:'numeric'}:{})});
  const body=groups.map(group=>{
    const items=rows.filter(row=>row.group===group.key);
    return `<tbody data-ledger-group="${group.key}"><tr class="ledger-group-heading"><th scope="rowgroup" colspan="${2+bases().length}">${group.label}</th></tr>${items.map(row=>`<tr><td><time datetime="${row.date}" title="${dateText(row.date)}" aria-label="${dateText(row.date)}">${shortDate(row.date)}</time>${row.date===TODAY?'<small>Today</small>':''}</td><th scope="row">${row.name}${row.detail?`<small class="${row.optional?'optional-choice':''}">${row.detail}</small>`:''}</th>${bases().map(r=>`<td class="ledger-money">${money(row[r])}</td>`).join('')}</tr>`).join('')}<tr class="ledger-group-total"><th scope="row" colspan="2">${group.label} total${items.some(row=>row.optional)?'<small>Includes optional choice</small>':''}</th>${bases().map(r=>`<td class="ledger-money" data-group-total="${group.key}-${r}">${money(sum(r,row=>row.group===group.key))}</td>`).join('')}</tr></tbody>`;
  }).join('');
  return `<table class="offer-ledger grouped-ledger ${draft.dual?'dual':''}"><caption class="sr-only">Amara's obligations for ${name(selectedReviewPlan())}, grouped by Deposit, Season Extras and Dues. Group totals include optional choices. Enrollment due excludes optional choices.</caption><colgroup><col class="ledger-date-col"><col>${bases().map(()=>'<col class="ledger-money-col">').join('')}</colgroup><thead><tr><th scope="col">Due date</th><th scope="col">What it's for</th>${bases().map(r=>`<th scope="col" class="ledger-money">${draft.dual?railLabel(r):'Amount'}</th>`).join('')}</tr></thead>${body}<tfoot>${totals.map(total=>`<tr><th scope="row" colspan="2">${total.label}<small>${total.detail}</small></th>${bases().map(r=>`<td class="ledger-money">${money(total.value(r))}</td>`).join('')}</tr>`).join('')}</tfoot></table>`;
}
function reviewView(){
  return `<div class="section-top ledger-review-heading"><div><h2>Review Amara's offer</h2><p>Preview what the family will pay and when.</p></div><div class="review-edit-actions"><button class="small quiet" data-edit="0">Edit Dues</button><button class="small quiet" data-edit="1">Edit items</button></div></div><div class="review-context"><div><small>Player Start Date</small><strong>${dateText(draft.start)}</strong></div><div><small>Season End Date</small><strong>${dateText(SEASON_END)}</strong></div><div><small>Full Season Tuition</small><strong>${priceText({ach:80000,card:83200},draft.dual)}</strong></div></div><p class="review-pricing-note">Start date sets pricing. Enrollment activates the roster. Changing the start date resets Dues and schedules.</p><div class="ledger-plan-bar"><span class="control-label">Payment Schedule preview</span><div class="review-plan-tabs" role="group" aria-label="Preview offered payment schedule">${options().map(c=>`<button type="button" class="${selectedReviewPlan()===c?'selected':''}" data-review-plan="${c}" aria-pressed="${selectedReviewPlan()===c}">${name(c)}</button>`).join('')}</div></div>${offerLedger()}<p class="review-send-note">Sending locks these terms. No charges are created or collected until enrollment.</p><div class="field reason ledger-reason"><label for="reason">Internal reason ${hasAdjustment()?'<span class="field-error">· Required</span>':'· Optional'}</label><textarea id="reason" placeholder="Explain any changed amounts." aria-describedby="reason-help">${esc(draft.reason)}</textarea><small id="reason-help">Staff only. Saved with this offer.</small></div>`;
}
function installmentWarnings(){
  const warnings=[];
  for(const c of options().filter(c=>c!=='full'))for(const r of bases()){
    const rows=draft.schedules[c][r],total=rows.reduce((sum,row)=>sum+row.amount,0),diff=draft.dues[r]-total;
    const label=name(c)+(draft.dual?' · '+railLabel(r):'');
    if(!Number.isFinite(diff)||rows.some(row=>row.amount<0))warnings.push(`${label}: enter valid amounts.`);
    else if(diff)warnings.push(`${label}: ${money(Math.abs(diff))} ${diff>0?'short':'over'}.`);
  }
  return warnings;
}
function errorHtml(){
  const visible=errors.filter(e=>!e.paymentTotal);
  return visible.length?`<div class="notice error error-summary" role="alert" tabindex="-1" id="errors"><strong>Review before continuing</strong>${visible.map(e=>`<div>${e.id?`<a href="#${e.id}" data-error="${e.id}">${esc(e.text)}</a>`:esc(e.text)}</div>`).join('')}${visible.some(e=>e.refresh)?'<button class="small" id="refresh-review" style="margin-top:10px">Refresh review</button>':''}</div>`:'';
}
function renderModal(focus=true){
  document.getElementById('dialog-content').innerHTML=`<header class="modal-head"><div class="modal-top ${step===0||step===2?'with-reference':''}"><div><div class="eyebrow">14 Regional · 2026–27 Season</div><h1 id="dialog-title">Confirm Team Offers</h1><p class="sub">Amara Ellis <span class="muted">· Player-specific financial review</span></p></div>${step===0?fullTuitionReference():step===2?enrollmentDueReference():''}<button class="quiet close" id="close-dialog" aria-label="Close review">×</button></div><div class="header-bottom"><nav class="steps" aria-label="Offer review steps">${['Dues & schedules','Deposit & items','Review & send'].map((s,i)=>`<button class="step ${step===i?'active':step>i?'done':''}" data-step="${i}" ${step===i?'aria-current="step"':''}><span>${step>i?'✓':i+1}</span>${s}</button>`).join('')}</nav></div></header><div class="modal-scroll"><div class="content">${errorHtml()}${step===0?duesView():step===1?itemsView():reviewView()}</div></div><footer class="footer"><div id="installment-warning" class="footer-warning" role="status" aria-live="polite" tabindex="-1" hidden></div><div class="row">${step?'<button id="back">Back</button>':'<button id="cancel">Cancel</button>'}<button class="primary" id="continue" aria-describedby="installment-warning">${step===2?'Send Team Offer →':step===0?'Continue to Deposit & items →':'Review offer →'}</button></div></footer>`;
  bindModal();updateLive();if(focus){document.querySelector('.modal-scroll').scrollTop=0;const h=document.getElementById('dialog-title');h.tabIndex=-1;h.focus()}if(errors.length){if(document.getElementById('errors'))focusErrors();else document.getElementById('installment-warning')?.focus()}
}
function openModal(){modalOpen=true;step=0;errors=[];document.getElementById('overlay').hidden=false;document.getElementById('review-dialog').append(document.getElementById('lab'));document.getElementById('review-dialog').showModal();renderModal()}
function closeModal(){modalOpen=false;document.getElementById('review-dialog').close();document.body.insertBefore(document.getElementById('lab'),document.getElementById('app'));document.getElementById('overlay').hidden=true;document.getElementById('open-review')?.focus()}
function updateLive(){
  const el=document.getElementById('schedule-total');
  if(el){
    el.className='column-totals'+(draft.dual?' dual':'');
    el.innerHTML=`<span class="total-label">Total</span>${bases().map(r=>{const total=draft.schedules[choice][r].reduce((sum,row)=>sum+row.amount,0);return `<strong data-total="${r}" aria-label="${draft.dual?railLabel(r)+' ':''}installment total">${Number.isFinite(total)?money(total):'—'}</strong>`}).join('')}`;
  }
  const warning=document.getElementById('installment-warning'),button=document.getElementById('continue');
  if(warning&&button){
    const issues=installmentWarnings();warning.hidden=!issues.length;
    warning.innerHTML=issues.length?`<strong>Installments must match Dues to continue.</strong><span>${issues.map(esc).join(' ')}</span>`:'';
    button.disabled=!!issues.length;
  }
}
function numericValue(input){return input.value.trim()===''?NaN:Math.round(Number(input.value)*100)}
function bindMoney(id,save){const el=document.getElementById(id);if(el)el.oninput=()=>{save(numericValue(el));updateLive()}}
function resetAmounts(r){for(const c of CADENCES){const rows=draft.schedules[c][r],amounts=allocate(draft.dues[r],rows.length);rows.forEach((row,i)=>row.amount=amounts[i])}}
function refreshSchedule(){const el=document.getElementById('schedule-area');if(el){el.innerHTML=scheduleEditor();bindSchedule()}updateLive();const status=document.getElementById('local-status');if(status)status.textContent=message}
function commitDues(r){
  if(!dirtyDues.has(r))return;dirtyDues.delete(r);
  if(!Number.isFinite(draft.dues[r])||draft.dues[r]<0)return;
  resetAmounts(r);if(!draft.dual){draft.dues.card=draft.dues.ach;resetAmounts('card')}
  message=`Installment amounts reset for all offered plans${draft.dual?' · '+railLabel(r):''}. Dates kept.`;refreshSchedule();announce(message);
}
function flushDues(){for(const r of [...dirtyDues])commitDues(r)}
function bindSchedule(){
  if(!document.getElementById('schedule-area'))return;
  draft.schedules[choice].ach.forEach((row,i)=>{
    for(const r of bases())bindMoney(`amount-${r}-${i}`,v=>{draft.schedules[choice][r][i].amount=v;if(!draft.dual)draft.schedules[choice].card[i].amount=v});
    document.getElementById('date-'+i).onchange=e=>{for(const r of ['ach','card'])draft.schedules[choice][r][i].date=e.target.value};
  });
  document.getElementById('fill-down')?.addEventListener('click',fillDown);
}
function bindModal(){
  document.getElementById('close-dialog').onclick=()=>{flushDues();closeModal()};document.getElementById('cancel')?.addEventListener('click',()=>{flushDues();closeModal()});document.getElementById('back')?.addEventListener('click',()=>{flushDues();step--;errors=[];renderModal()});
  document.querySelectorAll('[data-step],[data-edit]').forEach(b=>b.onclick=()=>{flushDues();step=Number(b.dataset.step??b.dataset.edit);errors=[];message='';renderModal()});document.getElementById('continue').onclick=next;
  document.getElementById('start')?.addEventListener('change',e=>{
    draft.start=e.target.value;errors=[];dirtyDues.clear();
    if(validStart()){for(const r of ['ach','card']){draft.dues[r]=suggestion(draft.start,r==='card'&&draft.dual?83200:80000);for(const c of CADENCES)draft.schedules[c][r]=schedule(draft.start,c,draft.dues[r])}message='Suggested Dues and schedules reset for the new start date.'}
    renderModal(false);document.getElementById('start').focus();announce(message);
  });
  for(const r of bases()){
    bindMoney('dues-'+r,v=>{draft.dues[r]=v;dirtyDues.add(r)});
    document.getElementById('dues-'+r)?.setAttribute('aria-describedby','dues-reset-note');
    document.getElementById('dues-'+r)?.addEventListener('blur',()=>commitDues(r));
  }
  document.getElementById('dual-pricing')?.addEventListener('change',e=>{
    flushDues();draft.dual=e.target.checked;
    if(!draft.dual){draft.dues.card=draft.dues.ach;for(const c of CADENCES)draft.schedules[c].card=clone(draft.schedules[c].ach);for(const charge of Object.values(draft.charges))charge.card=charge.ach}else{draft.dues.card=Math.round(draft.dues.ach*1.04);resetAmounts('card');for(const charge of Object.values(draft.charges))charge.card=Math.round(charge.ach*1.04)}
    renderModal(false);document.getElementById('dual-pricing').focus();
  });
  for(const [key,charge]of Object.entries(draft.charges)){
    for(const r of bases())bindMoney(key+'-'+r,v=>{charge[r]=v;if(!draft.dual)charge.card=charge.ach});
    document.getElementById(key+'-date')?.addEventListener('change',e=>charge.date=e.target.value);
  }
  document.getElementById('schedule-choice')?.addEventListener('change',e=>{flushDues();choice=e.target.value;message='';renderModal(false);document.getElementById('schedule-choice').focus()});
  document.querySelectorAll('[data-cadence]').forEach(b=>b.onclick=()=>{flushDues();choice=b.dataset.cadence;message='';renderModal(false);document.querySelector(`[data-cadence="${choice}"]`).focus()});
  document.querySelectorAll('[data-review-plan]').forEach(b=>b.onclick=()=>{reviewChoice=b.dataset.reviewPlan;renderModal(false);document.querySelector(`[data-review-plan="${reviewChoice}"]`).focus()});
  bindSchedule();document.getElementById('reason')?.addEventListener('input',e=>draft.reason=e.target.value);
  document.querySelectorAll('[data-error]').forEach(a=>a.onclick=e=>{e.preventDefault();document.getElementById(a.dataset.error)?.focus()});document.getElementById('refresh-review')?.addEventListener('click',()=>{document.getElementById('failure').value='ok';errors=[];renderModal();announce('Review refreshed. Entered terms preserved.')});
}
function fillDown(){
  flushDues();
  errors=bases().flatMap(r=>{const first=draft.schedules[choice][r][0],rest=draft.dues[r]-first.amount;return !Number.isFinite(rest)||rest<0||!Number.isFinite(first.amount)||first.amount<0?[{id:`amount-${r}-0`,text:`Enter ${draft.dual?railLabel(r)+' ':''}a first payment between $0 and the Dues total.`}]:[]});
  if(errors.length){renderModal(false);return}
  const summaries=[];
  for(const r of bases()){
    const rows=draft.schedules[choice][r],first=rows[0],amounts=allocate(draft.dues[r]-first.amount,rows.length-1);
    rows.slice(1).forEach((row,i)=>row.amount=amounts[i]);
    summaries.push(`${draft.dual?railLabel(r)+': ':''}first payment stays ${money(first.amount)}; ${rows.length-1} remaining payments filled.`);
  }
  if(!draft.dual)draft.schedules[choice].card=clone(draft.schedules[choice].ach);
  message=summaries.join(' ');renderModal(false);document.getElementById('fill-down')?.focus();announce(message);
}
function validate(stage){
  const found=[];
  if(!validStart())found.push({id:'start',step:0,text:'Choose a Player start date within September 1–April 30.'});
  for(const r of bases())if(!Number.isFinite(draft.dues[r])||draft.dues[r]<0)found.push({id:'dues-'+r,step:0,text:'Enter a valid '+(draft.dual?railLabel(r)+' ':'')+'Dues amount.'});
  for(const c of options().filter(c=>c!=='full'))for(const r of bases()){
    const rows=draft.schedules[c][r],label=name(c)+(draft.dual?' · '+railLabel(r):'');
    if(rows.some(x=>!Number.isFinite(x.amount)||x.amount<0)||rows.reduce((s,x)=>s+x.amount,0)!==draft.dues[r])found.push({step:0,choice:c,rail:r,paymentTotal:true,text:`${label} payments must add up to ${money(draft.dues[r])}. Set the first payment, then split the rest.`});
    const invalid=rows.findIndex((x,i)=>!x.date||x.date<MIN_DUE_DATE||x.date>SEASON_END||(i&&x.date<=rows[i-1].date));
    if(invalid>=0&&!found.some(e=>e.choice===c&&e.id==='date-'+invalid))found.push({id:'date-'+invalid,step:0,choice:c,text:rows[invalid].date&&rows[invalid].date<MIN_DUE_DATE?`${name(c)} payment ${invalid+1}: due date must be today (${dateText(TODAY)}) or later.`:`${name(c)} payment ${invalid+1}: choose a date from ${dateText(MIN_DUE_DATE)} to ${dateText(SEASON_END)}, after the previous payment.`});
  }
  if(stage>=1)for(const [key,c]of Object.entries(draft.charges)){
    for(const r of bases())if(!Number.isFinite(c[r])||c[r]<0)found.push({id:key+'-'+r,step:1,text:'Enter a valid '+c.name+' '+(draft.dual?railLabel(r)+' ':'')+'amount.'});
    if(!c.date||c.date<MIN_DUE_DATE||c.date>SEASON_END)found.push({id:key+'-date',step:1,text:c.date&&c.date<MIN_DUE_DATE?`${c.name}: due date must be today (${dateText(TODAY)}) or later.`:`Choose a ${c.name} due date from ${dateText(MIN_DUE_DATE)} to ${dateText(SEASON_END)}.`});
  }
  if(stage===2&&hasAdjustment()&&!draft.reason.trim())found.push({id:'reason',step:2,text:'Add an internal reason for the changed amounts.'});return found;
}
function focusErrors(){for(const e of errors)if(e.id){const el=document.getElementById(e.id);if(el){el.setAttribute('aria-invalid','true');el.setAttribute('aria-describedby',[(el.getAttribute('aria-describedby')||''),'errors'].join(' ').trim())}}document.getElementById('errors')?.focus()}
function next(){
  flushDues();errors=validate(step);if(errors.length){const e=errors[0];step=e.step;if(e.choice)choice=e.choice;renderModal();return}
  if(step<2){step++;message='';renderModal();return}
  const failure=document.getElementById('failure').value;
  if(failure!=='ok'){errors=[{text:failure==='network'?'The offer could not be saved. Your terms are preserved. Try sending again.':failure==='stale'?'The published plan changed during review. Refresh and compare before sending.':'Your staff role cannot confirm adjusted offers. A Director, Employee Admin, Finance Officer, Owner or Executive must send.',refresh:failure==='stale'}];document.getElementById('failure').value='ok';renderModal();return}
  sent={...clone(draft),choices:options(),version:history.length+1};familyStep=0;signed=false;authorized=false;optional=false;familyRail='ach';familyChoice=sent.choices[0];history.push(clone(sent));enrolled=null;staff();openSuccess();announce('Team Offer sent. No charges created.');
}
function openSuccess(){
  if(!modalOpen){modalOpen=true;document.getElementById('overlay').hidden=false;document.getElementById('review-dialog').append(document.getElementById('lab'));document.getElementById('review-dialog').showModal()}
  document.getElementById('dialog-content').innerHTML=`<header class="modal-head row between"><h1 id="dialog-title">Team Offer sent</h1><button class="quiet close" id="close-dialog" aria-label="Close sent offer">×</button></header><div class="modal-scroll"><div class="success-view"><div class="success-mark">✓</div><h2>Amara's offer is ready.</h2><p>Morgan can accept and enroll now with the financial terms you reviewed.</p><div class="notice success"><strong>Offer version ${sent.version} · ${dateText(TODAY)}</strong>Dues ${priceText(sent.dues,sent.dual)}<br>No charges or scheduled payments have been created.</div><div class="audit"><h3>Try the fixed-terms behavior</h3><p class="sub" style="font-size:12px">Simulate a published plan change after sending. Amara keeps this offer's terms.</p><button class="small" id="plan-change" style="margin-top:12px">Simulate published Dues increasing</button><p id="plan-change-status" class="status" role="status"></p></div><div class="history"><h3>Staff-only send history</h3>${history.map(h=>`<p>Version ${h.version} · Alex Rivera · Director · Dues ${priceText(h.dues,h.dual)}<br>${h.reason?'Reason: '+esc(h.reason):'Suggested amounts used.'}</p>`).join('')}<button class="small" id="redraft" style="margin-top:16px">Return unanswered offer to draft</button></div></div></div><footer class="footer"><small>Fixed financial terms · No billing at send</small><div class="row"><button class="primary" id="done">Done</button></div></footer>`;
  document.getElementById('close-dialog').onclick=closeModal;document.getElementById('done').onclick=closeModal;
  document.getElementById('plan-change').onclick=e=>{e.target.disabled=true;document.getElementById('plan-change-status').textContent='Published Dues increased by 20%. Amara’s sent Dues remain '+priceText(sent.dues,sent.dual)+'.'};
  document.getElementById('redraft').onclick=()=>{draft=clone(sent);sent=null;enrolled=null;dirtyDues.clear();closeModal();staff();openModal();announce('Offer returned to draft. Earlier sent terms remain in staff history.')};document.querySelector('.modal-scroll').scrollTop=0;document.getElementById('done').focus();
}
function reset(){reviewChoice=null;if(modalOpen)closeModal();draft=fresh();dirtyDues.clear();step=0;choice='monthly';errors=[];message='';familyStep=0;familyRail='ach';familyChoice=options()[0];optional=false;signed=false;authorized=false;sent=null;history=[];enrolled=null;document.getElementById('failure').value='ok';staff();openModal()}
document.getElementById('reset').onclick=reset;document.getElementById('fixture').onchange=e=>{fixture=e.target.value;reset()};document.getElementById('review-dialog').addEventListener('cancel',e=>{e.preventDefault();flushDues();closeModal()});staff();openModal();



