// src/lib/lesson/exportMd.ts
// A lesson as a Markdown file: readable on its own (in any editor, on GitHub, printed), and
// importable back into walkerMath. The readable part is for people; the last fenced block holds
// the exact lesson as one line of JSON, which is what import reads. Answer keys and teacher notes
// are included: an export is the teacher's own copy.

import { gridText } from './grid.ts';
import { sortText } from './sort.ts';
import { MODULE_TYPES } from './modules.ts';

export const EXPORT_FENCE = 'walkermath-lesson';
const FORMAT = 'walkermath-lesson';
const VERSION = 1;

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const letter = (i: number) => String.fromCharCode(65 + i);

function keyLine(q: any): string {
  if (!q.answer) return '';
  if (q.kind === 'choice') return `${letter(Number(q.answer))}. ${q.choices?.[Number(q.answer)] ?? ''}`;
  if (q.kind === 'grid') return gridText(q.answer);
  if (q.kind === 'sort') return sortText(q.sort, q.answer);
  return q.answer;
}

function gridTable(q: any): string[] {
  const g = q.grid;
  if (!g?.cells?.length) return [];
  const cell = (c: any) => (c.blank ? (c.group ? `___ (${c.group})` : '___') : String(c.text ?? '').replace(/\|/g, '\\|') || ' ');
  const [head, ...rest] = g.cells as any[][];
  return [
    `| ${head.map(cell).join(' | ')} |`,
    `|${head.map(() => ' --- ').join('|')}|`,
    ...rest.map((row) => `| ${row.map(cell).join(' | ')} |`)
  ];
}

/** The lesson (as the builder holds it: fields and modules, keys and notes included) as Markdown. */
export function lessonToMarkdown(lesson: any): string {
  const out: string[] = [`# ${lesson.title}`, ''];
  const facts = [
    lesson.topic && `**Topic:** ${lesson.topic}`,
    lesson.standards && `**Standards:** ${lesson.standards}`,
    `**Length:** ${Math.round(lesson.durationSec / 60)} minutes`
  ].filter(Boolean);
  out.push(facts.join(' · '), '');
  if (lesson.objective) out.push('## Objective', '', lesson.objective, '');
  if (lesson.successCriteria) out.push('## Success criteria', '', lesson.successCriteria, '');
  if (lesson.resources?.length) out.push('## Resources', '', ...lesson.resources.map((r: any) => `- [${r.label}](${r.url})`), '');

  (lesson.modules ?? []).forEach((m: any, i: number) => {
    const type = MODULE_TYPES[m.type as keyof typeof MODULE_TYPES]?.label ?? m.type;
    out.push('---', '', `## ${i + 1}. ${m.title}`, '', `*${type} · ${mmss(m.plannedSec)} · ${m.pacing === 'locked' ? 'locked' : 'flexible'}*`, '');
    const c = m.config ?? {};
    if (m.type === 'prompt') {
      (c.questions ?? []).forEach((q: any, qi: number) => {
        out.push(`**Q${qi + 1}.** ${q.text}`, '');
        if (q.kind === 'choice') out.push(...q.choices.map((ch: string, ci: number) => `- ${letter(ci)}. ${ch}`), '');
        if (q.kind === 'grid') out.push(...gridTable(q), '');
        if (q.kind === 'sort' && q.sort) out.push(`Groups: ${q.sort.groups.join(' · ')}`, '', ...q.sort.cards.map((c: string) => `- ${c}`), '');
        const key = keyLine(q);
        const how = q.kind === 'grid' && q.grid?.check === 'area' ? ' (area model: multiplies out to this)' : q.kind === 'math' || q.kind === 'grid' ? (q.match === 'any' ? ' (any equivalent form)' : ' (same form, any order)') : '';
        if (key) out.push(`> Answer: ${key}${how}`, '');
      });
    } else if (m.type === 'notes') {
      const pages = (c.slides ?? []).map((s: any) => (s.markdown?.trim() ? s.markdown.trim() : '*(blank board)*'));
      pages.forEach((p: string, pi: number) => out.push(`**Page ${pi + 1}**`, '', p, ''));
    } else {
      if (c.instructions) out.push(c.instructions, '');
      if (c.links?.length) out.push(...c.links.map((l: any) => `- [${l.label}](${l.url})`), '');
      if (c.coliseumId) out.push(`Coliseum game: \`${c.coliseumId}\``, '');
    }
    if (m.teacherNotes) out.push(`> Teacher notes: ${m.teacherNotes.replace(/\n/g, ' ')}`, '');
  });

  out.push(
    '---',
    '',
    '<!-- The block below is what walkerMath reads when you import this file. Keep it as it is. -->',
    '',
    '```' + EXPORT_FENCE,
    JSON.stringify({ format: FORMAT, version: VERSION, lesson }),
    '```',
    ''
  );
  return out.join('\n');
}

/** The lesson inside an exported file, or an error message. */
export function lessonFromMarkdown(text: string): { lesson: any } | { error: string } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const at = lines.findIndex((l) => l.trim() === '```' + EXPORT_FENCE);
  if (at < 0) return { error: "That file doesn't have a walkerMath lesson in it (export one with [export .md])." };
  try {
    const data = JSON.parse(lines[at + 1] ?? '');
    if (data?.format !== FORMAT || !data.lesson || typeof data.lesson !== 'object') throw new Error();
    if (Number(data.version) > VERSION) return { error: 'That file was made by a newer version of walkerMath.' };
    return { lesson: data.lesson };
  } catch {
    return { error: "The lesson in that file couldn't be read. Was it edited?" };
  }
}

/** A file name from the title: "4-12 Imaginary Numbers.md". */
export const exportFileName = (title: string) => `${(title || 'lesson').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'lesson'}.md`;
