// Unit tests for src/lib/lesson/pacing.ts and time.ts. No npm install needed (Node 22.6+):
//   npm run test:pacing
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replan, previewOverrun, floorOf, capOf } from '../src/lib/lesson/pacing.ts';
import { zonedToUtc, utcToZoned, mmss, parseMmss, addToClock, isIsoDate, isTimeZone } from '../src/lib/lesson/time.ts';

const min = (m) => Math.round(m * 60);
const spec = [
  { plannedSec: min(6), pacing: 'flex' }, // bellwork
  { plannedSec: min(10), pacing: 'flex' }, // notes
  { plannedSec: min(6), pacing: 'flex' }, // learning activity 1
  { plannedSec: min(7), pacing: 'flex' }, // learning activity 2
  { plannedSec: min(15), pacing: 'flex' }, // independent work
  { plannedSec: min(4), pacing: 'locked' } // exit ticket
];

test("worked example: notes run 1 min long in the 48-minute lesson", () => {
  const r = previewOverrun(spec, 1, 60);
  assert.deepEqual(r.seconds.map(mmss), ['5:45', '6:45', '14:30', '4:00']);
  assert.equal(r.overSec, 0);
  assert.equal(r.spareSec, 0);
  assert.equal(r.seconds.reduce((a, b) => a + b), min(48 - 6 - 11));
});

test('on time: nothing changes', () => {
  const r = previewOverrun(spec, 1, 0);
  assert.deepEqual(r.seconds, spec.slice(2).map((m) => m.plannedSec));
});

test('locked modules never move', () => {
  for (const extra of [-300, 120, 600, 1200]) {
    const r = previewOverrun(spec, 1, extra);
    assert.equal(r.seconds.at(-1), min(4), `extra ${extra}`);
  }
});

test('everything is in 15-second steps when the budget is', () => {
  for (let extra = -600; extra <= 900; extra += 15) {
    const r = previewOverrun(spec, 1, extra);
    assert.ok(r.seconds.every((s) => s % 15 === 0), `extra ${extra}: ${r.seconds}`);
  }
});

test('the plan always fills the budget exactly unless over or spare', () => {
  for (let extra = -900; extra <= 1500; extra += 15) {
    const budget = min(48) - min(6) - min(10) - extra;
    const r = replan(spec, 2, budget);
    const sum = r.seconds.reduce((a, b) => a + b);
    assert.equal(sum - r.overSec + r.spareSec, budget, `extra ${extra}`);
  }
});

test('floors: a big overrun pins every flex module at half its plan and reports the overage', () => {
  // Notes take 30 min instead of 10: 12 min left, 4 locked, 8 min for flex whose floors need 14.
  const r = previewOverrun(spec, 1, min(20));
  assert.deepEqual(r.seconds.map(mmss), ['3:00', '3:30', '7:30', '4:00']);
  assert.equal(r.overSec, min(6));
});

test('a module that hits its floor drops out and the rest is shared again', () => {
  const mods = [
    { plannedSec: min(10), pacing: 'flex', minSec: min(9) }, // can barely shrink
    { plannedSec: min(10), pacing: 'flex' }
  ];
  const r = replan(mods, 0, min(16));
  assert.deepEqual(r.seconds.map(mmss), ['9:00', '7:00']);
});

test('time to spare: flex modules grow to at most 1.5x, the rest is spare', () => {
  // 50 min for activity 1 through the exit ticket: 46 for flex, whose caps total 42.
  const r = replan(spec, 2, min(50));
  assert.deepEqual(r.seconds.map(mmss), ['9:00', '10:30', '22:30', '4:00']);
  assert.equal(r.spareSec, min(4));
  assert.equal(r.overSec, 0);
});

test('time to spare below the caps is shared out, not reported', () => {
  const r = previewOverrun(spec, 1, -min(4)); // notes finish 4 min early
  assert.equal(r.spareSec, 0);
  assert.equal(r.seconds.reduce((a, b) => a + b), min(48 - 6 - 6));
  assert.ok(r.seconds[0] > min(6) && r.seconds[2] > min(15));
});

test('only locked modules left: shortfall is over, extra is spare', () => {
  const mods = [{ plannedSec: 240, pacing: 'locked' }];
  assert.deepEqual(replan(mods, 0, 200), { seconds: [240], overSec: 40, spareSec: 0 });
  assert.deepEqual(replan(mods, 0, 300), { seconds: [240], overSec: 0, spareSec: 60 });
});

test('floor and cap helpers', () => {
  assert.equal(floorOf({ plannedSec: 370, pacing: 'flex' }), 195); // half is 185 -> next 15-s step
  assert.equal(floorOf({ plannedSec: 600, pacing: 'flex', minSec: 900 }), 600); // never above plan
  assert.equal(capOf({ plannedSec: 370, pacing: 'flex' }), 555);
});

test('time zones: Chicago bell times convert both ways, across DST', () => {
  const tz = 'America/Chicago';
  const nov2 = zonedToUtc('2026-11-02', '09:51', tz); // CST, UTC-6 (DST ended Nov 1)
  assert.equal(new Date(nov2).toISOString(), '2026-11-02T15:51:00.000Z');
  const oct30 = zonedToUtc('2026-10-30', '09:51', tz); // CDT, UTC-5
  assert.equal(new Date(oct30).toISOString(), '2026-10-30T14:51:00.000Z');
  assert.deepEqual(utcToZoned(nov2, tz), { date: '2026-11-02', time: '09:51' });
  assert.ok(isTimeZone(tz) && !isTimeZone('Mars/Olympus'));
  assert.ok(isIsoDate('2026-11-02') && !isIsoDate('2026-02-30') && !isIsoDate('11/2'));
});

test('mm:ss helpers', () => {
  assert.equal(mmss(345), '5:45');
  assert.equal(mmss(-90), '-1:30');
  assert.equal(parseMmss('10'), 600);
  assert.equal(parseMmss('5:45'), 345);
  assert.equal(parseMmss('5:75'), null);
  assert.equal(addToClock('09:51', 48 * 60), '10:39');
});
