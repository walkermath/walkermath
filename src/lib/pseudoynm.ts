// src/lib/pseudonym.ts
// Neutral, auto-generated player aliases ("VectorFoxK7M2"). Students never type a name.
//
// Shared by the browser (to create/store the alias) and by functions/api/leaderboard.js (to
// verify a submitted alias really came from this generator, so nobody can POST free text).
//
// RULES FOR EDITING THE LISTS
//   * Only ever ADD words. Removing or renaming one makes already-stored aliases fail the
//     server check.
//   * Keep every word at most 6 letters, letters only: alias = adjective + noun + 4-char suffix
//     must stay within 16 characters (the server accepts /^[A-Za-z0-9]{3,16}$/).

export const ADJECTIVES = [
  'Delta', 'Matrix', 'Vector', 'Prism', 'Cosine', 'Apex', 'Turbo', 'Factor', 'Quanta', 'Sigma', 'Ember',
  'Alpha', 'Gamma', 'Theta', 'Lambda', 'Kappa', 'Radian', 'Prime', 'Cosmic', 'Binary',
  'Cubic', 'Linear', 'Tensor', 'Vertex', 'Polar', 'Orbit', 'Photon', 'Proton', 'Laser', 'Rocket',
  'Solar', 'Lunar', 'Nova', 'Pixel', 'Quartz', 'Sonic', 'Hyper', 'Helix', 'Zenith', 'Quark'
] as const;

export const NOUNS = [
  'Fox', 'Hawk', 'Otter', 'Falcon', 'Bison', 'Panda', 'Lynx', 'Viper', 'Badger', 'Owl',
  'Wolf', 'Raven', 'Gecko', 'Heron', 'Koala', 'Lemur', 'Moose', 'Newt', 'Osprey', 'Puma',
  'Robin', 'Seal', 'Tiger', 'Whale', 'Yak', 'Zebra', 'Dingo', 'Eagle', 'Finch', 'Ibis',
  'Jaguar', 'Marten', 'Orca', 'Pika', 'Quokka', 'Shark', 'Stoat', 'Swan', 'Wombat', 'Condor'
] as const;

// No vowels, so the random tail can never spell a word. No 0/1 so it can't be misread.
const SUFFIX_CHARS = 'BCDFGHJKLMNPQRSTVWXZ23456789';
const SUFFIX_LEN = 4;

export const ALIAS_STORAGE_KEY = 'coliseum_player_alias';

/** unbiased-enough random int in [0, n) using the Web Crypto API (falls back to Math.random) */
function randInt(n: number): number {
  const c = (globalThis as any).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

export function generateAlias(): string {
  let tail = '';
  for (let i = 0; i < SUFFIX_LEN; i++) tail += SUFFIX_CHARS[randInt(SUFFIX_CHARS.length)];
  return ADJECTIVES[randInt(ADJECTIVES.length)] + NOUNS[randInt(NOUNS.length)] + tail;
}

const ALIAS_RE = new RegExp(
  `^(?:${ADJECTIVES.join('|')})(?:${NOUNS.join('|')})[${SUFFIX_CHARS}]{${SUFFIX_LEN}}$`
);

/** true only for strings this generator can produce */
export function isValidAlias(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 16 && ALIAS_RE.test(value);
}

/* ---------------- browser-side persistence ---------------- */

/** The device's alias; created and stored on first use. Safe to call during SSR (returns ''). */
export function getAlias(): string {
  if (typeof window === 'undefined') return '';
  try {
    const saved = localStorage.getItem(ALIAS_STORAGE_KEY);
    if (isValidAlias(saved)) return saved;
  } catch {}
  return rerollAlias();
}

/** Replace the stored alias with a fresh one and return it. */
export function rerollAlias(): string {
  const next = generateAlias();
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(ALIAS_STORAGE_KEY, next);
    } catch {}
  }
  return next;
}