import { DEMO_EVENTS, DEMO_HOME_LOCATIONS, type HomeLocation } from '@/lib/demo-data';
import { normalizePartnerName } from '@/lib/partner-name-utils';
import type { Event } from '@/types';

export type WalkStepRef = {
  order: number;
  targetType: 'event' | 'spot' | 'tool';
  targetId: string;
  title?: string | null;
  description?: string | null;
};

function compactLabel(value: string): string {
  return normalizePartnerName(value).replace(/[^a-z0-9]/g, '');
}

export function labelsMatch(a: string, b: string): boolean {
  const ca = compactLabel(a);
  const cb = compactLabel(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  return ca.includes(cb) || cb.includes(ca);
}

function slugifyLabel(value: string): string {
  return normalizePartnerName(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Convertit loc-* / evt-* en slugs catalogue pour matcher le contenu live. */
export function normalizeWalkStepRef(step: WalkStepRef): WalkStepRef {
  if (step.targetType === 'spot' || step.targetType === 'tool') {
    const demo = DEMO_HOME_LOCATIONS.find(
      (l) => l.id === step.targetId || l.slug === step.targetId,
    );
    if (demo) {
      return {
        ...step,
        targetType: demo.subCategory === 'tools' ? 'tool' : step.targetType === 'tool' ? 'tool' : 'spot',
        targetId: demo.slug,
        title: step.title?.trim() || demo.name,
      };
    }
  } else {
    const demo = DEMO_EVENTS.find(
      (e) => e.id === step.targetId || e.slug === step.targetId,
    );
    if (demo) {
      return {
        ...step,
        targetId: demo.slug,
        title: step.title?.trim() || demo.title,
      };
    }
  }
  if (!step.targetId && step.title) {
    return { ...step, targetId: slugifyLabel(step.title) };
  }
  return step;
}

/** Relie les IDs démo (loc-*, evt-*) / slugs au catalogue live (UUID / slugs réels). */
export function findWalkEvent(
  step: WalkStepRef,
  events: Event[],
): Event | undefined {
  const ref = normalizeWalkStepRef(step);

  const byId =
    events.find((e) => e.id === ref.targetId) ??
    events.find((e) => e.slug === ref.targetId);
  if (byId) return byId;

  const demo = DEMO_EVENTS.find(
    (e) =>
      e.id === step.targetId ||
      e.slug === ref.targetId ||
      (ref.title ? labelsMatch(e.title, ref.title) : false),
  );
  if (demo) {
    const bridged =
      events.find((e) => e.id === demo.id) ??
      events.find((e) => e.slug === demo.slug) ??
      events.find((e) => labelsMatch(e.title, demo.title));
    if (bridged) return bridged;
  }

  if (ref.title) {
    const byTitle = events.find((e) => labelsMatch(e.title, ref.title!));
    if (byTitle) return byTitle;
    const wantSlug = slugifyLabel(ref.title);
    const bySlug = events.find((e) => e.slug === wantSlug || labelsMatch(e.slug, wantSlug));
    if (bySlug) return bySlug;
  }

  return undefined;
}

export function findWalkSpot(
  step: WalkStepRef,
  spots: HomeLocation[],
): HomeLocation | undefined {
  const ref = normalizeWalkStepRef(step);
  const pool =
    ref.targetType === 'tool'
      ? spots.filter((l) => l.subCategory === 'tools')
      : spots.filter((l) => l.subCategory !== 'tools');
  const searchIn = pool.length ? pool : spots;

  const byId =
    searchIn.find((l) => l.id === ref.targetId) ??
    searchIn.find((l) => l.slug === ref.targetId);
  if (byId) return byId;

  const demo = DEMO_HOME_LOCATIONS.find(
    (l) =>
      l.id === step.targetId ||
      l.slug === ref.targetId ||
      (ref.title ? labelsMatch(l.name, ref.title) : false),
  );
  if (demo) {
    const bridged =
      searchIn.find((l) => l.id === demo.id) ??
      searchIn.find((l) => l.slug === demo.slug) ??
      searchIn.find((l) => labelsMatch(l.name, demo.name));
    if (bridged) return bridged;
  }

  if (ref.title) {
    const byTitle = searchIn.find((l) => labelsMatch(l.name, ref.title!));
    if (byTitle) return byTitle;
    const wantSlug = slugifyLabel(ref.title);
    const bySlug = searchIn.find((l) => l.slug === wantSlug || labelsMatch(l.slug, wantSlug));
    if (bySlug) return bySlug;
  }

  return undefined;
}

/**
 * Si les étapes démo (loc-* / slugs) ne matchent pas le catalogue live,
 * on les rattache aux spots / events publiés pour que les clics ouvrent une fiche.
 */
export function ensureWalkStepsResolvable(
  walk: {
    steps: WalkStepRef[];
    stepsCount: number;
  },
  events: Event[],
  spots: HomeLocation[],
): WalkStepRef[] {
  const publicSpots = spots.filter((s) => s.subCategory !== 'tools' && s.visibility !== 'prime');
  const tools = spots.filter((s) => s.subCategory === 'tools');
  const catalog = publicSpots.length ? publicSpots : spots.filter((s) => s.subCategory !== 'tools');
  const normalized = walk.steps.map(normalizeWalkStepRef);

  const resolvedFlags = normalized.map((step) =>
    step.targetType === 'event'
      ? Boolean(findWalkEvent(step, events))
      : Boolean(findWalkSpot(step, step.targetType === 'tool' ? tools : catalog)),
  );

  const bindMatched = (step: WalkStepRef): WalkStepRef => {
    if (step.targetType === 'event') {
      const event = findWalkEvent(step, events);
      if (!event) return step;
      return { ...step, targetId: event.id, title: event.title };
    }
    const pool = step.targetType === 'tool' ? tools : catalog;
    const spot = findWalkSpot(step, pool);
    if (!spot) return step;
    return {
      ...step,
      targetType: spot.subCategory === 'tools' ? 'tool' : 'spot',
      targetId: spot.id,
      title: spot.name,
    };
  };

  const unresolvedCount = resolvedFlags.filter((ok) => !ok).length;
  if (unresolvedCount === 0) {
    return normalized.map(bindMatched);
  }

  if (unresolvedCount < normalized.length && unresolvedCount < 2) {
    return normalized.map((step, index) => (resolvedFlags[index] ? bindMatched(step) : step));
  }

  const poolSpots = [...catalog];
  const poolTools = [...tools];
  const poolEvents = [...events];
  let spotIdx = 0;
  let toolIdx = 0;
  let eventIdx = 0;

  return normalized.map((step, index) => {
    if (resolvedFlags[index]) return bindMatched(step);

    if (step.targetType === 'event' && poolEvents[eventIdx]) {
      const event = poolEvents[eventIdx];
      eventIdx += 1;
      return {
        ...step,
        targetId: event.id,
        title: event.title,
        description:
          step.description?.trim() ||
          event.venueName?.trim() ||
          event.venueAddress?.trim() ||
          null,
      };
    }

    if (step.targetType === 'tool' && poolTools[toolIdx]) {
      const tool = poolTools[toolIdx];
      toolIdx += 1;
      return {
        ...step,
        targetType: 'tool' as const,
        targetId: tool.id,
        title: tool.name,
        description: step.description?.trim() || tool.subtitle?.trim() || null,
      };
    }

    if (poolSpots[spotIdx]) {
      const spot = poolSpots[spotIdx];
      spotIdx += 1;
      return {
        ...step,
        targetType: 'spot' as const,
        targetId: spot.id,
        title: spot.name,
        description:
          step.description?.trim() ||
          spot.address?.trim() ||
          spot.subtitle?.trim() ||
          null,
      };
    }

    if (poolTools[toolIdx]) {
      const tool = poolTools[toolIdx];
      toolIdx += 1;
      return {
        ...step,
        targetType: 'tool' as const,
        targetId: tool.id,
        title: tool.name,
        description: step.description?.trim() || tool.subtitle?.trim() || null,
      };
    }

    if (poolEvents[eventIdx]) {
      const event = poolEvents[eventIdx];
      eventIdx += 1;
      return {
        ...step,
        targetType: 'event' as const,
        targetId: event.id,
        title: event.title,
        description: step.description?.trim() || event.venueName?.trim() || null,
      };
    }

    return step;
  });
}
