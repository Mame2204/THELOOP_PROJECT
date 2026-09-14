import { useState } from 'react';
import type { UserRole } from '@/types';
import { useAdminData } from '@/hooks/useAdminData';

const ROLES: UserRole[] = ['USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'];

export function AdminUsersPage() {
  const { store, updateUser } = useAdminData();
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'USER_FREE' as UserRole, status: 'active' as 'active' | 'suspended', company: '' });

  return (
    <div className="px-4 py-6 lg:px-8">
      <h1 className="text-2xl font-bold text-loop-black">Gestion des utilisateurs</h1>
      <p className="mt-1 text-sm text-neutral-600">Membres, partenaires, VIP et administrateurs</p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-5 py-3">Nom</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Rôle</th>
              <th className="px-5 py-3">Statut</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {store.managedUsers.map((u) => (
              <tr key={u.id} className="border-t border-neutral-100">
                {editId === u.id ? (
                  <>
                    <td className="px-5 py-3">
                      <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
                    </td>
                    <td className="px-5 py-3">
                      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" />
                    </td>
                    <td className="px-5 py-3">
                      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className="rounded border px-2 py-1 text-sm">
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'suspended' })} className="rounded border px-2 py-1 text-sm">
                        <option value="active">Actif</option>
                        <option value="suspended">Suspendu</option>
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <button type="button" onClick={() => { updateUser(u.id, { ...form, company: form.company || null }); setEditId(null); }} className="text-xs font-bold text-green-700">OK</button>
                      <button type="button" onClick={() => setEditId(null)} className="ml-2 text-xs text-neutral-500">Annuler</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-5 py-3 font-medium">{u.fullName}</td>
                    <td className="px-5 py-3">{u.email}</td>
                    <td className="px-5 py-3">{u.role}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {u.status === 'active' ? 'Actif' : 'Suspendu'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setEditId(u.id);
                          setForm({ fullName: u.fullName, email: u.email, role: u.role, status: u.status, company: u.company ?? '' });
                        }}
                        className="text-xs font-bold text-loop-black"
                      >
                        Modifier
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {store.retractionRequests.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Demandes de rétraction</h2>
          <p className="mt-1 text-sm text-neutral-600">
            File d’attente locale uniquement. Pour retirer réellement un contenu publié,
            utilisez la console admin mobile (suppression catalogue).
          </p>
          <div className="mt-3 space-y-2">
            {store.retractionRequests.filter((r) => r.status === 'pending').map((r) => (
              <div key={r.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-semibold">{r.contentName} · {r.contentType === 'event' ? 'Événement' : 'Adresse'}</p>
                <p className="text-neutral-600">{r.partnerName}</p>
                <p className="mt-1">{r.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
