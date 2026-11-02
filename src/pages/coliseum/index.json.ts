// src/pages/coliseum/index.json.ts
// Static list of active Coliseum challenges, built at deploy time. The lesson builder's
// Coliseum Practice activity picks from it; the lesson shows the pick through /embed/coliseum/<id>.
import { getCollection } from 'astro:content';

export async function GET() {
  const challenges = (await getCollection('coliseum', ({ data }) => data.isActive))
    .map((c) => ({ id: c.id, title: c.data.title, description: c.data.description, topic: c.data.topic }))
    .sort((a, b) => a.topic.localeCompare(b.topic) || a.title.localeCompare(b.title));
  return new Response(JSON.stringify({ challenges }), { headers: { 'Content-Type': 'application/json' } });
}
