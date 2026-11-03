// functions/api/leaderboard.js
import {
  EVENTS,
  GAMES,
  isEventId,
  normalizeLevel,
  normalizeVariant,
  parseChallengeId,
  raceWeight
} from '../../src/lib/coliseumBoards.ts';

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

// POST: closed. Scores post only through a student's class sign-in (functions/api/class/score.js),
// under the leaderboard name the server hands out, so no two players can share a name and no
// device can invent one. Rows already on the board stay.
export async function onRequestPost() {
  return json({ error: 'Sign in to your class to post scores.', code: 'sign_in' }, 403);
}
