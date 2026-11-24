import test from 'node:test';
import assert from 'node:assert/strict';
import { NOW, CLOSE, CREW, EVENTS, fresh, drive, route, disrupt, choices, decide } from '../src/planner.mjs';
import { interpret } from '../src/intake.mjs';
const absent = () => disrupt(fresh(),EVENTS[0]);
test('absence preserves started jobs and uses realistic travel on both sides', () => {
  const original = fresh();
  const s = disrupt(original,EVENTS[0]);
  assert.deepEqual(s.affected.map(x=>x.id),['DL-104','DL-106']);
  assert.ok(original.jobs.every(j=>j.owner));
  assert.deepEqual(choices(s,'DL-104').map(c=>[c.owner,c.arrival,c.travel]),[['anna',675,20]]);
  assert.deepEqual(choices(s,'DL-106').map(c=>[c.owner,c.arrival,c.travel,c.late]),[['alex',820,45,0],['anna',870,10,30]]);
});
test('approval requires the exact held option and cannot be reused', () => {
  const s=absent();
  assert.throws(()=>decide(s,'DL-106','anna',870,'apply'));
  assert.throws(()=>decide(s,'DL-106','anna',870,'confirm'));
  const held=decide(s,'DL-106','anna',870,'hold');
  assert.equal(held.jobs.find(j=>j.id==='DL-106').owner,null);
  const assigned=decide(held,'DL-106','anna',870,'confirm');
  assert.equal(assigned.jobs.find(j=>j.id==='DL-106').approvedArrival,870);
  assert.throws(()=>decide(assigned,'DL-106','anna',870,'confirm'));
  assert.equal(s.holds['DL-106'],undefined);
});
test('a running job extends in place and only incompatible downstream work reopens',()=>{
  const s=disrupt(fresh(),EVENTS[1]);
  assert.deepEqual(s.affected.map(a=>a.id),['DL-105']);
  assert.equal(s.jobs.find(j=>j.id==='DL-102').start,565);
  assert.equal(s.jobs.find(j=>j.id==='DL-102').duration,190);
  assert.equal(choices(s,'DL-105')[0].arrival,785);
  assert.equal(disrupt(fresh(),{kind:'overrun',owner:'anna',extra:15}).affected.length,0);
  assert.throws(()=>disrupt(fresh(),{kind:'overrun',owner:'michael',extra:20}));
});
test('urgent visit uses a real gap, keeps existing bookings and allows a different technician',()=>{
  const s=disrupt(fresh(),EVENTS[2]);
  const opts=choices(s,'DL-108');
  assert.equal(opts.find(o=>o.owner==='alex').arrival,645);
  assert.equal(opts.find(o=>o.owner==='michael').end,652);
  assert.deepEqual(s.jobs.slice(0,7),fresh().jobs);
});
test('infeasible days leave tickets open',()=>{
  const s=absent(); s.unavailable=CREW.map(p=>p.id);
  assert.deepEqual(choices(s,'DL-104'),[]);
  assert.throws(()=>decide(s,'DL-104','alex',680,'apply'));
});
test('every reachable assignment respects travel, qualifications, locked work and shift end',()=>{
  let checked=0;
  function walk(s) {
    for(const p of CREW) {
      const jobs=route(s,p.id);
      jobs.forEach((j,i)=>{
        assert.ok(p.skills.includes(j.skill)); assert.ok(j.start+j.duration<=CLOSE);
        if(i) assert.ok(jobs[i-1].start+jobs[i-1].duration+drive(jobs[i-1].site,j.site)<=j.start);
        if(j.start>j.latest) assert.equal(j.approvedArrival,j.start);
      });
    }
    for(const original of fresh().jobs.filter(j=>j.start<NOW)) {
      const current=s.jobs.find(j=>j.id===original.id);
      assert.equal(current.start,original.start); assert.equal(current.owner,original.owner);
    }
    for(const a of s.affected) for(const c of choices(s,a.id)){
      const stage=c.late?decide(s,a.id,c.owner,c.arrival,'hold'):s;
      walk(decide(stage,a.id,c.owner,c.arrival,c.late?'confirm':'apply'));
    }
    checked++;
  }
  EVENTS.forEach(e=>walk(disrupt(fresh(),e)));assert.ok(checked>=15);
});
test('intake supports examples, paraphrases, and variable people and durations',()=>{
  for(const e of EVENTS) assert.deepEqual(interpret(e.example),e);
  assert.equal(interpret('Alex went home sick').owner,'alex');
  assert.equal(interpret('Anna is running 45 minutes late').extra,45);
  assert.equal(interpret('Alex needs 1 extra hour for the current job').extra,60);
  assert.equal(interpret('A rush job at Library Annex').kind,'urgent');
});
test('unrecognized, ambiguous, unsupported and negated notes do not apply changes',()=>{
  for(const text of ['order pizza',"Anna isn't sick",'Michael and Alex are sick','Michael is out until noon','Anna is delayed','Anna is delayed 999 minutes','Urgent job at Elm House','Michael is sick and there is an urgent job'])
    assert.throws(()=>interpret(text),undefined,text);
});
