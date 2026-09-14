const PROFILE_EXTRAS_KEY = 'loop_profile_extras';

export interface ProfileExtras {
  phone: string;
}

export function loadProfileExtras(userId: string): ProfileExtras {
  try {
    const raw = localStorage.getItem(`${PROFILE_EXTRAS_KEY}_${userId}`);
    if (!raw) return { phone: '' };
    return JSON.parse(raw) as ProfileExtras;
  } catch {
    return { phone: '' };
  }
}

export function saveProfileExtras(userId: string, extras: ProfileExtras): void {
  localStorage.setItem(`${PROFILE_EXTRAS_KEY}_${userId}`, JSON.stringify(extras));
}
