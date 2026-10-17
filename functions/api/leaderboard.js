// functions/api/leaderboard.js

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
  
  const normalized = normalizeText(text).toLowerCase();
  const qToGVariant = normalized.replace(/q/g, 'g');

  // Explicitly catch common custom spellings that bypass standard blocklists
  const explicitVariations = ['niqr', 'niqq', 'nigq', 'nigr', 'nigg', 'niqg', 'niqe', 'nikkr', 'kkk', 'nikker', 'nicker', 'nicr', 'niccr','nicccr', 'nikr', 'nickr', 'nikcr', 'nikccr', 'nikkcr', 'nikckr', 'nickkr', 'nicckr', 'nickcr'];
  
  if (explicitVariations.some(term => normalized.includes(term) || qToGVariant.includes(term))) {
    return true;
  }

  // Fallback to checking the standard blocklist
  const list = await getBlocklist(secretList);
  return list.some(word => word.length > 0 && (normalized.includes(word) || qToGVariant.includes(word)));
}

export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const challengeId = searchParams.get('challenge_id');
  const listChallenges = searchParams.get('list') === 'true';

  if (listChallenges) {
    try {
      const { results } = await context.env.DB.prepare(`
        SELECT DISTINCT challenge_id FROM leaderboard_entries ORDER BY challenge_id ASC
      `).all();
      return new Response(JSON.stringify(results.map(r => r.challenge_id)), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
    }
  }
  
  if (!challengeId) {
    return new Response(JSON.stringify({ error: 'Missing challenge_id' }), { status: 400 });
  }

  let query = `
    SELECT display_name, class_period, teacher, school_year, score, duration_ms, created_at
    FROM leaderboard_entries
    WHERE challenge_id = ?
  `;
  const params = [challengeId];

  const teacher = searchParams.get('teacher');
  if (teacher && teacher !== 'ALL') {
    query += ` AND UPPER(teacher) = ?`;
    params.push(teacher.toUpperCase());
  }

  const classPeriod = searchParams.get('class_period');
  if (classPeriod && classPeriod !== 'ALL') {
    query += ` AND UPPER(class_period) = ?`;
    params.push(classPeriod.toUpperCase());
  }
  
  const timeframe = searchParams.get('timeframe') || 'all';
  if (timeframe === 'daily') {
    query += ` AND created_at >= datetime('now', '-1 day')`;
  } else if (timeframe === 'weekly') {
    query += ` AND created_at >= datetime('now', '-7 days')`;
  }

  query += ` ORDER BY score DESC, duration_ms ASC LIMIT 25`;

  try {
    const { results } = await context.env.DB.prepare(query).bind(...params).all();
    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { challenge_id, display_name, class_period, teacher, score, duration_ms } = body;

    if (!challenge_id || typeof score !== 'number' || typeof duration_ms !== 'number') {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
    }

    const cleanDisplay = (display_name || 'ANON').trim().toUpperCase().slice(0, 6);
    const cleanPeriod = (class_period || '').trim().toUpperCase();
    const cleanTeacher = (teacher || 'GENERA').trim().toUpperCase().slice(0, 6);

    if (!/^[A-Z]{1,6}$/.test(cleanDisplay)) {
      return new Response(JSON.stringify({ error: 'Display name must be 1-6 letters (A-Z only).' }), { status: 400 });
    }
    if (!/^[A-Z]{1,6}$/.test(cleanTeacher)) {
      return new Response(JSON.stringify({ error: 'Teacher name must be 1-6 letters (A-Z only).' }), { status: 400 });
    }
    if (!/^P[0-9]$/.test(cleanPeriod)) {
      return new Response(JSON.stringify({ error: 'Invalid class period.' }), { status: 400 });
    }

    // Server-side multi-language profanity check across text fields
    const blocklistSecret = context.env.PROFANITY_BLOCKLIST;
    if (
      (await isProfane(cleanDisplay, blocklistSecret)) ||
      (await isProfane(cleanTeacher, blocklistSecret))
    ) {
      return new Response(JSON.stringify({ error: 'Inappropriate language detected in submission.' }), { status: 400 });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const schoolYear = month >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;

    await context.env.DB.prepare(`
      INSERT INTO leaderboard_entries (challenge_id, display_name, class_period, teacher, school_year, score, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(challenge_id, display_name) 
      DO UPDATE SET 
        score = MAX(leaderboard_entries.score, excluded.score),
        duration_ms = CASE 
          WHEN excluded.score > leaderboard_entries.score THEN excluded.duration_ms
          WHEN excluded.score = leaderboard_entries.score THEN MIN(leaderboard_entries.duration_ms, excluded.duration_ms)
          ELSE leaderboard_entries.duration_ms 
        END,
        class_period = excluded.class_period,
        teacher = excluded.teacher,
        created_at = CASE 
          WHEN excluded.score > leaderboard_entries.score THEN datetime('now') 
          ELSE leaderboard_entries.created_at 
        END
    `).bind(
      challenge_id, 
      cleanDisplay, 
      cleanPeriod, 
      cleanTeacher, 
      schoolYear, 
      score, 
      duration_ms
    ).run();

    return new Response(JSON.stringify({ success: true, schoolYear }), { status: 201 });
  } catch (err) {
    console.error("D1 POST Error:", err.message);
    return new Response(JSON.stringify({ error: 'Failed to record entry' }), { status: 500 });
  }
}