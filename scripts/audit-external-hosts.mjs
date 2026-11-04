// scripts/audit-external-hosts.mjs
// Lists every web address the BUILT site contains, grouped by host, with the files that mention it,
// so a school filter's allow-list can be checked against what students' browsers could ask for.
//
//   npm run build && npm run audit:hosts            (scans dist/)
//   node scripts/audit-external-hosts.mjs src       (scans the source: .ts .svelte .astro .md too)
//
// Exits 1 when a host is found that isn't in the lists below, so a new dependency can't slip in
// unnoticed. It reads text files only (html, js, css, json, svg, map files are skipped), and
// finds addresses written out in full or as //host/..., so a host built up in pieces at run time
// wouldn't show; src/lib/lesson/liveClient.ts (location.host) is the only such one, and it's
// same-origin by construction.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'dist');

/** Hosts students' browsers are expected to talk to or be sent to, and why. */
const EXPECTED = {
  'walkermath.com': 'the site itself (pages, scripts, the live lesson socket and polling)',
  'accounts.google.com': 'teacher sign-in (a link teachers click; students never load it)',
  'docs.google.com': 'the contact page form post'
};

/** Written in the code but not a request from a browser: XML namespaces, specs, internal names. */
const HARMLESS = {
  'www.w3.org': 'XML/SVG namespace names, never requested',
  'schemas.openxmlformats.org': 'XLSX file format names inside exported reports, never requested',
  'purl.org': 'XML namespace names, never requested',
  'raw.githubusercontent.com': 'the Worker downloads a profanity list from here for leaderboard names; a browser never does',
  'oauth2.googleapis.com': 'the Worker talks to Google during teacher sign-in; a browser never does',
  'room.internal': 'internal name for the lesson room, never leaves the Worker',
  'katex.org': 'text in a comment or a link in KaTeX errors, not requested',
  'reactjs.org': 'text in a framework error message, not requested',
  'svelte.dev': 'text in a framework error message, not requested',
  'github.com': 'text in a framework error message or comment, not requested',
  'developer.mozilla.org': 'text in a framework error message, not requested',
  'w3.org': 'XML/SVG namespace names, never requested',
  'example.com': 'placeholder text',
  'localhost': 'development only'
};

const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.xml', '.txt', '.webmanifest', '.ts', '.svelte', '.astro', '.mdx', '.md']);
const URL_RE = /(?:https?:)?\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?::\d+)?(?=[\/"'`)\s<>?#\\,;]|$)/gi;

if (!fs.existsSync(root)) {
  console.error(`No ${root}. Build first: npm run build`);
  process.exit(2);
}

const found = new Map(); // host -> Map(file -> count)
let files = 0;
(function walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p);
    else if (TEXT.has(path.extname(name.name))) {
      files++;
      const text = fs.readFileSync(p, 'utf8');
      for (const m of text.matchAll(URL_RE)) {
        const host = m[1].toLowerCase().replace(/\.$/, '');
        // "//host" also matches inside "http://host" once; a "://" prefix is handled by the optional scheme.
        const rel = path.relative(root, p).replaceAll('\\', '/');
        if (!found.has(host)) found.set(host, new Map());
        found.get(host).set(rel, (found.get(host).get(rel) ?? 0) + 1);
      }
    }
  }
})(root);

const isUnder = (host, table) => Object.keys(table).find((k) => host === k || host.endsWith('.' + k));
const unlisted = [];
console.log(`Scanned ${files} text files in ${root}\n`);
for (const [title, table, pick] of [
  ['EXPECTED (the school filter must allow these)', EXPECTED, (h) => isUnder(h, EXPECTED)],
  ['HARMLESS (written in code, never requested by a browser)', HARMLESS, (h) => !isUnder(h, EXPECTED) && isUnder(h, HARMLESS)]
]) {
  const rows = [...found.keys()].filter(pick).sort();
  console.log(`${title}${rows.length ? '' : ': none'}`);
  for (const h of rows) {
    const where = [...found.get(h).keys()];
    console.log(`  ${h}  (${table[isUnder(h, table)]})\n      in ${where.slice(0, 4).join(', ')}${where.length > 4 ? `, +${where.length - 4} more` : ''}`);
  }
  console.log();
}
for (const h of [...found.keys()].sort()) if (!isUnder(h, EXPECTED) && !isUnder(h, HARMLESS)) unlisted.push(h);
if (unlisted.length) {
  console.log('NOT LISTED (check each: could a student\'s browser request it?)');
  for (const h of unlisted) {
    const where = [...found.get(h).keys()];
    console.log(`  ${h}\n      in ${where.slice(0, 6).join(', ')}${where.length > 6 ? `, +${where.length - 6} more` : ''}`);
  }
  process.exit(1);
}
console.log('No unlisted hosts.');
