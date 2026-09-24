import { useCallback, useEffect, useState } from 'react';
import { ListPager } from './ListPager';
import { formatWhen } from '../lib/format';
import {
  audienceLabel,
  CAMPAIGN_RECIPIENTS_PAGE_SIZE,
  campaignStatusLabel,
  listCampaignRecipientsPage,
  type CampaignRecipientRow,
  type PushCampaign,
} from '../lib/notifications';
import { roleLabel } from '../lib/users';

function recipientLabel(row: CampaignRecipientRow): string {
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (row.email) return row.email;
  if (row.recipientPhone) return row.recipientPhone;
  return 'Destinataire';
}

interface CampaignRecipientsDialogProps {
  campaign: PushCampaign;
  onClose: () => void;
}

export function CampaignRecipientsDialog({ campaign, onClose }: CampaignRecipientsDialogProps) {
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CampaignRecipientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCampaignRecipientsPage(campaign.id, page, CAMPAIGN_RECIPIENTS_PAGE_SIZE);
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [campaign.id, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [campaign.id]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="card modal notifications-recipients-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="page-header" style={{ marginBottom: 12 }}>
          <div>
            <p className="brand-kicker">Destinataires</p>
            <h2>{campaign.title}</h2>
            <p className="meta">
              {audienceLabel(campaign.audience)} · {campaignStatusLabel(campaign.status)} ·{' '}
              {campaign.recipientCount} enregistré(s) · {total} ligne(s) inbox
            </p>
          </div>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Fermer
          </button>
        </header>

        {error ? <p className="error-text">{error}</p> : null}
        {loading ? <p className="muted">Chargement…</p> : null}

        {!loading && total === 0 ? (
          <p className="muted">
            {campaign.status === 'scheduled' || campaign.status === 'draft'
              ? 'Aucun destinataire — campagne pas encore envoyée.'
              : 'Aucune notification inbox liée à cette campagne.'}
          </p>
        ) : null}

        {total > 0 ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nom / contact</th>
                    <th>Rôle</th>
                    <th>E-mail</th>
                    <th>Envoyée</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={`${r.userId ?? r.recipientPhone ?? 'row'}-${idx}`}>
                      <td>
                        <strong>{recipientLabel(r)}</strong>
                        {r.recipientPhone && r.email ? (
                          <div className="meta">Tél. {r.recipientPhone}</div>
                        ) : null}
                      </td>
                      <td className="meta">{r.userRole ? roleLabel(r.userRole) : '—'}</td>
                      <td className="meta">{r.email ?? '—'}</td>
                      <td className="meta">{r.sentAt ? formatWhen(r.sentAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPager
              page={page}
              total={total}
              pageSize={CAMPAIGN_RECIPIENTS_PAGE_SIZE}
              onPageChange={setPage}
              label="destinataires"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
