// All times are minutes after midnight on a single simulated service day.
export const NOW = 610;
export const OPEN = 480;
export const CLOSE = 1020;
export const CREW = [
  { id: 'michael', name: 'Michael Reed', initials: 'MR', skills: ['HVAC', 'General'] },
  { id: 'anna', name: 'Anna Chen', initials: 'AC', skills: ['HVAC', 'General'] },
  { id: 'alex', name: 'Alex Rivera', initials: 'AR', skills: ['General'] }
];
export const SITES = ['Yard', 'Market Row', 'Oak Street', 'Cedar Park', 'Harbor Clinic', 'Elm House', 'Park Square', 'Ridge School', 'Library Annex'];
// Symmetric drive estimates in minutes. A demo input, independent of the language model.
const MATRIX = [
  [0,12,22,28,16,25,15,30,18],
  [12,0,15,24,18,22,21,30,12],
  [22,15,0,18,20,25,22,35,18],
  [28,24,18,0,30,10,32,45,24],
  [16,18,20,30,0,30,24,32,18],
  [25,22,25,10,30,0,22,18,25],
  [15,21,22,32,24,22,0,20,10],
  [30,30,35,45,32,18,20,0,10],
  [18,12,18,24,18,25,10,10,0]
];
export function drive(from, to) {
  return MATRIX[SITES.indexOf(from)][SITES.indexOf(to)];
}
export function time(value) {
  return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
}
function job(id, title, site, skill, owner, start, duration, earliest, latest) {
  return { id, title, site, skill, owner, start, duration, earliest, latest };
}
export function fresh() {
  return { incident: null, unavailable: [], affected: [], holds: {}, history: [], jobs: [
    job('DL-101','Filter service','Market Row','General','michael',495,65,480,540),
    job('DL-104','Cooling repair','Oak Street','HVAC','michael',675,60,660,720),
    job('DL-106','Thermostat setup','Cedar Park','General','michael',800,35,780,840),
    job('DL-102','Compressor service','Harbor Clinic','HVAC','anna',565,90,540,590),
    job('DL-105','System inspection','Elm House','General','anna',770,90,760,800),
    job('DL-103','Vent inspection','Park Square','General','alex',565,70,540,590),
    job('DL-107','Control panel test','Ridge School','General','alex',690,85,675,720)
  ] };
}
export const EVENTS = [
  { kind: 'absence', label: 'Technician out', example: 'Michael is out sick for the rest of the day.', owner: 'michael' },
  { kind: 'overrun', label: 'Job running late', example: 'Anna needs 100 more minutes than planned at Harbor Clinic.', owner: 'anna', extra: 100 },
  { kind: 'urgent', label: 'Urgent request', example: 'Find someone for the urgent visit at Library Annex.' }
];
export function route(state, owner) {
  return state.jobs.filter(j => j.owner === owner).sort((a,b) => a.start - b.start);
}
export function disrupt(original, event) {
  if (original.incident) throw new Error('Start a fresh day before introducing a different incident.');
  const state = structuredClone(original);
  const queue = item => {
    state.affected.push({ id: item.id, owner: item.owner, start: item.start });
    item.owner = null;
    item.start = null;
  };
  const person = CREW.find(p => p.id === event.owner);
  if (event.kind === 'absence' && person) {
    state.unavailable.push(person.id);
    for (const item of route(state, person.id)) if (item.start >= NOW) queue(item);
    state.incident = { kind: event.kind, label: person.name.split(' ')[0] + ' out for the day', detail: 'Future visits need cover. Work already started stays in place.' };
  } else if (event.kind === 'overrun' && person) {
    const jobs = route(state, person.id);
    const active = jobs.find(j => j.start < NOW && j.start + j.duration > NOW);
    if (!active) throw new Error(person.name + ' has no visit in progress at 10:10.');
    if (!Number.isInteger(event.extra) || event.extra < 1 || event.extra > 180) throw new Error('Enter a delay of 1 to 180 minutes.');
    active.duration += event.extra;
    let prior = active;
    for (const item of jobs.filter(j => j.start >= NOW)) {
      if (prior.start + prior.duration + drive(prior.site,item.site) > item.start) queue(item);
      else prior = item;
    }
    state.incident = { kind: event.kind, label: active.site + ' overrun', detail: person.name.split(' ')[0] + ' now finishes at ' + time(active.start + active.duration) + ' (+' + event.extra + ' min).' };
  } else if (event.kind === 'urgent') {
    const item = job('DL-108','Urgent controls check','Library Annex','General',null,null,30,620,660);
    state.jobs.push(item);
    queue(item);
    state.incident = { kind: event.kind, label: 'Urgent visit at Library Annex', detail: 'A 30-minute general service visit. The customer needs arrival between 10:20 and 11:00.' };
  } else throw new Error('Choose a supported incident and crew member.');
  state.history.push(state.incident.label);
  return state;
}
// Insert one visit into every free gap. Check travel on both sides of the visit.
export function choices(state, id) {
  const item = state.jobs.find(j => j.id === id);
  if (!item || item.owner || !state.affected.some(a => a.id === id)) return [];
  const found = [];
  for (const person of CREW) {
    if (state.unavailable.includes(person.id) || !person.skills.includes(item.skill)) continue;
    const jobs = route(state,person.id);
    for (let i = 0; i <= jobs.length; i++) {
      const prev = jobs[i - 1], next = jobs[i];
      const leave = Math.max(NOW, prev ? prev.start + prev.duration : OPEN);
      const origin = prev ? prev.site : 'Yard';
      const travel = drive(origin,item.site);
      const arrival = Math.max(item.earliest, leave + travel);
      const end = arrival + item.duration;
      if (end > CLOSE || (next && end + drive(item.site,next.site) > next.start)) continue;
      const late = Math.max(0, arrival - item.latest);
      found.push({ owner: person.id, arrival, end, origin, leave, travel, late });
    }
  }
  // Keep genuinely different trade-offs. A later option with a shorter approach can be valuable.
  return found.filter((a,i) => !found.some((b,k) => k !== i && a.owner === b.owner &&
    b.arrival <= a.arrival && b.travel <= a.travel && (b.arrival < a.arrival || b.travel < a.travel)))
    .sort((a,b) => a.late - b.late || a.arrival - b.arrival || a.travel - b.travel || a.owner.localeCompare(b.owner));
}
export function decide(original, id, owner, arrival, action) {
  const state = structuredClone(original);
  const choice = choices(state,id).find(c => c.owner === owner && c.arrival === arrival);
  if (!choice) throw new Error('This slot is no longer available. Choose a current option.');
  const item = state.jobs.find(j => j.id === id);
  const held = state.holds[id];
  if (action === 'hold' && choice.late) {
    state.holds[id] = { owner, arrival };
    state.history.push('Awaiting customer approval for ' + item.site + ' at ' + time(arrival));
  } else if (action === 'apply' && !choice.late || action === 'confirm' && choice.late && held?.owner === owner && held.arrival === arrival) {
    item.owner = owner; item.start = arrival;
    if (choice.late) item.approvedArrival = arrival;
    delete state.holds[id];
    state.history.push(item.site + ' assigned to ' + owner + ' at ' + time(arrival) + (choice.late ? ' with customer approval' : ''));
    for (const [other,h] of Object.entries(state.holds)) {
      if (!choices(state,other).some(c => c.owner === h.owner && c.arrival === h.arrival)) delete state.holds[other];
    }
  } else throw new Error('The new arrival needs customer approval before assignment.');
  return state;
}
