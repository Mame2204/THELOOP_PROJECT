import { useState } from 'react';
import type { PartnerActivityType } from '@/types/partner';
import { PARTNER_ACTIVITY_LABELS } from '@/types/partner';
import { formatDateFr, parseFrenchDateInput } from '@/lib/date-utils';
import { generatePartnerTokenCode, getPrimeActivationUrl, getPrimeQrCodeUrl, useAdminData } from '@/hooks/useAdminData';

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  revoked: 'bg-neutral-100 text-neutral-600',
} as const;

export function AdminTokensPage() {
  const { store, generateToken, createPartnerDirect, createPrimeInvite, extendPrimeMonths, setPrimeExpiration, suspendPrime, reactivatePrime, updatePrime } = useAdminData();
  const [showGenerate, setShowGenerate] = useState(false);
  const [showDirect, setShowDirect] = useState(false);
  const [vipName, setVipName] = useState('');
  const [vipInitialMonths, setVipInitialMonths] = useState('1');
  const [editingVipId, setEditingVipId] = useState<string | null>(null);
  const [editingVipName, setEditingVipName] = useState('');
  const [editingExpId, setEditingExpId] = useState<string | null>(null);
  const [editingExpDisplay, setEditingExpDisplay] = useState('');
  const [createdVip, setCreatedVip] = useState<{ code: string; qr: string; link: string } | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [expiresAt, setExpiresAt] = useState('2026-12-31');
  const [expiresAtDisplay, setExpiresAtDisplay] = useState(formatDateFr('2026-12-31'));
  const [dateError, setDateError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [directForm, setDirectForm] = useState({
    contactName: '',
    companyName: '',
    email: '',
    phone: '',
    activityType: 'restaurant' as PartnerActivityType,
  });

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setDateError(null);
    const parsed = parseFrenchDateInput(expiresAtDisplay) ?? expiresAt;
    if (!parsed) {
      setDateError('Date invalide. Utilisez le format jj/mm/aaaa.');
      return;
    }
    const token = generateToken(partnerName, new Date(`${parsed}T23:59:59`).toISOString());
    setCreatedCode(token.tokenCode);
    setPartnerName('');
    setShowGenerate(false);
  }

  function handleDirectCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = createPartnerDirect(directForm);
    setCreatedCode(token.tokenCode);
    setDirectForm({ contactName: '', companyName: '', email: '', phone: '', activityType: 'restaurant' });
    setShowDirect(false);
  }

  function handleDateDisplayChange(value: string) {
    setExpiresAtDisplay(value);
    const parsed = parseFrenchDateInput(value);
    if (parsed) {
      setExpiresAt(parsed);
      setDateError(null);
    }
  }

  return (
    <div className="px-4 py-6 lg:px-8">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-loop-gold">Accès Pro</p>
        <h1 className="mt-1 text-2xl font-bold text-loop-black">Gestion des Accès</h1>
      </header>

      {createdCode && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Code généré : <strong className="font-mono">{createdCode}</strong>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowGenerate(true)} className="rounded-xl bg-loop-black px-4 py-2.5 text-xs font-bold text-white">
          + Générer un nouveau code
        </button>
        <button type="button" onClick={() => setShowDirect(true)} className="rounded-xl border border-loop-black px-4 py-2.5 text-xs font-bold text-loop-black">
          + Créer un Partenaire en direct
        </button>
      </div>

      {showGenerate && (
        <form onSubmit={handleGenerate} className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold">Générer un code</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              placeholder="Nom du partenaire"
              required
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black"
            />
            <label className="block">
              <input
                type="text"
                required
                inputMode="numeric"
                placeholder="jj/mm/aaaa"
                value={expiresAtDisplay}
                onChange={(e) => handleDateDisplayChange(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black"
              />
              <span className="mt-1 block text-[11px] text-neutral-500">
                Expiration : {formatDateFr(expiresAt)}
              </span>
            </label>
          </div>
          {dateError && <p className="mt-2 text-sm text-red-500">{dateError}</p>}
          <p className="mt-2 text-xs text-neutral-500">Code auto : {generatePartnerTokenCode()}</p>
          <button type="submit" className="mt-3 rounded-xl bg-loop-gold px-4 py-2 text-xs font-bold text-loop-black">
            Créer le jeton
          </button>
        </form>
      )}

      {showDirect && (
        <form onSubmit={handleDirectCreate} className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold">Création directe partenaire</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input placeholder="Responsable" required value={directForm.contactName} onChange={(e) => setDirectForm({ ...directForm, contactName: e.target.value })} className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black" />
            <input placeholder="Entreprise" required value={directForm.companyName} onChange={(e) => setDirectForm({ ...directForm, companyName: e.target.value })} className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black" />
            <input type="email" placeholder="Email pro" required value={directForm.email} onChange={(e) => setDirectForm({ ...directForm, email: e.target.value })} className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black" />
            <input placeholder="Téléphone" required value={directForm.phone} onChange={(e) => setDirectForm({ ...directForm, phone: e.target.value })} className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black" />
            <select value={directForm.activityType} onChange={(e) => setDirectForm({ ...directForm, activityType: e.target.value as PartnerActivityType })} className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black sm:col-span-2">
              {(Object.keys(PARTNER_ACTIVITY_LABELS) as PartnerActivityType[]).map((key) => (
                <option key={key} value={key}>{PARTNER_ACTIVITY_LABELS[key]}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="mt-3 rounded-xl bg-loop-black px-4 py-2.5 text-xs font-bold text-white">
            Créer profil + code ACTIF
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-3">Partenaire</th>
                <th className="px-5 py-3">Code / Token</th>
                <th className="px-5 py-3">Expiration</th>
                <th className="px-5 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {store.partnerTokens.map((tok) => (
                <tr key={tok.id} className="border-t border-neutral-100">
                  <td className="px-5 py-3 font-medium text-loop-black">{tok.partnerName}</td>
                  <td className="px-5 py-3 font-mono text-xs text-loop-gold">{tok.tokenCode}</td>
                  <td className="px-5 py-3 text-neutral-600">{formatDateFr(tok.expiresAt)}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[tok.status]}`}>
                      {tok.status === 'active' ? 'ACTIF' : tok.status === 'expired' ? 'EXPIRÉ' : 'RÉVOQUÉ'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-bold text-loop-black">Loop Prime · Invitations</h2>
        <p className="mt-1 text-sm text-neutral-600">Tokens d&apos;activation carte physique · QR Code · lien WhatsApp</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            placeholder="Nom du membre invité"
            value={vipName}
            onChange={(e) => setVipName(e.target.value)}
            className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <span className="text-xs">Durée initiale</span>
            <input
              type="number"
              min={1}
              max={24}
              value={vipInitialMonths}
              onChange={(e) => setVipInitialMonths(e.target.value)}
              className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
            />
            <span className="text-xs">mois</span>
          </label>
          <button
            type="button"
            onClick={() => {
              if (!vipName.trim()) return;
              const months = Math.max(1, parseInt(vipInitialMonths, 10) || 1);
              const inv = createPrimeInvite(vipName.trim(), null, months);
              const link = getPrimeActivationUrl(inv.tokenCode);
              setCreatedVip({ code: inv.tokenCode, qr: getPrimeQrCodeUrl(inv.tokenCode), link });
              setVipName('');
            }}
            className="rounded-xl bg-loop-black px-4 py-2.5 text-xs font-bold text-white"
          >
            + Générer une invitation Loop Prime
          </button>
        </div>
        {createdVip && (
          <div className="mt-4 grid gap-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:grid-cols-[120px_1fr]">
            <img src={createdVip.qr} alt="QR Code" className="mx-auto h-28 w-28 rounded-lg border border-neutral-200" />
            <div>
              <p className="font-mono text-sm text-loop-gold">{createdVip.code}</p>
              <p className="mt-2 break-all text-xs text-neutral-600">{createdVip.link}</p>
              <button type="button" onClick={() => navigator.clipboard.writeText(createdVip.link)} className="mt-2 text-xs font-bold text-loop-black underline">
                Copier le lien WhatsApp
              </button>
            </div>
          </div>
        )}
        <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-3">Membre</th>
                <th className="px-5 py-3">Token</th>
                <th className="px-5 py-3">Statut abonnement</th>
                <th className="px-5 py-3">Expiration</th>
                <th className="px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {store.primeInvitations.map((inv) => (
                <tr key={inv.id} className="border-t border-neutral-100">
                  <td className="px-5 py-3">
                    {editingVipId === inv.id ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!editingVipName.trim()) return;
                          updatePrime(inv.id, editingVipName.trim());
                          setEditingVipId(null);
                        }}
                      >
                        <input
                          value={editingVipName}
                          onChange={(e) => setEditingVipName(e.target.value)}
                          className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                        />
                        <button type="submit" className="text-xs font-bold text-green-700">OK</button>
                        <button type="button" onClick={() => setEditingVipId(null)} className="text-xs text-neutral-500">Annuler</button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>{inv.memberName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingVipId(inv.id);
                            setEditingVipName(inv.memberName);
                          }}
                          className="text-[10px] font-bold uppercase text-neutral-400 hover:text-loop-black"
                        >
                          Modifier
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-loop-gold">{inv.tokenCode}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      inv.subscriptionStatus === 'active'
                        ? 'bg-green-100 text-green-700'
                        : inv.subscriptionStatus === 'suspended'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-neutral-100 text-neutral-600'
                    }`}>
                      {inv.subscriptionStatus === 'active' ? 'Active' : inv.subscriptionStatus === 'suspended' ? 'Suspendue' : inv.subscriptionStatus}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {editingExpId === inv.id ? (
                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const parsed = parseFrenchDateInput(editingExpDisplay);
                          if (!parsed) return;
                          setPrimeExpiration(inv.id, new Date(`${parsed}T23:59:59`).toISOString());
                          setEditingExpId(null);
                        }}
                      >
                        <input
                          value={editingExpDisplay}
                          onChange={(e) => setEditingExpDisplay(e.target.value)}
                          placeholder="jj/mm/aaaa"
                          className="w-28 rounded-lg border border-neutral-300 px-2 py-1 text-xs"
                        />
                        <button type="submit" className="text-xs font-bold text-green-700">OK</button>
                        <button type="button" onClick={() => setEditingExpId(null)} className="text-xs text-neutral-500">Annuler</button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>{inv.subscriptionExpiresAt ? formatDateFr(inv.subscriptionExpiresAt) : '—'}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingExpId(inv.id);
                            setEditingExpDisplay(
                              inv.subscriptionExpiresAt ? formatDateFr(inv.subscriptionExpiresAt) : formatDateFr(new Date()),
                            );
                          }}
                          className="text-[10px] font-bold uppercase text-neutral-400 hover:text-loop-black"
                        >
                          Modifier
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => extendPrimeMonths(inv.id, 1)} className="text-xs font-bold text-green-700">+1 mois</button>
                      <button type="button" onClick={() => extendPrimeMonths(inv.id, 3)} className="text-xs font-bold text-green-700">+3 mois</button>
                      {inv.subscriptionStatus === 'suspended' ? (
                        <button type="button" onClick={() => reactivatePrime(inv.id)} className="text-xs font-bold text-loop-gold">Réactiver</button>
                      ) : (
                        <button type="button" onClick={() => suspendPrime(inv.id)} className="text-xs font-bold text-red-600">Suspendre</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
