import { useEffect, useState } from 'react';

import { Link } from 'react-router-dom';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';



type Status = 'loading' | 'ok' | 'error';



function extractAuthParams(): Record<string, string> {

  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';

  const query = window.location.search.startsWith('?') ? window.location.search.slice(1) : '';

  const params = new URLSearchParams(hash || query);

  const out: Record<string, string> = {};

  params.forEach((value, key) => {

    out[key] = value;

  });

  return out;

}



function tryOpenMobileApp(): void {

  const hash = window.location.hash.startsWith('#') ? window.location.hash : '';

  const query = window.location.search.startsWith('?') ? window.location.search : '';

  const suffix = hash || query;

  if (!suffix) return;

  const deepLink = `theloop://auth/callback${suffix.startsWith('#') || suffix.startsWith('?') ? suffix : `#${suffix}`}`;

  window.setTimeout(() => {

    window.location.href = deepLink;

  }, 400);

}



export function AuthCallbackPage() {

  const [status, setStatus] = useState<Status>('loading');

  const [detail, setDetail] = useState('Validation de votre e-mail en cours…');



  useEffect(() => {

    if (!isSupabaseConfigured() || !supabase) {

      setStatus('error');

      setDetail('Configuration Supabase indisponible.');

      return;

    }



    let cancelled = false;



    async function resolveSession() {

      const params = extractAuthParams();

      const accessToken = params.access_token;

      const refreshToken = params.refresh_token;



      if (accessToken && refreshToken) {

        const { error } = await supabase!.auth.setSession({

          access_token: accessToken,

          refresh_token: refreshToken,

        });

        if (cancelled) return;

        if (error) {

          setStatus('error');

          setDetail('Lien invalide ou expiré. Demandez un nouvel e-mail de confirmation depuis l’application.');

          return;

        }

        setStatus('ok');

        setDetail('Votre e-mail est confirmé. Vous pouvez vous connecter à THE LOOP.');

        tryOpenMobileApp();

        return;

      }



      const { data, error } = await supabase!.auth.getSession();

      if (cancelled) return;



      if (error) {

        setStatus('error');

        setDetail('Lien invalide ou expiré. Demandez un nouvel e-mail de confirmation depuis l’application.');

        return;

      }



      if (data.session) {

        setStatus('ok');

        setDetail('Votre e-mail est confirmé. Vous pouvez vous connecter à THE LOOP.');

        tryOpenMobileApp();

        return;

      }



      await new Promise((resolve) => setTimeout(resolve, 600));

      const retry = await supabase!.auth.getSession();

      if (cancelled) return;



      if (retry.data.session) {

        setStatus('ok');

        setDetail('Votre e-mail est confirmé. Vous pouvez vous connecter à THE LOOP.');

        tryOpenMobileApp();

        return;

      }



      setStatus('error');

      setDetail(

        'Impossible de finaliser la confirmation. Rouvrez le lien ou renvoyez l’e-mail depuis l’application mobile.',

      );

    }



    void resolveSession();



    return () => {

      cancelled = true;

    };

  }, []);



  return (

    <div className="flex min-h-screen flex-col items-center justify-center bg-loop-public-bg px-6 py-12 text-center">

      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-loop-gold">THE LOOP</p>

      <h1 className="mt-3 text-xl font-bold text-loop-public-text">

        {status === 'loading' ? 'Confirmation…' : status === 'ok' ? 'Compte activé' : 'Confirmation impossible'}

      </h1>

      <p className="mt-4 max-w-md text-sm leading-relaxed text-loop-public-muted">{detail}</p>

      {status === 'ok' ? (

        <Link

          to="/"

          className="mt-8 rounded-xl bg-loop-black px-6 py-3 text-sm font-bold text-white"

        >

          Continuer

        </Link>

      ) : null}

      {status === 'error' ? (

        <p className="mt-6 text-xs text-loop-public-muted">

          Sur mobile : rouvrez THE LOOP → Connexion → renvoyez l’e-mail de confirmation.

        </p>

      ) : null}

    </div>

  );

}


