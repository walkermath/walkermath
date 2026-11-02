// src/pages/notes/index.json.ts
// Static list of published notes, built at deploy time. The lesson builder's Notes module picks
// from it; Phase 4's student view shows the chosen note through /embed/notes/<id>.
import { getCollection } from 'astro:content';

export async function GET() {
  const notes = (await getCollection('notes', ({ data }) => !data.unpublished))
    .map((n) => ({
      id: n.id,
      title: n.data.title,
      subject: n.data.subject ?? null,
      unitTitle: n.data.unitTitle ?? null,
      unit: n.data.unit ?? null,
      order: n.data.order ?? null
    }))
    .sort((a, b) => (a.unit ?? 999) - (b.unit ?? 999) || (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title));
  return new Response(JSON.stringify({ notes }), { headers: { 'Content-Type': 'application/json' } });
}
