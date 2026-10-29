// functions/api/leaderboard.js
import {
  EVENTS,
  GAMES,
  isEventId,
  normalizeLevel,
  normalizeTags,
  normalizeVariant,
  parseChallengeId,
  raceWeight
} from '../../src/lib/coliseumBoards.ts';
import { isValidAlias } from '../../src/lib/pseudonym.ts';
import { isKnownTeacher } from '../../src/lib/teachers.ts';

let cachedBlocklist = null;

async function getBlocklist(secretList) {
  if (secretList) {
    return secretList.split(',').map(w => normalizeText(w)).filter(w => w.length > 0);
  }
  if (cachedBlocklist) return cachedBlocklist;

  const languages = ['en', 'es', 'fr', 'de'];
  let wordSet = new Set();
  
  for (const lang of languages) {
    try {
      const res = await fetch(`https://raw.githubusercontent.com/censor-text/profanity-list/main/list/${lang}.txt`);
      if (res.ok) {
        const text = await res.text();
        text.split('\n').forEach(w => {
          const cleaned = normalizeText(w);
          if (cleaned.length > 0 && !w.trim().startsWith('#')) {
            wordSet.add(cleaned);
          }
        });
      }
    } catch (e) {
      // Fail silently for individual languages, fall back gracefully
    }
  }

  if (wordSet.size === 0) {
    ['BADWORDS'].forEach(w => wordSet.add(w));
  }

  cachedBlocklist = Array.from(wordSet);
  return cachedBlocklist;
}

function normalizeText(text) {
  if (!text) return '';
  let upper = text.toUpperCase();

  const leetMap = {
    '0': 'O', '1': 'I', '!': 'I', '|': 'I',
    '3': 'E', '4': 'A', '@': 'A', '5': 'S',
    '$': 'S', '7': 'T', '8': 'B', '9': 'G'
  };

  upper = upper.split('').map(char => leetMap[char] || char).join('');
  upper = upper.replace(/[^A-Z0-9]/g, '');
  upper = upper.replace(/(.)\1{2,}/g, '$1');

  return upper;
}

async function isProfane(text, secretList) {
  if (!text) return false;
  
  // normalizeText() returns UPPERCASE and so do the blocklist entries, so compare in uppercase
  // (this used to lowercase one side, which meant no blocklist word could ever match).
  const normalized = normalizeText(text);
  const qToGVariant = normalized.replace(/Q/g, 'G');

  // Explicitly catch common custom spellings that bypass standard blocklists
  const explicitVariations = ['NIQR', 'NIQQ', 'NIGQ', 'NIGR', 'NIGG', 'NIQG', 'NIQE', 'NIKKR', 'KKK', 'NIKKER', 'NICKER', 'NICR', 'NICCR','NICCCR', 'NIKR', 'NICKR', 'NIKCR', 'NIKCCR', 'NIKKCR', 'NIKCKR', 'NICKKR', 'NICCKR', 'NICKCR'];
  
  if (explicitVariations.some(term => normalized.includes(term) || qToGVariant.includes(term))) {
    return true;
  }

  // Fallback to checking the standard blocklist
  const list = await getBlocklist(secretList);
  return list.some(word => word.length > 0 && (normalized.includes(word) || qToGVariant.includes(word)));
} 

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// SQL fragment: race-time weight for a row's level (multiplier ^ RACE_LEVEL_FAVOR), 1 for games without weights.
function weightCase(game) {
  const n = GAMES[game]?.raceWeights?.length || 0;
  if (!n) return '1.0';
  const whens = Array.from({ length: n }, (_, i) => `WHEN ${i + 1} THEN ${raceWeight(game, i + 1).toFixed(6)}`).join(' ');
  return `CASE level ${whens} ELSE 1.0 END`;
}

