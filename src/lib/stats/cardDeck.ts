// src/lib/stats/cardDeck.ts
// The card population for the sampling-distributions app (src/components/apps/SamplingDistributions.svelte).
// A card is an id 0..51: suit = floor(id / 13) in ♠ ♥ ♦ ♣ order, rank = id % 13 in A..K order.
// Card value: ace 1, number cards their number, J/Q/K 10.
// Samples are drawn WITH replacement, so draws are independent and SE = σ/√n holds exactly
// (no finite-population correction). Shared math: sampling.ts.   npm run test:sampling

import { clampInt, statsFromCounts, type PopulationStats, type Sample } from './sampling.ts';

export type CardId = number;

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const RANK_NAMES = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];

export const CARD_MAX_VALUE = 10;
export const MAX_N = 50;

export const ALL_CARDS: CardId[] = Array.from({ length: 52 }, (_, i) => i);

export const suitOf = (id: CardId) => Math.floor(id / 13);
export const rankOf = (id: CardId) => id % 13;
export const cardValue = (id: CardId) => Math.min(rankOf(id) + 1, CARD_MAX_VALUE);
export const cardLabel = (id: CardId) => `${RANKS[rankOf(id)]}${SUITS[suitOf(id)]}`;
export const cardName = (id: CardId) => `${RANK_NAMES[rankOf(id)]} of ${SUIT_NAMES[suitOf(id)]}`;
export const isRed = (id: CardId) => suitOf(id) === 1 || suitOf(id) === 2;

/** A through 10 in every suit (no face cards): 4 cards of each value 1..10, a flat population. The default. */
export const A_TO_10: CardId[] = ALL_CARDS.filter((c) => rankOf(c) <= 9);

/** Starting populations a student (or later, a lesson) can pick. */
export const PRESETS: { id: string; label: string; cards: CardId[] }[] = [
  { id: 'a-10', label: 'A–10', cards: A_TO_10 },
  { id: 'deck', label: 'full deck', cards: ALL_CARDS },
  { id: 'hearts', label: 'only ♥', cards: ALL_CARDS.filter((c) => suitOf(c) === 1) },
  { id: 'low', label: 'A–5 only', cards: ALL_CARDS.filter((c) => rankOf(c) <= 4) },
  { id: 'aces-tens', label: 'aces + 10s', cards: ALL_CARDS.filter((c) => cardValue(c) === 1 || rankOf(c) === 9) },
  { id: 'none', label: 'clear', cards: [] },
];

export const clampN = (n: number) => clampInt(n, 1, MAX_N);

export function populationStats(cards: CardId[]): PopulationStats {
  const counts = new Array(CARD_MAX_VALUE).fill(0);
  for (const c of cards) counts[cardValue(c) - 1]++;
  return statsFromCounts(counts);
}

/** One sample of n cards drawn with replacement. */
export function drawSample(population: CardId[], n: number, rnd: () => number = Math.random): Sample {
  if (population.length === 0) throw new Error('empty population');
  const items: CardId[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const c = population[Math.min(population.length - 1, Math.floor(rnd() * population.length))];
    items.push(c);
    sum += cardValue(c);
  }
  return { items, sum, mean: sum / n };
}

/** A short name for a population: its preset's label if it matches one, else "custom (k cards)". */
export function populationLabel(cards: CardId[]): string {
  const set = new Set(cards);
  for (const p of PRESETS) {
    if (p.cards.length > 0 && p.cards.length === set.size && p.cards.every((c) => set.has(c))) return p.label;
  }
  return `custom (${set.size} ${set.size === 1 ? 'card' : 'cards'})`;
}
