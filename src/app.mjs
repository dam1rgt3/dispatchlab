import { CREW, EVENTS, OPEN, CLOSE, NOW, choices, decide, disrupt, fresh, route, time } from './planner.mjs';
import { interpret } from './intake.mjs';
const $ = id => document.getElementById(id);
const baseline = fresh();
let day = fresh(), selected = null, preview = null, before = false, detail = null;
const undo = [];
const first = id => CREW.find(p => p.id === id)?.name.split(' ')[0] || 'Unassigned';
const byId = id => day.jobs.find(j => j.id === id);
const baselineJob = id => baseline.jobs.find(j => j.id === id);
const pct = min => (min - OPEN) * 100 / (CLOSE - OPEN);
const status = j => j.start + j.duration <= NOW ? 'Complete' : j.start < NOW ? 'In progress' : 'Scheduled';
const announce = msg => { $('announce').textContent = msg; };
const defs = [
  ['−','Michael calls in sick'], ['↗','Anna needs more time'], ['+','Library Annex calls']
];
function renderPresets() {
  $('presets').innerHTML = EVENTS.map((e,i) => '<button class="preset" data-event="'+i+'" aria-pressed="'+(day.incident?.kind===e.kind)+'"><span class="glyph" aria-hidden="true">'+defs[i][0]+'</span><span><strong>'+e.label+'</strong><small>'+defs[i][1]+'</small></span><span class="arrow" aria-hidden="true">→</span></button>').join('');
}
function schedule() {
  const view = before ? baseline : day;
  $('switcher').innerHTML = day.incident ? '<div class="seg" aria-label="Schedule comparison"><button data-view="before" aria-pressed="'+before+'">Original</button><button data-view="current" aria-pressed="'+!before+'">Current</button></div>' : '<span class="pill">Original schedule</span>';
  const ticks = Array.from({length:10},(_,i) => '<span style="left:'+pct(OPEN+i*60)+'%">'+time(OPEN+i*60)+'</span>').join('');
  let markup = '<div class="axis"><span>TECHNICIAN</span><div class="ticks">'+ticks+'</div></div>';
  for (const person of CREW) {
    const items = route(view,person.id);
    markup += '<div class="lane"><div class="name"><span class="avatar">'+person.initials+'</span><div><b>'+person.name+'</b><small>'+(view.unavailable.includes(person.id)?'Out for day':person.skills.join(' · '))+'</small></div></div><div class="track"><i class="now" style="left:'+pct(NOW)+'%"></i>';
    for (const j of items) {
      const original = baselineJob(j.id);
      const changed = !original || original.owner!==j.owner || original.start!==j.start;
      const cls = changed?'revised':status(j)==='Complete'?'done':status(j)==='In progress'?'active':'';
      const label = j.site+', '+j.title+', '+time(j.start)+' to '+time(j.start+j.duration);
      markup += '<button class="slot '+cls+'" style="left:'+pct(j.start)+'%;width:calc('+j.duration*100/(CLOSE-OPEN)+'% - 2px)" data-job="'+j.id+'" aria-label="'+label+'" title="'+label+'"><small>'+time(j.start)+'</small>'+j.site+'</button>';
    }
    markup += '</div></div>';
  }
  $('timeline').innerHTML = markup;
  $('board-summary').textContent = view.jobs.filter(j=>j.owner).length+' assigned · '+view.jobs.filter(j=>!j.owner).length+' open';
  const j = view.jobs.find(j=>j.id===detail);
  $('job-detail').hidden = !j;
  if (j) $('job-detail').textContent = j.id+' · '+j.title+' at '+j.site+' · '+first(j.owner)+' · '+time(j.start)+'–'+time(j.start+j.duration)+' · Promised arrival '+time(j.earliest)+'–'+time(j.latest)+(j.approvedArrival?' · Customer agreed to '+time(j.approvedArrival):'');
}
function reviewPanel(job) {
  const options = choices(day,job.id);
  const prior = day.affected.find(a=>a.id===job.id);
  const original = prior.owner ? first(prior.owner)+' at '+time(prior.start) : 'New request';
  let content = '<div class="card panel"><p class="eyebrow">'+job.id+' · '+job.skill+'</p><h2>'+job.title+'</h2><p class="sub">'+job.site+' · '+job.duration+' min on site · Arrival '+time(job.earliest)+'–'+time(job.latest)+'</p><p class="sub">Original assignment: '+original+'</p>';
  if (job.owner) {
    return content+'<div class="option"><span class="pill good">Assigned</span><p>'+first(job.owner)+' arrives at <b>'+time(job.start)+'</b>. '+(job.approvedArrival?'Customer approval recorded for this time.':'The original arrival window is kept.')+'</p></div></div>';
  }
  if (!options.length) return content+'<div class="option"><h3>No workable slot</h3><p>No available technician with '+job.skill+' skills can fit this visit and both travel legs before the next booking or shift end. Leave it open for manual dispatch.</p></div></div>';
  for (const c of options) {
    const desc = c.late ? c.late+' min past window' : 'Within window';
    const hold = day.holds[job.id];
    const held = hold?.owner===c.owner && hold?.arrival===c.arrival;
    const act = c.late ? held?'confirm':'hold' : 'apply';
    const label = c.late ? held?'Customer agreed · assign':'Hold for customer approval' : 'Assign '+first(c.owner);
    content += '<div class="option"><div class="option-head"><strong>'+first(c.owner)+' · '+time(c.arrival)+'–'+time(c.end)+'</strong><span class="pill '+(c.late?'warn':'good')+'">'+desc+'</span></div><p>'+c.origin+' at '+time(c.leave)+' + '+c.travel+' min drive'+(c.leave+c.travel<c.arrival?' + '+(c.arrival-c.leave-c.travel)+' min until window opens':'')+' → arrival <b>'+time(c.arrival)+'</b>.</p><button class="'+(c.late?'confirm':'primary')+'" data-act="'+act+'" data-owner="'+c.owner+'" data-arrival="'+c.arrival+'">'+label+'</button>'+(held?' <button data-release="'+job.id+'">Customer declined</button>':'')+'</div>';
  }
  return content+'</div>';
}
function workspace() {
  if (!day.incident) {
    $('workspace').innerHTML='<div class="card empty"><h2>All seven visits are assigned</h2><p class="sub">Choose a disruption above to compare your options. Select a visit on the timeline to see its arrival window.</p></div>';
    return;
  }
  const affected = day.affected.map(a=>byId(a.id));
  if (!affected.some(j=>j.id===selected)) selected = affected[0]?.id;
  const tickets = affected.map(j=>'<button class="ticket" data-target="'+j.id+'" aria-pressed="'+(selected===j.id)+'"><span>'+j.site+'<small>'+j.title+'</small></span><span class="pill '+(j.owner?'good':'warn')+'">'+(j.owner?'Assigned':day.holds[j.id]?'On hold':'Open')+'</span></button>').join('');
  const activity = '<details><summary>Decision log ('+day.history.length+')</summary><ol>'+day.history.map(x=>'<li>'+x+'</li>').join('')+'</ol></details>';
  const overview='<aside class="card panel"><p class="eyebrow">Incident desk</p><h2>'+day.incident.label+'</h2><p class="sub">'+day.incident.detail+'</p><div class="tickets">'+tickets+'</div>'+activity+'<div class="actions"><button data-back>Undo</button><button data-reset>Reset day</button></div></aside>';
  $('workspace').innerHTML = overview+(selected?reviewPanel(byId(selected)):'<div class="card empty"><h2>Schedule still works</h2><p class="sub">This disruption leaves enough time for the remaining visits and travel.</p></div>');
}
function render() { renderPresets();schedule();workspace(); }
function update(next, message) {
  undo.push({day, selected, before}); day = next; before = false; detail = null;
  render(); announce(message);
}
function activate(event) {
  const next = disrupt(fresh(),event);
  if (day.incident && !window.confirm('Start this scenario on the original schedule? You can undo this switch.')) return;
  update(next,next.incident.label);
  preview = null; $('interpretation').textContent = '';
}
$('toggle-note').onclick = () => {
  $('intake').hidden = !$('intake').hidden;
  $('toggle-note').setAttribute('aria-expanded',String(!$('intake').hidden));
  if (!$('intake').hidden) $('note').focus();
};
$('note').oninput = () => { preview=null; $('interpretation').textContent=''; };
$('intake').onsubmit = e => {
  e.preventDefault(); preview=null;
  try {
    preview = interpret($('note').value);
    const next = disrupt(fresh(),preview);
    $('interpretation').innerHTML = '<strong>'+next.incident.label+'</strong> · '+next.incident.detail+' <button type="button" data-activate>Use this incident</button>';
  } catch(error) { preview=null; $('interpretation').textContent = error.message; }
};
document.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b) return;
  const d=b.dataset;
  if(d.event!==undefined) activate(EVENTS[Number(d.event)]);
  else if(d.activate!==undefined && preview) activate(preview);
  else if(d.view) { before=d.view==='before'; detail=null; schedule(); }
  else if(d.job) { detail=detail===d.job?null:d.job; schedule(); }
  else if(d.target) { selected=d.target; workspace(); }
  else if(d.act) {
    try { const next=decide(day,selected,d.owner,Number(d.arrival),d.act);update(next,next.history.at(-1)); }
    catch(error) { announce(error.message); }
  } else if(d.release) {
    const next=structuredClone(day);delete next.holds[d.release];next.history.push('Customer declined the proposed arrival for '+byId(d.release).site);update(next,next.history.at(-1));
  } else if(d.back!==undefined && undo.length) {
    const snapshot=undo.pop(); day=snapshot.day;selected=snapshot.selected;before=snapshot.before;detail=null;render();announce('Previous schedule restored.');
  } else if(d.reset!==undefined && window.confirm('Reset to the original dispatch board?')) {
    undo.length=0;day=fresh();selected=null;before=false;detail=null;preview=null;$('interpretation').textContent='';render();announce('Day reset.');
  }
});
render();
