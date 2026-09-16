import { useState } from 'react';

import { usePartnerData } from '@/hooks/usePartnerData';



function statusLabel(stagingStatus?: string) {

  if (stagingStatus === 'approved') return { text: 'Publié', className: 'bg-green-100 text-green-700' };

  if (stagingStatus === 'rejected') return { text: 'Refusé', className: 'bg-red-100 text-red-700' };

  return { text: 'En modération', className: 'bg-amber-100 text-amber-700' };

}



export function PartnerAddressesSection() {

  const { workspace, addAddress, removeAddress, getAddressStaging, resubmitAddress, updatePendingAddress } = usePartnerData();

  const [name, setName] = useState('');

  const [address, setAddress] = useState('');

  const [city, setCity] = useState('Conakry');

  const [editId, setEditId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({ name: '', address: '', city: '' });

  function handleSubmit(e: React.FormEvent) {

    e.preventDefault();

    addAddress({ name, address, city });

    setName('');

    setAddress('');

    setCity('Conakry');

  }



  function startEdit(id: string, current: { name: string; address: string; city: string }, isPending: boolean) {

    setEditId(id);

    setEditForm(current);

    setRetractionId(null);

    if (!isPending) return;

  }



  function handleSave(e: React.FormEvent) {

    e.preventDefault();

    if (!editId) return;

    const staging = getAddressStaging(editId);

    if (staging?.status === 'pending') {

      updatePendingAddress(editId, editForm);

    } else if (staging?.status === 'rejected') {

      resubmitAddress(editId, editForm);

    }

    setEditId(null);

  }



  return (

    <div className="space-y-4">

      <form onSubmit={handleSubmit} className="rounded-2xl border border-neutral-300 bg-white p-4 shadow-sm">

        <h2 className="text-sm font-bold text-loop-black">Ajouter une adresse</h2>

        <div className="mt-3 space-y-2">

          <input type="text" placeholder="Nom du lieu" required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-loop-black" />

          <input type="text" placeholder="Adresse" required value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-loop-black" />

          <input type="text" placeholder="Ville" required value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-loop-black" />

        </div>

        <button type="submit" className="mt-3 w-full rounded-xl bg-loop-black py-2.5 text-sm font-bold text-white">

          Enregistrer l&apos;adresse

        </button>

      </form>



      <div className="space-y-2">

        {workspace.addresses.length === 0 ? (

          <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">

            Aucune adresse enregistrée.

          </p>

        ) : (

          workspace.addresses.map((item) => {

            const staging = getAddressStaging(item.id);

            const badge = statusLabel(staging?.status);

            const isPending = staging?.status === 'pending';

            const isRejected = staging?.status === 'rejected';

            const isPublished = staging?.status === 'approved';



            return (

              <article key={item.id} className="rounded-xl border border-neutral-300 bg-white p-4 shadow-sm">

                <div className="flex items-start justify-between gap-3">

                  <div>

                    <p className="font-semibold text-loop-black">{item.name}</p>

                    <p className="mt-0.5 text-sm text-neutral-600">{item.address}</p>

                    <p className="text-xs text-neutral-500">{item.city}</p>

                  </div>

                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>

                    {badge.text}

                  </span>

                </div>



                {isRejected && staging?.rejectionReason && (

                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">

                    <p className="text-[10px] font-bold uppercase tracking-wide">Motif du refus admin</p>

                    <p className="mt-1">{staging.rejectionReason}</p>

                  </div>

                )}



                <div className="mt-3 flex flex-wrap gap-2">

                  {(isPending || isRejected) && (

                    <button

                      type="button"

                      onClick={() => startEdit(item.id, { name: item.name, address: item.address, city: item.city }, isPending)}

                      className="rounded-lg border border-loop-black px-3 py-1.5 text-xs font-semibold text-loop-black"

                    >

                      {isPending ? 'Modifier' : 'Corriger et resoumettre'}

                    </button>

                  )}

                  {!isPublished && (

                    <button type="button" onClick={() => removeAddress(item.id)} className="text-xs font-semibold text-red-500 hover:underline">

                      Supprimer

                    </button>

                  )}

                </div>

                {isPublished && staging ? (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Retrait d’un contenu publié : utilisez l’application mobile THE LOOP (Espace Pro → Mes contenus).
                  </p>
                ) : null}

                {editId === item.id && (

                  <form onSubmit={handleSave} className="mt-3 space-y-2 border-t border-neutral-200 pt-3">

                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-loop-black" />

                    <input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-loop-black" />

                    <input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm text-loop-black" />

                    <button type="submit" className="w-full rounded-xl bg-loop-gold py-2 text-xs font-bold text-loop-black">

                      {isPending ? 'Enregistrer' : 'Resoumettre'}

                    </button>

                  </form>

                )}

              </article>

            );

          })

        )}

      </div>

    </div>

  );

}


