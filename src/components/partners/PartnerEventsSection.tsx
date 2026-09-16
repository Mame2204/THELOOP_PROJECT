import { useState } from 'react';

import type { EventCategory } from '@/types';

import { usePartnerData } from '@/hooks/usePartnerData';

import { PartnerEventForm } from '@/components/partners/PartnerEventForm';



function statusLabel(stagingStatus?: string) {

  if (stagingStatus === 'approved') return { text: 'Publié', className: 'bg-green-100 text-green-700' };

  if (stagingStatus === 'rejected') return { text: 'Refusé', className: 'bg-red-100 text-red-700' };

  return { text: 'En modération', className: 'bg-amber-100 text-amber-700' };

}



export function PartnerEventsSection() {

  const { workspace, platformCategories, getEventStaging, resubmitEvent, updatePendingEvent, removeEvent } = usePartnerData();

  const [showForm, setShowForm] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);

  function categoryLabel(category: EventCategory) {

    return platformCategories.find((c) => c.eventCategory === category)?.label ?? category;

  }



  return (

    <div className="space-y-4">

      <button

        type="button"

        onClick={() => setShowForm((v) => !v)}

        className="w-full rounded-xl bg-loop-gold py-3 text-sm font-bold text-loop-black"

      >

        {showForm ? 'Fermer le formulaire' : '+ Créer un événement'}

      </button>



      {showForm && (

        <PartnerEventForm onSuccess={() => setShowForm(false)} onCancel={() => setShowForm(false)} />

      )}



      <div className="space-y-2">

        {workspace.events.length === 0 ? (

          <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">

            Aucun événement créé pour le moment.

          </p>

        ) : (

          workspace.events.map((event) => {

            const staging = getEventStaging(event.id);

            const badge = statusLabel(staging?.status);

            const isPending = staging?.status === 'pending';

            const isRejected = staging?.status === 'rejected';

            const isPublished = staging?.status === 'approved';



            return (

              <article key={event.id} className="rounded-xl border border-neutral-300 bg-white p-4 shadow-sm">

                <div className="flex items-start justify-between gap-2">

                  <div>

                    <p className="font-semibold text-loop-black">{event.title}</p>

                    <p className="mt-0.5 text-xs text-neutral-500">

                      {new Date(event.startsAt).toLocaleString('fr-FR')} · {event.venueName}

                    </p>

                  </div>

                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>

                    {badge.text}

                  </span>

                </div>

                <p className="mt-2 line-clamp-2 text-sm text-neutral-600">{event.description}</p>

                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-loop-gold">

                  {categoryLabel(event.category)}

                </p>



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

                      onClick={() => {

                        setEditId(editId === event.id ? null : event.id);

                        setRetractionId(null);

                      }}

                      className="rounded-lg border border-loop-black px-3 py-1.5 text-xs font-semibold text-loop-black"

                    >

                      {editId === event.id ? 'Annuler' : isPending ? 'Modifier' : 'Corriger et resoumettre'}

                    </button>

                  )}

                  {!isPublished && (

                    <button type="button" onClick={() => removeEvent(event.id)} className="text-xs font-semibold text-red-500 hover:underline">

                      Supprimer

                    </button>

                  )}

                </div>

                {isPublished && staging ? (
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Retrait d’un contenu publié : utilisez l’application mobile THE LOOP (Espace Pro → Mes contenus).
                  </p>
                ) : null}

                {editId === event.id && (

                  <PartnerEventForm

                    title={isPending ? 'Modifier l\'événement' : 'Corriger l\'événement'}

                    initialValues={event}

                    submitLabel={isPending ? 'Enregistrer' : 'Resoumettre pour modération'}

                    onSubmit={(data) => {

                      if (isPending) updatePendingEvent(event.id, data);

                      else resubmitEvent(event.id, data);

                      setEditId(null);

                    }}

                    onCancel={() => setEditId(null)}

                  />

                )}

              </article>

            );

          })

        )}

      </div>

    </div>

  );

}


