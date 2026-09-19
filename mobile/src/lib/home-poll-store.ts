import AsyncStorage from '@react-native-async-storage/async-storage';
import { pickCurrentAccueilItem } from '@/lib/accueil-scheduling';
import { asArray, hydrateScoped, invalidateScope, peekScoped, scheduleScopedRefresh, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const LEGACY_DEVICE_KEY = 'loop_poll_device_id';
const PHONE_ID_KEY = 'loop_poll_phone_id';
const DEMO_POLL_KEY = 'loop_home_poll_demo';
const DEMO_VOTES_KEY = 'loop_home_poll_votes_demo';
const DEMO_POLL_ID = 'demo-home-poll-week';
const POLL_SNAPSHOT_CACHE = 'loop_home_poll_snapshot_v1';

export interface HomePollOption {
  id: string;
  label: string;
}

export interface HomePoll {
  id: string;
  question: string;
  options: HomePollOption[];
  weekKey: string;
}

export interface HomePollSnapshot {
  poll: HomePoll;
  counts: Record<string, number>;
  total: number;
  userOptionId: string | null;
}

export interface HomePollVoter {
  userId: string | null;
  /** Id téléphone local persisté (anonyme sans compte). */
  phoneId?: string | null;
  /** Numéro profil connecté — informatif uniquement. */
  profilePhone?: string | null;
}

type StoredVote = {
  optionId: string;
  userId?: string;
  phone?: string;
};

function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Identifiant stable de cet appareil (id « téléphone » pour votes anonymes). */
export async function getPollPhoneId(): Promise<string> {
  const existing = await AsyncStorage.getItem(PHONE_ID_KEY);
  if (existing) return existing;

  const legacy = await AsyncStorage.getItem(LEGACY_DEVICE_KEY);
  if (legacy) {
    await AsyncStorage.setItem(PHONE_ID_KEY, legacy);
    return legacy;
  }

  const id = `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(PHONE_ID_KEY, id);
  return id;
}

/** @deprecated Utiliser getPollPhoneId */
export async function getPollDeviceId(): Promise<string> {
  return getPollPhoneId();
}

function normalizeVoterPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

function isLoggedInVoter(voter: HomePollVoter): boolean {
  return Boolean(voter.userId && voter.userId !== 'anonymous');
}

/** Clé d'identification du votant : compte connecté, sinon id téléphone local. */
function voterKeyFor(voter: HomePollVoter): string | null {
  if (isLoggedInVoter(voter)) return voter.userId;
  return voter.phoneId?.trim() || null;
}

/**
 * Compte connecté → vote du compte uniquement.
 * Sans connexion → vote lié à l'id téléphone local (voter_phone).
 */
function findMyOptionId(votes: StoredVote[], voter: HomePollVoter): string | null {
  if (isLoggedInVoter(voter)) {
    return votes.find((v) => v.userId === voter.userId)?.optionId ?? null;
  }

  const phoneId = voter.phoneId?.trim();
  if (phoneId) {
    const byPhone = votes.find((v) => v.phone === phoneId);
    if (byPhone) return byPhone.optionId;
  }

  return null;
}

function alreadyVoted(votes: StoredVote[], voter: HomePollVoter): boolean {
  return findMyOptionId(votes, voter) != null;
}

function demoPoll(): HomePoll {
  return {
    id: DEMO_POLL_ID,
    question: 'Ce week-end, tu vises quoi ?',
    options: [
      { id: 'terrace', label: 'Terrasse' },
      { id: 'live', label: 'Live' },
      { id: 'brunch', label: 'Brunch' },
      { id: 'chill', label: 'Chill' },
    ],
    weekKey: isoWeekKey(),
  };
}

function parseOptions(raw: unknown): HomePollOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id : null;
      const label = typeof row.label === 'string' ? row.label : null;
      if (!id || !label) return null;
      return { id, label };
    })
    .filter((o): o is HomePollOption => o !== null)
    .slice(0, 4);
}

async function loadDemoVotes(): Promise<Record<string, StoredVote[]>> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_VOTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredVote[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveDemoVotes(votes: Record<string, StoredVote[]>): Promise<void> {
  await AsyncStorage.setItem(DEMO_VOTES_KEY, JSON.stringify(votes));
}

async function ensureDemoPoll(): Promise<HomePoll> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_POLL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HomePoll;
      if (parsed?.id && parsed.question && Array.isArray(parsed.options) && parsed.options.length >= 2) {
        if (parsed.weekKey === isoWeekKey()) return parsed;
      }
    }
  } catch {
    /* seed */
  }
  const poll = demoPoll();
  await AsyncStorage.setItem(DEMO_POLL_KEY, JSON.stringify(poll));
  return poll;
}

function talliesFromVotes(
  options: HomePollOption[],
  votes: { optionId: string }[],
): { counts: Record<string, number>; total: number } {
  const counts: Record<string, number> = {};
  for (const opt of options) counts[opt.id] = 0;
  for (const v of votes) {
    if (counts[v.optionId] !== undefined) counts[v.optionId] += 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}

async function loadDemoSnapshot(voter: HomePollVoter): Promise<HomePollSnapshot> {
  const poll = await ensureDemoPoll();
  const resolvedVoter = isLoggedInVoter(voter)
    ? voter
    : { ...voter, phoneId: voter.phoneId ?? (await getPollPhoneId()) };
  const all = await loadDemoVotes();
  const votes = all[poll.id] ?? [];
  const { counts, total } = talliesFromVotes(poll.options, votes);
  const mine = findMyOptionId(votes, resolvedVoter);
  return { poll, counts, total, userOptionId: mine };
}

interface CachedPollBundle {
  poll: HomePoll;
  counts: Record<string, number>;
  total: number;
  userOptionId: string | null;
  voterKey: string | null;
}

function pollScope(countryCode?: string): string {
  return countryCode ?? 'GN';
}

function attachUserVote(bundle: CachedPollBundle, voter: HomePollVoter): HomePollSnapshot {
  const voterKey = voterKeyFor(voter);
  const mine = voterKey !== null && voterKey === bundle.voterKey ? bundle.userOptionId : null;
  const options = asArray<HomePollOption>(bundle.poll?.options);
  const poll: HomePoll = {
    id: String(bundle.poll?.id ?? ''),
    question: String(bundle.poll?.question ?? ''),
    options,
    weekKey: String(bundle.poll?.weekKey ?? ''),
  };
  return {
    poll,
    counts: bundle.counts ?? {},
    total: bundle.total ?? 0,
    userOptionId: mine,
  };
}

function normalizePollBundle(raw: unknown): CachedPollBundle | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<CachedPollBundle>;
  const options = asArray<HomePollOption>(row.poll?.options).filter((o) => o.id && o.label);
  if (!row.poll?.id || options.length < 2) return null;
  return {
    poll: {
      id: String(row.poll.id),
      question: String(row.poll.question ?? ''),
      options,
      weekKey: String(row.poll.weekKey ?? isoWeekKey()),
    },
    counts: row.counts && typeof row.counts === 'object' ? row.counts : {},
    total: Number(row.total ?? 0),
    userOptionId: typeof row.userOptionId === 'string' ? row.userOptionId : null,
    voterKey: typeof row.voterKey === 'string' ? row.voterKey : null,
  };
}

/** Snapshot sondage immédiat (sans vote utilisateur). */
export async function peekHomePollBundle(countryCode?: string): Promise<CachedPollBundle | null> {
  const scope = pollScope(countryCode);
  const hit = await peekScoped<CachedPollBundle>(scope, scopedStorageKey(POLL_SNAPSHOT_CACHE, scope));
  return normalizePollBundle(hit);
}

function parsePollResults(
  raw: unknown,
  options: HomePollOption[],
): { counts: Record<string, number>; total: number; userOptionId: string | null } {
  const counts: Record<string, number> = {};
  for (const opt of options) counts[opt.id] = 0;

  if (!raw || typeof raw !== 'object') {
    return { counts, total: 0, userOptionId: null };
  }

  const row = raw as Record<string, unknown>;
  if (row.counts && typeof row.counts === 'object') {
    for (const [optionId, value] of Object.entries(row.counts as Record<string, unknown>)) {
      if (counts[optionId] === undefined) continue;
      const count = Number(value);
      counts[optionId] = Number.isFinite(count) ? count : 0;
    }
  }

  const mine = typeof row.userOptionId === 'string' ? row.userOptionId : null;
  return {
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    userOptionId: mine !== null && counts[mine] !== undefined ? mine : null,
  };
}

async function loadRemoteBundle(
  voter: HomePollVoter,
  countryCode?: string,
): Promise<CachedPollBundle | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  if (!countryCode) return null;

  const { data: pollRows, error } = await supabase
    .from('home_polls')
    .select('id, question, options, week_key, country_code, period_start, period_end, created_at')
    .eq('country_code', countryCode)
    .eq('is_active', true)
    .order('period_start', { ascending: false })
    .limit(15);

  if (error) {
    console.warn('[HomePoll] lecture:', error.message);
    return null;
  }

  const picked = pickCurrentAccueilItem(
    (pollRows ?? []).map((row) => ({
      id: String(row.id),
      periodStart: row.period_start != null ? String(row.period_start) : null,
      periodEnd: row.period_end != null ? String(row.period_end) : null,
      isActive: true,
      createdAt: row.created_at != null ? String(row.created_at) : null,
    })),
  );
  const pollRow = picked?.id
    ? (pollRows ?? []).find((row) => String(row.id) === picked.id)
    : null;

  if (!pollRow) return null;

  const options = parseOptions(pollRow.options);
  if (options.length < 2) return null;

  const poll: HomePoll = {
    id: String(pollRow.id),
    question: String(pollRow.question),
    options,
    weekKey: String(pollRow.week_key ?? isoWeekKey()),
  };

  const { data: resultsData, error: resultsError } = await supabase.rpc('get_home_poll_results', {
    p_poll_id: poll.id,
    p_phone_id: isLoggedInVoter(voter) ? null : (voter.phoneId?.trim() || null),
  });

  if (resultsError) {
    console.warn('[HomePoll] résultats:', resultsError.message);
  }

  const { counts, total, userOptionId } = parsePollResults(resultsError ? null : resultsData, options);

  return { poll, counts, total, userOptionId, voterKey: voterKeyFor(voter) };
}

async function loadRemoteSnapshot(
  voter: HomePollVoter,
  countryCode?: string,
): Promise<HomePollSnapshot | null> {
  const resolvedVoter = isLoggedInVoter(voter)
    ? voter
    : { ...voter, phoneId: voter.phoneId ?? (await getPollPhoneId()) };

  const bundle = await loadRemoteBundle(resolvedVoter, countryCode);
  if (!bundle) return null;

  const scope = pollScope(countryCode);
  await hydrateScoped(scope, scopedStorageKey(POLL_SNAPSHOT_CACHE, scope), bundle);
  return attachUserVote(bundle, resolvedVoter);
}

export async function loadHomePollSnapshot(
  voter: HomePollVoter,
  countryCode?: string,
): Promise<HomePollSnapshot | null> {
  const resolvedVoter = isLoggedInVoter(voter)
    ? voter
    : { ...voter, phoneId: voter.phoneId ?? (await getPollPhoneId()) };

  if (isSupabaseConfigured()) {
    const cached = await peekHomePollBundle(countryCode);
    if (cached) {
      scheduleScopedRefresh(
        `home_poll_${pollScope(countryCode)}`,
        () => loadRemoteBundle(resolvedVoter, countryCode),
        undefined,
        async (fresh) => {
          if (fresh === null) {
            invalidateScope(pollScope(countryCode), scopedStorageKey(POLL_SNAPSHOT_CACHE, pollScope(countryCode)));
            return;
          }
          await hydrateScoped(pollScope(countryCode), scopedStorageKey(POLL_SNAPSHOT_CACHE, pollScope(countryCode)), fresh);
        },
      );
      return attachUserVote(cached, resolvedVoter);
    }
    return loadRemoteSnapshot(resolvedVoter, countryCode);
  }
  if (countryCode && countryCode !== 'GN') return null;
  return loadDemoSnapshot(resolvedVoter);
}

/**
 * Rattache les votes anonymes (id téléphone local) au compte à la connexion.
 */
export async function claimHomePollVotesForAccount(userId: string): Promise<void> {
  if (!userId || userId === 'anonymous') return;
  const phoneId = await getPollPhoneId();

  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.rpc('claim_home_poll_votes', { p_phone_id: phoneId });
    if (error) {
      if (error.message.toLowerCase().includes('claim_home_poll')) {
        console.warn('[HomePoll] claim RPC absente — applique migration 20260836');
      } else {
        console.warn('[HomePoll] claim:', error.message);
      }
    }
  }

  const all = await loadDemoVotes();
  let changed = false;
  for (const pollId of Object.keys(all)) {
    const votes = all[pollId] ?? [];
    const hasUserVote = votes.some((v) => v.userId === userId);
    all[pollId] = votes
      .map((v) => {
        if (v.phone !== phoneId || v.userId) return v;
        if (hasUserVote) {
          changed = true;
          return null;
        }
        changed = true;
        return { ...v, userId };
      })
      .filter((v): v is StoredVote => v != null);
  }
  if (changed) await saveDemoVotes(all);
}

export async function voteHomePoll(
  pollId: string,
  optionId: string,
  voter: HomePollVoter,
  countryCode?: string,
): Promise<HomePollSnapshot> {
  const loggedIn = isLoggedInVoter(voter);
  const userId = loggedIn ? voter.userId : null;
  const phoneId = loggedIn ? null : (voter.phoneId ?? (await getPollPhoneId()));

  if (isSupabaseConfigured() && supabase && pollId !== DEMO_POLL_ID) {
    const payload: Record<string, string> = {
      poll_id: pollId,
      option_id: optionId,
    };

    if (loggedIn && userId) {
      payload.user_id = userId;
      const profilePhone = normalizeVoterPhone(voter.profilePhone);
      if (profilePhone) payload.voter_phone = profilePhone;
    } else if (phoneId) {
      payload.voter_phone = phoneId;
    }

    const { error } = await supabase.from('home_poll_votes').insert(payload);
    if (error && !error.message.toLowerCase().includes('duplicate') && error.code !== '23505') {
      console.warn('[HomePoll] vote:', error.message);
    }

    const snap = await loadRemoteSnapshot(loggedIn ? voter : { ...voter, phoneId }, countryCode);
    if (snap) return snap;
    return {
      poll: {
        id: pollId,
        question: '',
        options: [{ id: optionId, label: '' }],
        weekKey: '',
      },
      counts: { [optionId]: 1 },
      total: 1,
      userOptionId: optionId,
    };
  }

  const poll = await ensureDemoPoll();
  const all = await loadDemoVotes();
  const votes = all[poll.id] ?? [];
  const resolvedVoter = loggedIn ? voter : { ...voter, phoneId };
  if (!alreadyVoted(votes, resolvedVoter) && poll.id === pollId) {
    const entry: StoredVote = { optionId };
    if (loggedIn && userId) {
      entry.userId = userId;
    } else if (phoneId) {
      entry.phone = phoneId;
    }
    votes.push(entry);
    all[poll.id] = votes;
    await saveDemoVotes(all);
  }

  return loadDemoSnapshot(resolvedVoter);
}

const POLL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLL_VIEW_SESSION_KEY = 'loop_poll_viewed_session_v1';

/** Compte une impression sondage (1× par session appareil). */
export async function recordHomePollView(pollId: string): Promise<void> {
  if (!POLL_UUID_RE.test(pollId)) return;

  try {
    const raw = await AsyncStorage.getItem(POLL_VIEW_SESSION_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    if (seen.includes(pollId)) return;
    await AsyncStorage.setItem(POLL_VIEW_SESSION_KEY, JSON.stringify([...seen, pollId]));
  } catch {
    /* continue RPC */
  }

  if (!isSupabaseConfigured() || !supabase) return;

  const { error } = await supabase.rpc('increment_home_poll_view', { p_poll_id: pollId });
  if (error) {
    console.warn('[HomePoll] increment view:', error.message);
  }
}
