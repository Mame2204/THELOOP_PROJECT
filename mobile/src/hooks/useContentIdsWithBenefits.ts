import { useCallback, useEffect, useState } from 'react';
import { useAppGates } from '@/context/AppGatesContext';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  contentHasLinkedActiveBenefit,
  listContentIdsWithBenefits,
  type ContentBenefitContentType,
} from '@/lib/content-benefits-index';
import { subscribeHomeRefresh } from '@/lib/home-refresh';
import { isPrivilegesUiEnabled } from '@/lib/pass-purchase-ui';

/** IDs de contenus liés à au moins un privilège catalogue actif (cache + refresh au focus). */
export function useContentIdsWithBenefits(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { gates } = useAppGates();
  const privilegesVisible = isPrivilegesUiEnabled(gates);
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
    if (!enabled || !privilegesVisible) {
      setIds(new Set());
      return;
    }
    void run(true);
  }, [enabled, privilegesVisible, run]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeHomeRefresh((reason) => {
      if (reason === 'benefit-catalog' || reason === 'benefit-grants' || reason.startsWith('admin-')) {
        void run(true);
      }
    });
  }, [enabled, run]);

  const hasBenefit = useCallback(
    (contentId: string, contentType?: ContentBenefitContentType) => {
      if (!privilegesVisible) return false;
      return contentHasLinkedActiveBenefit(ids, contentId, contentType);
    },
    [ids, privilegesVisible],
  );

  return { benefitContentIds: ids, hasBenefit, refreshBenefitIds: run };
}
