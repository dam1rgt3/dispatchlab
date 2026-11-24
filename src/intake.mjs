import { CREW, EVENTS } from './planner.mjs';

// Small multinomial Naive Bayes intent model. Slot values are extracted separately.
const examples = {
  absence: [
    'technician is out sick today', 'called in sick for the rest of the day',
    'unavailable for the whole shift', 'cannot work today', 'left early feeling ill',
    'absent today find cover for his jobs', 'off work for the day', 'lost a technician',
    'went home sick', 'out for the rest of the day'
  ],
  overrun: [
    'job is taking longer than planned', 'current visit is running late',
    'needs extra minutes on the repair', 'overrun at the current job',
    'delayed at the site', 'will finish later than planned', 'needs more time to finish',
    'still working and behind schedule', 'extend current visit by minutes'
  ],
  urgent: [
    'urgent request at the library annex', 'add an emergency visit', 'new priority service call',
    'squeeze in a rush job', 'find someone for the urgent visit', 'library needs immediate service',
    'incoming high priority customer request', 'urgent controls check', 'dispatch someone urgently'
  ]
};
const ignored = new Set('the a an is in as for from by at on today of her his their the day to minutes min hours hour michael anna alex'.split(' '));
function tokens(input) {
  return (input.toLowerCase().match(/[a-z]+/g) || []).filter(t => !ignored.has(t));
}
const vocab = new Set();
const models = Object.fromEntries(Object.entries(examples).map(([kind, lines]) => {
  const counts = new Map();
  const words = lines.flatMap(tokens);
  for (const word of words) {
    vocab.add(word);
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [kind, { counts, total: words.length }];
}));
export function interpret(text) {
  const input = text.trim().toLowerCase().replace(/’/g,"'");
  if (!input || input.length > 260) throw new Error('Describe one disruption in up to 260 characters.');
  if (/\b(no longer|not|isn't|cancel|tomorrow|next week|until noon|until lunch)\b/.test(input))
    throw new Error('Use one active disruption for this demo day. For an absence, specify a full-day absence.');
  const words = tokens(input).filter(t => vocab.has(t));
  const ranked = Object.entries(models).map(([kind, model]) => {
    const score = words.reduce((sum, word) => sum + Math.log(((model.counts.get(word) || 0) + 1) / (model.total + vocab.size)), 0);
    return { kind, score };
  }).sort((a,b) => b.score - a.score);
  if (!words.length || ranked[0].score - ranked[1].score < 0.52)
    throw new Error('I could not distinguish the incident. Try an absence, a delay in minutes or an urgent visit.');
  const signals = [/\b(sick|absent|unavailable|ill)\b/, /\b(overrun|delay|late|longer|extend)\b/, /\b(urgent|rush|emergency)\b/];
  if (signals.filter(re => re.test(input)).length > 1) throw new Error('Describe one disruption at a time.');
  const kind = ranked[0].kind;
  const event = { ...EVENTS.find(e => e.kind === kind) };
  const people = CREW.filter(p => new RegExp('\\b' + p.id + '\\b').test(input));
  if (kind === 'urgent') {
    const site = input.match(/\bat\s+(.+?)[.!?]?(?:$)/);
    if (people.length || site && !/^(?:the )?library(?: annex)?[.!?]?$/.test(site[1]))
      throw new Error('The sample urgent request is for Library Annex. Try “Urgent visit at Library Annex”.');
    if (/\d/.test(input)) throw new Error('The Library Annex request has a fixed arrival window of 10:20–11:00.');
    return event;
  }
  if (people.length !== 1) throw new Error('Name one technician: Michael, Anna or Alex.');
  event.owner = people[0].id;
  if (kind === 'absence' && /\d|\b(morning|afternoon|until|hours?|minutes?)\b/.test(input))
    throw new Error('Absences in this demo cover the rest of the shift.');
  if (kind === 'overrun') {
    const matches = [...input.matchAll(/\b(\d+)\s*(?:(?:more|extra|additional)\s+)?(minutes?|mins?|hours?|hrs?)\b/g)];
    if (matches.length !== 1) throw new Error('Include one delay, for example “Anna is running 45 minutes late”.');
    event.extra = Number(matches[0][1]) * (/^(h)/.test(matches[0][2]) ? 60 : 1);
    if (event.extra < 1 || event.extra > 180) throw new Error('Use a delay between 1 and 180 minutes.');
  }
  return event;
}
