// src/lib/playerStorage.ts
export interface PlayerProfile {
  tag: string;
  teacher: string;
  class_period: string;
}

const STORAGE_KEY = 'walkermath_player_profile';

export function getSavedProfile(): PlayerProfile {
  if (typeof window === 'undefined') return { tag: '', teacher: '', class_period: '' };
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : { tag: '', teacher: '', class_period: '' };
  } catch {
    return { tag: '', teacher: '', class_period: '' };
  }
}

export function saveProfile(profile: PlayerProfile) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}