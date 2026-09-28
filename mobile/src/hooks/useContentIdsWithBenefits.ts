import { useCallback, useEffect, useState } from 'react';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  contentHasLinkedActiveBenefit,
  listContentIdsWithBenefits,
  type ContentBenefitContentType,
} from '@/lib/content-benefits-index';
import { subscribeHomeRefresh } from '@/lib/home-refresh';

/** IDs de contenus liés à au moins un privilège catalogue actif (cache + refresh au focus). */
export function useContentIdsWithBenefits(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  const loader = useCallback(async () => {
    const next = await listContentIdsWithBenefits();
    setIds(next instanceof Set ? next : new Set(next));
  }, []);

  const { run } = useFocusLoad(
    async () => {
      await loader();
    },
    { ttlMs: 60_000, enabled },
  );

  useEffect(() => {
    if (!enabled) return;
    return subscribeHomeRefresh((reason) => {
      if (reason === 'benefit-catalog' || reason === 'benefit-grants' || reason.startsWith('admin-')) {
        void run(true);
      }
    });
  }, [enabled, run]);

  const hasBenefit = useCallback(
    (contentId: string, contentType?: ContentBenefitContentType) =>
      contentHasLinkedActiveBenefit(ids, contentId, contentType),
    [ids],
  );

  return { benefitContentIds: ids, hasBenefit, refreshBenefitIds: run };
}