// GET /api/leaderboard?list=true
//   -> [{ game, event, entries, players }]            which boards exist
// GET /api/leaderboard?game=..&event=..[&band=..|&level=..][&variant=typed|tiles][&teacher=..][&class_period=..][&timeframe=..]
//   -> { rankBy, players, entries: [...] }            one row per player: their best result across the filtered strata
// (the old ?challenge_id=gcd-racer-60s form still works; it is parsed into game + event)
export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);

  if (searchParams.get('list') === 'true') {
    try {
      const { results } = await context.env.DB.prepare(`
        SELECT game, event, COUNT(*) AS entries, COUNT(DISTINCT display_name) AS players
        FROM leaderboard_entries
        GROUP BY game, event
        ORDER BY game ASC, event ASC
      `).all();
      return json(results);
    } catch (err) {
      return json({ error: 'Database error' }, 500);
    }
  }

  let game = searchParams.get('game');
  let event = searchParams.get('event');
  const legacyId = searchParams.get('challenge_id');
  if (!game && legacyId) ({ game, event } = parseChallengeId(legacyId));
  game = (game || '').trim().toLowerCase();
  if (!game || !event || !isEventId(event)) {
    return json({ error: 'Missing or invalid game/event' }, 400);
  }

  const rankBy = EVENTS[event].rankBy;
  const where = ['game = ?', 'event = ?'];
  const params = [game, event];

  // --- strata filters (level band / level / variant) ---
  const band = GAMES[game]?.bands?.find(b => b.id === searchParams.get('band'));
  if (band) {
    where.push('level BETWEEN ? AND ?');
    params.push(band.lo, band.hi);
  } else {
    const level = normalizeLevel(game, searchParams.get('level'));
    if (level > 0) {
      where.push('level = ?');
      params.push(level);
    }
  }

  const variant = searchParams.get('variant');
  if (variant === 'tiles') {
    where.push(`variant = ''`);
  } else if (variant && variant !== 'all') {
    const v = normalizeVariant(game, variant);
    if (v) {
      where.push('variant = ?');
      params.push(v);
    }
  }

  // --- class / time filters ---
  const teacher = searchParams.get('teacher');
  if (teacher && teacher !== 'ALL') {
    where.push('UPPER(teacher) = ?');
    params.push(teacher.toUpperCase());
  }
  const classPeriod = searchParams.get('class_period');
  if (classPeriod && classPeriod !== 'ALL') {
    where.push('UPPER(class_period) = ?');
    params.push(classPeriod.toUpperCase());
  }
  const timeframe = searchParams.get('timeframe') || 'all';
  if (timeframe === 'daily') where.push(`created_at >= datetime('now', '-1 day')`);
  else if (timeframe === 'weekly') where.push(`created_at >= datetime('now', '-7 days')`);

  // Score events: highest score first. Time events: fastest level-adjusted time first, so a
  // level-10 run and a level-1 run can share one board (see RACE_LEVEL_FAVOR in coliseumBoards.ts).
  const adjusted = rankBy === 'time' ? `duration_ms * 1.0 / (${weightCase(game)})` : 'duration_ms * 1.0';
  const order = rankBy === 'time' ? 'adjusted_ms ASC, score DESC' : 'score DESC, duration_ms ASC';

  const sql = `
    WITH filtered AS (
      SELECT display_name, class_period, teacher, school_year, score, duration_ms, created_at,
             level, variant, tags, ${adjusted} AS adjusted_ms
      FROM leaderboard_entries
      WHERE ${where.join(' AND ')}
    ),
    ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY display_name ORDER BY ${order}) AS rn
      FROM filtered
    )
    SELECT display_name, class_period, teacher, school_year, score, duration_ms, created_at,
           level, variant, tags, adjusted_ms
    FROM ranked
    WHERE rn = 1
    ORDER BY ${order}
    LIMIT 25
  `;
  const countSql = `SELECT COUNT(DISTINCT display_name) AS n FROM leaderboard_entries WHERE ${where.join(' AND ')}`;

  try {
    const [{ results }, countRes] = await Promise.all([
      context.env.DB.prepare(sql).bind(...params).all(),
      context.env.DB.prepare(countSql).bind(...params).all()
    ]);
    return json({ rankBy, players: countRes.results?.[0]?.n ?? results.length, entries: results });
  } catch (err) {
    console.error('D1 GET Error:', err.message);
    return json({ error: 'Database error' }, 500);
  }
}

