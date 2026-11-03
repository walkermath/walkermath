// src/lib/pseudonym.ts
// Neutral, auto-generated names ("VectorFox42"). Students never type a name.
//
// Used for class aliases (printed on a student's card) and leaderboard names (handed out by the
// server). functions/api/leaderboard.js and the tests use isValidAlias to check a name really came
// from this generator.
//
// RULES FOR EDITING THE LISTS
//   * Only ever ADD words. Removing or renaming one makes names already issued fail the check.
//   * Letters only, at most 7 per word: adjective + noun + 2-digit tail stays within 16 characters.
//   * Keep words neutral: no slang meanings a class would snicker at.
//
// Names issued before Nov 2026 have a 4-character tail of consonants and digits ("VectorFoxK7M2");
// they stay valid. New names get a 2-digit tail.

export const ADJECTIVES = [
  // the original 40 (at most 6 letters)
  'Delta', 'Matrix', 'Vector', 'Prism', 'Cosine', 'Apex', 'Turbo', 'Factor', 'Quanta', 'Sigma', 'Ember',
  'Alpha', 'Gamma', 'Theta', 'Lambda', 'Kappa', 'Radian', 'Prime', 'Cosmic', 'Binary',
  'Cubic', 'Linear', 'Tensor', 'Vertex', 'Polar', 'Orbit', 'Photon', 'Proton', 'Laser', 'Rocket',
  'Solar', 'Lunar', 'Nova', 'Pixel', 'Quartz', 'Sonic', 'Hyper', 'Helix', 'Zenith', 'Quark',
  // added Nov 2026
  'Omega', 'Epsilon', 'Zeta', 'Iota', 'Beta', 'Atomic', 'Comet', 'Nebula', 'Plasma', 'Fractal',
  'Integer', 'Decimal', 'Radical', 'Spiral', 'Quantum', 'Neon', 'Argon', 'Cobalt', 'Copper', 'Silver',
  'Golden', 'Crystal', 'Granite', 'Glacier', 'Arctic', 'Thunder', 'Storm', 'Rapid', 'Swift', 'Stellar',
  'Galaxy', 'Meteor', 'Kinetic', 'Magnet', 'Vortex', 'Tangent', 'Median', 'Summit', 'Cipher', 'Axiom'
] as const;

export const NOUNS = [
  // the original 40 (at most 6 letters)
  'Fox', 'Hawk', 'Otter', 'Falcon', 'Bison', 'Panda', 'Lynx', 'Viper', 'Badger', 'Owl',
  'Wolf', 'Raven', 'Gecko', 'Heron', 'Koala', 'Lemur', 'Moose', 'Newt', 'Osprey', 'Puma',
  'Robin', 'Seal', 'Tiger', 'Whale', 'Yak', 'Zebra', 'Dingo', 'Eagle', 'Finch', 'Ibis',
  'Jaguar', 'Marten', 'Orca', 'Pika', 'Quokka', 'Shark', 'Stoat', 'Swan', 'Wombat', 'Condor',
  // added Nov 2026
  'Bluejay', 'Bobcat', 'Cheetah', 'Cobra', 'Coyote', 'Crane', 'Dolphin', 'Ferret', 'Gazelle', 'Gibbon',
  'Hippo', 'Hyena', 'Iguana', 'Impala', 'Kestrel', 'Kiwi', 'Llama', 'Magpie', 'Manatee', 'Meerkat',
  'Narwhal', 'Ocelot', 'Parrot', 'Pelican', 'Penguin', 'Python', 'Rabbit', 'Salmon', 'Sparrow', 'Tapir',
  'Toucan', 'Turtle', 'Walrus', 'Weasel', 'Bear', 'Elk', 'Mantis', 'Lion', 'Jackal', 'Alpaca'
] as const;

/** Two-digit tails never used: 69, and the hate-symbol numbers 14, 18 and 88. */
export const BANNED_TAILS = ['14', '18', '69', '88'] as const;
/** 10-99 (no leading zero to misread), minus the banned ones. */
export const TAILS: readonly string[] = Array.from({ length: 90 }, (_, i) => String(i + 10)).filter(
  (t) => !(BANNED_TAILS as readonly string[]).includes(t)
);

/** The pre-Nov-2026 tail: 4 characters, no vowels (can't spell a word), no 0/1. Validation only. */
const OLD_SUFFIX_CHARS = 'BCDFGHJKLMNPQRSTVWXZ23456789';

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
  return ADJECTIVES[randInt(ADJECTIVES.length)] + NOUNS[randInt(NOUNS.length)] + TAILS[randInt(TAILS.length)];
}

const WORDS = `(?:${ADJECTIVES.join('|')})(?:${NOUNS.join('|')})`;
const NEW_RE = new RegExp(`^${WORDS}(\\d{2})$`);
const OLD_RE = new RegExp(`^${WORDS}[${OLD_SUFFIX_CHARS}]{4}$`);

/** true only for strings this generator can produce (now, or before Nov 2026) */
export function isValidAlias(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 16) return false;
  const m = NEW_RE.exec(value);
  if (m) return TAILS.includes(m[1]);
  return OLD_RE.test(value);
}
