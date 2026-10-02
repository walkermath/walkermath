import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const notesCollection = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string().default('statistics'),
    pubDate: z.date(),
  }),
});

const appsCollection = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/apps' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string().default('interactive'),
  }),
});

export const collections = {
  notes: notesCollection,
  apps: appsCollection,
};