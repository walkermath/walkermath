// src/lib/playerStorage.ts
// Remembers the non-identifying class selections on this device. There is no name field any
// more: the player's alias lives in src/lib/pseudonym.ts.
export interface PlayerProfile {
  teacher: string;
  class_period: string;
}

const STORAGE_KEY = 'walkermath_player_profile';
const EMPTY: PlayerProfile = { teacher: '', class_period: '' };

export function getSavedProfile(): PlayerProfile {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return { ...EMPTY };
    const p = JSON.parse(data);
    // rewriting without `tag` also wipes initials/names typed under the old system
    return { teacher: String(p.teacher || ''), class_period: String(p.class_period || '') };
  } catch {
    return { ...EMPTY };
  }
}

export function saveProfile(profile: PlayerProfile) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ teacher: profile.teacher, class_period: profile.class_period })
    );
  } catch {}
}