// POST body: { game, event, level?, variant?, tags?, display_name, class_period, teacher, score, duration_ms }
// (or the old { challenge_id, ... }, which is parsed into game + event)
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { display_name, class_period, teacher, score, duration_ms } = body;

    let game = body.game;
    let event = body.event;
    if (!game && body.challenge_id) ({ game, event } = parseChallengeId(body.challenge_id));
    game = String(game || '').trim().toLowerCase();

    if (
      !/^[a-z0-9-]{1,60}$/.test(game) ||
      !isEventId(String(event)) ||
      typeof score !== 'number' || !Number.isFinite(score) ||
      typeof duration_ms !== 'number' || !Number.isFinite(duration_ms)
    ) {
      return json({ error: 'Invalid payload' }, 400);
    }

    const level = normalizeLevel(game, body.level);
    const variant = normalizeVariant(game, body.variant);
    const tags = normalizeTags(body.tags);

    // PRIVACY: students never type a name. display_name must be an alias produced by
    // src/lib/pseudonym.ts, and teacher must come from src/lib/teachers.ts, so free text cannot
    // reach the database even from a hand-built request. Request headers (CF-Connecting-IP,
    // X-Forwarded-For, User-Agent) are deliberately never read or stored here.
    const cleanDisplay = String(display_name || '').trim();
    const cleanPeriod = String(class_period || '').trim().toUpperCase();
    const cleanTeacher = String(teacher || '').trim().toUpperCase();

    if (!/^[A-Za-z0-9]{3,16}$/.test(cleanDisplay) || !isValidAlias(cleanDisplay)) {
      return json({ error: 'Invalid player alias.', code: 'alias_rejected' }, 400);
    }
    if (!isKnownTeacher(cleanTeacher)) {
      return json({ error: 'Unknown teacher.' }, 400);
    }
    if (!/^P[0-9]$/.test(cleanPeriod)) {
      return json({ error: 'Invalid class period.' }, 400);
    }

    // Defensive layer: the alias is built from curated words, but the random tail is still
    // screened (the client rerolls automatically on this code).
    if (await isProfane(cleanDisplay, context.env.PROFANITY_BLOCKLIST)) {
      return json({ error: 'Alias not accepted.', code: 'alias_rejected' }, 400);
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const schoolYear = month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

    const insertSql = `
      INSERT INTO leaderboard_entries
        (game, event, level, variant, tags, display_name, class_period, teacher, school_year, score, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(game, event, level, variant, display_name)
    `;

    // Score events keep a player's best score in a stratum (fastest time breaks ties).
    const scoreRankedUpsert = `
      DO UPDATE SET
        score = MAX(leaderboard_entries.score, excluded.score),
        duration_ms = CASE
          WHEN excluded.score > leaderboard_entries.score THEN excluded.duration_ms
          WHEN excluded.score = leaderboard_entries.score THEN MIN(leaderboard_entries.duration_ms, excluded.duration_ms)
          ELSE leaderboard_entries.duration_ms
        END,
        tags = CASE
          WHEN excluded.score > leaderboard_entries.score THEN excluded.tags
          ELSE leaderboard_entries.tags
        END,
        class_period = excluded.class_period,
        teacher = excluded.teacher,
        created_at = CASE
          WHEN excluded.score > leaderboard_entries.score THEN datetime('now')
          ELSE leaderboard_entries.created_at
        END
    `;

    // Time events keep a player's fastest time in a stratum (higher score breaks ties).
    const timeRankedUpsert = `
      DO UPDATE SET
        duration_ms = MIN(leaderboard_entries.duration_ms, excluded.duration_ms),
        score = CASE
          WHEN excluded.duration_ms < leaderboard_entries.duration_ms THEN excluded.score
          WHEN excluded.duration_ms = leaderboard_entries.duration_ms THEN MAX(leaderboard_entries.score, excluded.score)
          ELSE leaderboard_entries.score
        END,
        tags = CASE
          WHEN excluded.duration_ms < leaderboard_entries.duration_ms THEN excluded.tags
          ELSE leaderboard_entries.tags
        END,
        class_period = excluded.class_period,
        teacher = excluded.teacher,
        created_at = CASE
          WHEN excluded.duration_ms < leaderboard_entries.duration_ms THEN datetime('now')
          ELSE leaderboard_entries.created_at
        END
    `;

    await context.env.DB.prepare(
      insertSql + (EVENTS[event].rankBy === 'time' ? timeRankedUpsert : scoreRankedUpsert)
    ).bind(
      game, event, level, variant, tags,
      cleanDisplay, cleanPeriod, cleanTeacher, schoolYear,
      Math.round(score), Math.round(duration_ms)
    ).run();

    return json({ success: true, schoolYear, game, event }, 201);
  } catch (err) {
    console.error('D1 POST Error:', err.message);
    return json({ error: 'Failed to record entry' }, 500);
  }
}