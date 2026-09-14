import type { HomeLocation } from '@/lib/demo-data';
import { isEventPast } from '@/lib/event-list-utils';
import type { LoopWalk, LoopWalkStep } from '@/lib/loop-walks-store';
import { findWalkEvent, findWalkSpot, normalizeWalkStepRef, type WalkStepRef } from '@/lib/walk-step-resolve';
import type { Event } from '@/types';

function isSpotPublished(spot: HomeLocation): boolean {
  if (spot.hidden === true) return false;
  if (spot.isActive === false) return false;
  if ((spot.contentStatus ?? 'published') !== 'published') return false;
  return true;
}

function isEventPublished(event: Event): boolean {
  if (event.isActive === false) return false;
  if ((event.contentStatus ?? 'published') !== 'published') return false;
  if (event.status && event.status !== 'published') return false;
  return !isEventPast(event);
}

/** Étape valide = contenu publié, présent et non expiré. */
export function isWalkStepValid(
  step: WalkStepRef | LoopWalkStep,
  events: Event[],
  spots: HomeLocation[],
): boolean {
  const ref = normalizeWalkStepRef(step);
  if (ref.targetType === 'event') {
    const event = findWalkEvent(ref, events);
    if (!event) return false;
    return isEventPublished(event);
  }

  const pool =
    ref.targetType === 'tool'
      ? spots.filter((l) => l.subCategory === 'tools')
      : spots.filter((l) => l.subCategory !== 'tools');
  const spot = findWalkSpot(ref, pool.length ? pool : spots);
  if (!spot) return false;
  return isSpotPublished(spot);
}

/** Parcours listable : publié + au moins une étape (ne masque plus tout le bloc Accueil si un event est passé). */
export function isWalkPubliclyVisible(
  walk: LoopWalk,
  _events: Event[],
  _spots: HomeLocation[],
): boolean {
  if (!walk.isPublished) return false;
  if (walk.steps.length === 0) return false;
  return true;
}

export function filterValidWalkSteps(
  walk: LoopWalk,
  events: Event[],
  spots: HomeLocation[],
): LoopWalkStep[] {
  return walk.steps.filter((step) => isWalkStepValid(step, events, spots));
}

export function filterPublicWalks(
  walks: LoopWalk[],
  events: Event[],
  spots: HomeLocation[],
): LoopWalk[] {
  return walks.filter((walk) => isWalkPubliclyVisible(walk, events, spots));
}
