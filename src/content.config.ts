import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const notesCollection = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/notes' }),
  schema: z.object({
    unpublished: z.boolean().default(false),
    title: z.string(),
    description: z.string(),
    subject: z.string().optional(), // e.g. "Algebra", "Statistics", "Calculus"
    unitTitle: z.string().optional(),    // e.g. "Unit 3: Equations & Systems"
    unit: z.number().optional(), // e.g. 1, 2, 3 for ordering within a course
    order: z.number().optional(), // e.g. 1, 2, 3 for ordering within a unit
    prev: z.string().optional().nullable(), // e.g. "unit-2-functions"
    next: z.string().optional().nullable(), // e.g. "unit-3-equations"
    related: z.array(z.string()).default([]), // e.g. ["unit-3-equations", "unit-3-inequalities"]
    tags: z.array(z.string()).default([]), // e.g. ["tape-diagrams", "absolute-value"]
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

const coliseumCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/coliseum" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    topic: z.string(),             // e.g., "Algebra II", "Systems", "Statistics"
    metricLabel: z.string().default('Score'), // e.g., "Streak", "Points", "Best Time"
    isActive: z.boolean().default(true),
  }),
});

export const collections = {
  notes: notesCollection,
  apps: appsCollection,
  coliseum: coliseumCollection,
};