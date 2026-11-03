// scripts/test-export.mjs
// Lessons as Markdown files (src/lib/lesson/exportMd.ts), and checking a lesson that comes back
// in (src/lib/server/library.ts freshLesson).
//   npm run test:export

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportFileName, lessonFromMarkdown, lessonToMarkdown } from '../src/lib/lesson/exportMd.ts';
import { newGrid } from '../src/lib/lesson/grid.ts';
import { freshLesson } from '../src/lib/server/library.ts';

const uuid = () => crypto.randomUUID();
const lesson = {
  title: '4-12 Imaginary Numbers',
  topic: 'Powers of i',
  objective: 'Simplify powers of i.',
  successCriteria: 'I can simplify i^n.',
  standards: 'A2.7A',
  resources: [{ label: 'Desmos', url: 'https://desmos.com/calculator' }],
  durationSec: 3000,
  modules: [
    { id: uuid(), type: 'prompt', title: 'Bellwork', plannedSec: 300, pacing: 'locked', minSec: null, onTimeUp: 'auto', teacherNotes: 'watch row 3',
      config: { category: 'bellwork', questions: [
        { id: uuid(), kind: 'math', text: 'Simplify $i^2$', choices: [], answer: '-1', match: 'any' },
        { id: uuid(), kind: 'choice', text: 'Which is real?', choices: ['i', '2', '3i'], answer: '1' },
        { id: uuid(), kind: 'grid', text: 'Area model', choices: [], answer: JSON.stringify(['x^2', '5x', '2x', '10']), match: 'form', grid: newGrid() }
      ] } },
    { id: uuid(), type: 'notes', title: 'Notes', plannedSec: 900, pacing: 'flex', minSec: null, onTimeUp: 'auto', teacherNotes: '',
      config: { slides: [{ id: uuid(), kind: 'markdown', markdown: '## Powers of i\n\n```\ncode fence inside\n```\n\n$i^4 = 1$' }, { id: uuid(), kind: 'markdown', markdown: '' }] } },
    { id: uuid(), type: 'prompt', title: 'Exit ticket', plannedSec: 240, pacing: 'locked', minSec: null, onTimeUp: 'hold', teacherNotes: '',
      config: { category: 'exit-ticket', questions: [{ id: uuid(), kind: 'text', text: 'What is i?', choices: [], answer: '' }] } }
  ]
};

test('the readable part: title, facts, each module with its questions, keys and pages', () => {
  const md = lessonToMarkdown(lesson);
  assert.ok(md.startsWith('# 4-12 Imaginary Numbers\n'));
  assert.match(md, /\*\*Topic:\*\* Powers of i · \*\*Standards:\*\* A2.7A · \*\*Length:\*\* 50 minutes/);
  assert.match(md, /## 1\. Bellwork\n\n\*Prompt · 5:00 · locked\*/);
  assert.match(md, /> Answer: -1 \(any equivalent form\)/);
  assert.match(md, /- B\. 2\n/);
  assert.match(md, /> Answer: B\. 2/);
  assert.match(md, /\| × \| \$x\$ \| \$\+5\$ \|\n\| --- \| --- \| --- \|\n\| \$x\$ \| ___ \| ___ \|/);
  assert.match(md, /> Answer: x\^2 \| 5x \| 2x \| 10 \(same form, any order\)/);
  assert.match(md, /\*\*Page 2\*\*\n\n\*\(blank board\)\*/);
  assert.match(md, /> Teacher notes: watch row 3/);
});

test('round trip: what comes back is the same lesson, code fences in slides and all', () => {
  const back = lessonFromMarkdown(lessonToMarkdown(lesson));
  assert.deepEqual(back.lesson, lesson);
  const crlf = lessonFromMarkdown(lessonToMarkdown(lesson).replace(/\n/g, '\r\n'));
  assert.deepEqual(crlf.lesson, lesson, 'a file saved on Windows still reads');
});

test('files that are not exports, or were edited badly, are refused with a reason', () => {
  assert.match(lessonFromMarkdown('# just notes').error, /doesn't have a walkerMath lesson/);
  assert.match(lessonFromMarkdown('```walkermath-lesson\n{"format":"x"}\n```').error, /couldn't be read/);
  assert.match(lessonFromMarkdown('```walkermath-lesson\n{broken\n```').error, /couldn't be read/);
  assert.match(lessonFromMarkdown('```walkermath-lesson\n{"format":"walkermath-lesson","version":9,"lesson":{}}\n```').error, /newer version/);
});

test('coming back in: checked like any save, with new ids for modules, questions and slides', () => {
  const fresh = freshLesson(lessonFromMarkdown(lessonToMarkdown(lesson)).lesson);
  assert.equal(typeof fresh, 'object');
  assert.equal(fresh.fields.title, '4-12 Imaginary Numbers');
  assert.equal(fresh.modules.length, 3);
  const oldIds = new Set([...lesson.modules.map((m) => m.id), ...lesson.modules.flatMap((m) => (m.config.questions ?? m.config.slides).map((x) => x.id))]);
  const newIds = [...fresh.modules.map((m) => m.id), ...fresh.modules.flatMap((m) => (m.config.questions ?? m.config.slides).map((x) => x.id))];
  assert.ok(newIds.every((id) => !oldIds.has(id)), 'every id is new');
  assert.equal(fresh.modules[0].config.category, 'bellwork');
  assert.equal(fresh.modules[0].config.questions[0].answer, '-1', 'keys come along');
  assert.equal(fresh.modules[0].config.questions[2].grid.rows, 3);
  assert.equal(fresh.modules[0].teacherNotes, 'watch row 3');
  assert.match(freshLesson({ ...lesson, title: '' }), /title/);
  assert.match(freshLesson({ ...lesson, modules: [{ ...lesson.modules[0], plannedSec: 7 }] }), /./);
  assert.equal(freshLesson(null), "That isn't a lesson.");
});

test('file names', () => {
  assert.equal(exportFileName('4-12 Imaginary Numbers'), '4-12 Imaginary Numbers.md');
  assert.equal(exportFileName('Unit 3: a/b?'), 'Unit 3 a b.md');
  assert.equal(exportFileName(''), 'lesson.md');
});
