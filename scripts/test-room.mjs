// The live room's state machine (src/lib/lesson/room.ts). Run: npm run test:room
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { startRoom, apply, timeUp, moduleLeftMs, nextAlarm, parseCommand, moduleStarts } = await import('../src/lib/lesson/room.ts');

const M = (title, plannedSec, pacing = 'flex', extra = {}) => ({
  id: title, type: 'activity', title, plannedSec, pacing, minSec: null, onTimeUp: 'auto', collects: false, config: {}, ...extra
});
// The spec's 48-minute lesson.
const lesson = () => [
  M('Bellwork', 360, 'locked', { type: 'prompt' }),
  M('Notes', 600, 'flex', { type: 'notes' }),
  M('Activity 1', 360),
  M('Activity 2', 420),
  M('Independent', 900),
  M('Exit ticket', 240, 'locked', { type: 'prompt', onTimeUp: 'hold' })
];
const T0 = Date.UTC(2026, 10, 2, 15, 0); // 9:00 local-ish, any fixed time
const min = (m) => m * 60_000;

test('starting on time keeps the plan; the alarm is the first module end', () => {
  const s = startRoom('run', lesson(), T0 + min(48), T0);
  assert.deepEqual(s.plan, [360, 600, 360, 420, 900, 240]);
  assert.equal(s.index, 0);
  assert.equal(nextAlarm(s), T0 + 360_000);
  assert.equal(moduleLeftMs(s, T0 + 60_000), 300_000);
});

test('starting 4 minutes late squeezes the flex modules, not the locked ones', () => {
  const s = startRoom('run', lesson(), T0 + min(48), T0 + min(4));
  assert.equal(s.plan[0], 360);
  assert.equal(s.plan[5], 240);
  assert.equal(s.plan.reduce((a, b) => a + b, 0), 44 * 60);
  assert.ok(s.plan[4] < 900);
});

test("the spec's worked example: notes run one minute long", () => {
  const ms = lesson();
  let s = startRoom('run', ms, T0 + min(48), T0);
  s = apply(s, ms, { type: 'next' }, T0 + min(6)); // bellwork on time
  assert.equal(s.index, 1);
  s = apply(s, ms, { type: 'next' }, T0 + min(17)); // notes took 11
  assert.deepEqual(s.plan, [360, 660, 345, 405, 870, 240]);
  assert.equal(s.version, 3);
});

test('auto modules move on at time up; hold modules and the last module wait', () => {
  const ms = lesson();
  let s = startRoom('run', ms, T0 + min(48), T0);
  assert.equal(timeUp(s, ms, T0 + min(3)), s, 'an early alarm changes nothing');
  s = timeUp(s, ms, T0 + min(6));
  assert.equal(s.index, 1);
  s = apply(s, ms, { type: 'jump', index: 5 }, T0 + min(10));
  assert.equal(s.index, 5);
  s = timeUp(s, ms, T0 + min(14) + 1000);
  assert.equal(s.index, 5);
  assert.equal(s.holding, true);
  assert.equal(nextAlarm(s), null);
  const again = timeUp(s, ms, T0 + min(15));
  assert.equal(again, s, 'a second alarm is ignored');
});

test('+1 min on the current module comes out of the flex modules after it', () => {
  const ms = lesson();
  let s = startRoom('run', ms, T0 + min(48), T0);
  s = apply(s, ms, { type: 'adjust', seconds: 60 }, T0 + min(2));
  assert.equal(s.plan[0], 420);
  assert.equal(s.plan.reduce((a, b) => a + b, 0), 48 * 60);
  assert.equal(s.plan[5], 240);
  s = apply(s, ms, { type: 'adjust', seconds: -600 }, T0 + min(3));
  assert.equal(s.plan[0], 195, 'never below what has passed + 15 s');
});

test('pause freezes the clock; resume shifts it and re-plans the rest', () => {
  const ms = lesson();
  let s = startRoom('run', ms, T0 + min(48), T0);
  s = apply(s, ms, { type: 'pause' }, T0 + min(2));
  assert.equal(moduleLeftMs(s, T0 + min(2)), min(4));
  assert.equal(moduleLeftMs(s, T0 + min(5)), min(4), 'frozen while paused');
  assert.equal(nextAlarm(s), null);
  assert.equal(apply(s, ms, { type: 'pause' }, T0 + min(3)), s);
  s = apply(s, ms, { type: 'resume' }, T0 + min(5));
  assert.equal(moduleLeftMs(s, T0 + min(5)), min(4));
  assert.equal(nextAlarm(s), T0 + min(9));
  assert.equal(s.plan.reduce((a, b) => a + b, 0), 45 * 60, 'three paused minutes come out of the rest');
});

test('back, pages, end; nothing changes after the end', () => {
  const ms = lesson();
  let s = startRoom('run', ms, T0 + min(48), T0);
  s = apply(s, ms, { type: 'next' }, T0 + min(6));
  s = apply(s, ms, { type: 'page', page: 2 }, T0 + min(7));
  assert.equal(s.page, 2);
  const onActivity = apply(apply(s, ms, { type: 'next' }, T0 + min(16)), ms, { type: 'page', page: 1 }, T0 + min(17));
  assert.equal(onActivity.page, 0, 'pages only apply to Notes');
  s = apply(s, ms, { type: 'back' }, T0 + min(8));
  assert.equal(s.index, 0);
  assert.equal(s.page, 0);
  s = apply(s, ms, { type: 'end' }, T0 + min(9));
  assert.equal(s.status, 'ended');
  assert.equal(apply(s, ms, { type: 'next' }, T0 + min(10)), s);
  assert.equal(nextAlarm(s), null);
});

test('[next] on the last module stops it and waits for [end]', () => {
  const ms = lesson();
  let s = startRoom('run', ms, T0 + min(48), T0);
  s = apply(s, ms, { type: 'jump', index: 5 }, T0 + min(1));
  s = apply(s, ms, { type: 'next' }, T0 + min(2));
  assert.equal(s.holding, true);
  assert.equal(s.status, 'live');
  assert.equal(apply(s, ms, { type: 'next' }, T0 + min(3)), s);
  s = apply(s, ms, { type: 'adjust', seconds: 60 }, T0 + min(3));
  assert.equal(s.holding, false, '+1 min reopens a waiting module');
});

test('commands from the network are checked', () => {
  assert.deepEqual(parseCommand({ type: 'next', extra: 1 }), { type: 'next' });
  assert.equal(parseCommand({ type: 'adjust', seconds: '60' })?.seconds, 60);
  assert.equal(parseCommand({ type: 'adjust', seconds: 99999 }), null);
  assert.equal(parseCommand({ type: 'jump', index: 1.5 }), null);
  assert.equal(parseCommand({ type: 'drop tables' }), null);
  assert.equal(parseCommand(null), null);
});

test('module start times line up for the schedule list', () => {
  const ms = lesson();
  let s = startRoom('run', ms, T0 + min(48), T0);
  s = apply(s, ms, { type: 'next' }, T0 + min(6));
  const starts = moduleStarts(s, T0 + min(7));
  assert.equal(starts[1], T0 + min(6));
  assert.equal(starts[2], T0 + min(16));
  assert.equal(starts[5], T0 + min(44));
});

test('countdown text', async () => {
  const { countdown } = await import('../src/lib/lesson/liveClient.ts');
  assert.equal(countdown(245_000), '4:05');
  assert.equal(countdown(244_001), '4:05', 'rounds up while time is left');
  assert.equal(countdown(0), '0:00');
  assert.equal(countdown(-30_500), '-0:30');
  assert.equal(countdown(3_600_000), '60:00');
});
