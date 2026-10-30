// src/pages/notes/source/[id].json.ts
// A published note's Markdown source, built at deploy time, so the lesson builder can import it
// as pre-written slides (a copy: later edits to the note don't change lessons already built).
import { getCollection, type CollectionEntry } from 'astro:content';

export async function getStaticPaths() {
  const notes = await getCollection('notes', ({ data }) => !data.unpublished);
  return notes.map((entry) => ({ params: { id: entry.id }, props: { entry } }));
}

export async function GET({ props }: { props: { entry: CollectionEntry<'notes'> } }) {
  const { entry } = props;
  return new Response(JSON.stringify({ id: entry.id, title: entry.data.title, body: entry.body ?? '' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
