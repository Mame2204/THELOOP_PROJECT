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

interface CampaignRecipientsPanelProps {
  campaign: PushCampaign;
  onClose: () => void;
}

export function CampaignRecipientsPanel({ campaign, onClose }: CampaignRecipientsPanelProps) {
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
    <aside className="card notifications-detail-panel">
      <header className="notifications-detail-header">
        <div>
          <p className="brand-kicker">Détails</p>
          <h3>{campaign.title}</h3>
          <p className="meta">
            {audienceLabel(campaign.audience)} · {campaignStatusLabel(campaign.status)}
          </p>
          <p className="meta">
            {campaign.recipientCount} dest. campagne · {total} ligne(s) inbox
          </p>
        </div>
        <button type="button" className="btn ghost small" onClick={onClose} aria-label="Fermer les détails">
          Fermer
        </button>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="muted">Chargement…</p> : null}

      {!loading && !error && total === 0 ? (
        <p className="muted">
          {campaign.status === 'scheduled' || campaign.status === 'draft'
            ? 'Aucun destinataire — campagne pas encore envoyée.'
            : campaign.recipientCount > 0
              ? 'Destinataires non listés (campagnes anciennes sans lien inbox). Les envois récents affichent la liste ici.'
              : 'Aucun destinataire pour cette campagne.'}
        </p>
      ) : null}

      {!loading && total > 0 ? (
        <>
          <div className="table-wrap">
            <table className="data-table notifications-recipients-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Rôle</th>
                  <th>Envoyée</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={`${r.userId ?? r.recipientPhone ?? 'row'}-${idx}`}>
                    <td>
                      <strong>{recipientLabel(r)}</strong>
                      {r.email ? <div className="meta">{r.email}</div> : null}
                      {r.recipientPhone && !r.email ? (
                        <div className="meta">Tél. {r.recipientPhone}</div>
                      ) : null}
                    </td>
                    <td className="meta">{r.userRole ? roleLabel(r.userRole) : '—'}</td>
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
    </aside>
  );
}
