/**
 * Page HTTPS — invite / reset mot de passe (navigateur e-mail).
 * Flux hybride : app si installée · web sinon · modal install après MDP web.
 *
 * URL : https://<project>.supabase.co/functions/v1/auth-callback
 */
const HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>THE LOOP — Compte</title>
  <style>
    :root { color-scheme: light; --bg:#f4fcfd; --text:#0a0a0a; --muted:#636e72; --card:#fff; --border:rgba(10,10,10,0.08); }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px;
      font-family:system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); }
    main { max-width:420px; width:100%; background:var(--card); border:1px solid var(--border);
      border-radius:16px; padding:28px 24px; text-align:center; box-shadow:0 12px 40px rgba(18,168,188,0.06); }
    .kicker { font-size:10px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--muted); }
    h1 { margin:12px 0 0; font-size:1.25rem; line-height:1.3; color:var(--text); }
    p { margin:12px 0 0; font-size:.9rem; line-height:1.5; color:var(--muted); }
    .form { margin-top:20px; text-align:left; display:none; }
    .choice { margin-top:20px; display:none; }
    label { display:block; font-size:11px; font-weight:600; margin-bottom:6px; color:var(--muted); }
    input { width:100%; padding:12px; border:1px solid #ddd; border-radius:10px; font-size:16px; margin-bottom:12px; }
    .btn { display:block; width:100%; padding:14px; border:none; border-radius:12px; background:#0a0a0a; color:#fff;
      font-size:.95rem; font-weight:700; cursor:pointer; margin-top:10px; text-decoration:none; text-align:center; }
    .btn.secondary { background:#fff; color:#0a0a0a; border:1px solid #ddd; }
    .btn.ghost { background:transparent; color:var(--muted); border:none; font-weight:600; font-size:.85rem; margin-top:8px; }
    .err { color:#dc2626; font-size:13px; margin-top:8px; display:none; }
    .ok { color:#059669; font-size:13px; margin-top:8px; display:none; }
    .hint { margin-top:14px; font-size:12px; color:var(--muted); }
    .overlay { display:none; position:fixed; inset:0; background:rgba(15,23,42,0.55); z-index:100;
      align-items:center; justify-content:center; padding:20px; }
    .overlay.open { display:flex; }
    .modal { max-width:400px; width:100%; background:#fff; border-radius:16px; padding:28px 24px; text-align:center;
      border:1px solid var(--border); box-shadow:0 20px 50px rgba(0,0,0,0.15); }
    .modal h2 { margin:0; font-size:1.15rem; }
    .modal p { margin:12px 0 0; font-size:.9rem; }
    .modal .btn { margin-top:16px; }
  </style>
</head>
<body>
  <main>
    <p class="kicker">THE LOOP</p>
    <h1 id="title">Chargement…</h1>
    <p id="message">Validation du lien…</p>

    <div id="choice" class="choice">
      <p class="hint">Comment souhaitez-vous continuer ?</p>
      <button type="button" class="btn" id="btnApp">J'ai THE LOOP — ouvrir l'application</button>
      <button type="button" class="btn secondary" id="btnWeb">Continuer sur le web</button>
    </div>

    <form id="pwdForm" class="form">
      <label for="pwd">Nouveau mot de passe (8+ caractères)</label>
      <input id="pwd" type="password" minlength="8" autocomplete="new-password" required />
      <label for="pwd2">Confirmer</label>
      <input id="pwd2" type="password" minlength="8" autocomplete="new-password" required />
      <button type="submit" class="btn">Enregistrer le mot de passe</button>
      <button type="button" class="btn ghost" id="backToChoice">← Retour au choix app / web</button>
      <p class="err" id="err"></p>
      <p class="ok" id="ok"></p>
    </form>

    <p class="hint" id="appFallback" style="display:none">
      L'app ne s'est pas ouverte ? <button type="button" class="btn ghost" id="fallbackWeb" style="display:inline;padding:0;margin:0;">Continuer sur le web</button>
    </p>
  </main>

  <div id="installOverlay" class="overlay" role="dialog" aria-modal="true" aria-labelledby="installTitle">
    <div class="modal">
      <p class="kicker">THE LOOP</p>
      <h2 id="installTitle">Compte activé !</h2>
      <p id="installMessage">Installez THE LOOP pour accéder à l'agenda, au guide et à vos privilèges.</p>
      <a class="btn" id="installBtn" href="https://www.theloop-app.com/">Installer THE LOOP</a>
      <button type="button" class="btn secondary" id="openAppAfter">J'ai déjà l'app — ouvrir</button>
      <button type="button" class="btn ghost" id="installLater">Plus tard</button>
    </div>
  </div>

  <script>
    (function () {
      var supabaseUrl = window.__SUPABASE_URL__;
      var anon = window.__SUPABASE_ANON__;
      var PLAY_STORE = 'https://play.google.com/store/apps/details?id=gn.theloop.app';
      var WEB_HOME = 'https://www.theloop-app.com/';

      var title = document.getElementById('title');
      var message = document.getElementById('message');
      var choiceEl = document.getElementById('choice');
      var pwdForm = document.getElementById('pwdForm');
      var btnApp = document.getElementById('btnApp');
      var btnWeb = document.getElementById('btnWeb');
      var backToChoice = document.getElementById('backToChoice');
      var appFallback = document.getElementById('appFallback');
      var fallbackWeb = document.getElementById('fallbackWeb');
      var errEl = document.getElementById('err');
      var okEl = document.getElementById('ok');
      var installOverlay = document.getElementById('installOverlay');
      var installBtn = document.getElementById('installBtn');
      var openAppAfter = document.getElementById('openAppAfter');
      var installLater = document.getElementById('installLater');

      var sessionState = { accessToken: '', refreshToken: '', kind: 'invite', paramString: '', deepLink: '' };
      var usedWebPath = false;

      function readParams() {
        var hash = window.location.hash || '';
        var search = window.location.search || '';
        var paramString = hash.indexOf('#') === 0 ? hash.slice(1)
          : (search.indexOf('?') === 0 ? search.slice(1) : '');
        return { paramString: paramString, params: new URLSearchParams(paramString) };
      }

      function showErr(msg) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
        okEl.style.display = 'none';
      }

      function authError(body) {
        return body.error_description || body.msg || body.message || body.error || 'Erreur';
      }

      function buildDeepLink(paramString) {
        return paramString ? 'theloop://auth/callback#' + paramString : 'theloop://auth/callback';
      }

      function openNativeApp() {
        var deepLink = sessionState.deepLink;
        var isAndroid = /Android/i.test(navigator.userAgent);
        var androidIntent = 'intent://auth/callback#' + (sessionState.paramString || '')
          + '#Intent;scheme=theloop;package=gn.theloop.app;end';
        try {
          window.location.href = deepLink;
          if (isAndroid) {
            window.setTimeout(function () {
              try { window.location.href = androidIntent; } catch (e2) { /* ignore */ }
            }, 600);
          }
        } catch (e) { /* ignore */ }
        appFallback.style.display = 'block';
      }

      function configureInstallLinks() {
        var isAndroid = /Android/i.test(navigator.userAgent);
        var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isAndroid) {
          installBtn.href = PLAY_STORE;
          installBtn.textContent = 'Installer sur Google Play';
        } else if (isIOS) {
          installBtn.href = WEB_HOME;
          installBtn.textContent = 'Obtenir THE LOOP (iPhone)';
        } else {
          installBtn.href = WEB_HOME;
          installBtn.textContent = 'Télécharger THE LOOP';
        }
      }

      function showInstallModal() {
        configureInstallLinks();
        installOverlay.classList.add('open');
      }

      function hideInstallModal() {
        installOverlay.classList.remove('open');
      }

      function markInviteActivated(accessToken) {
        return fetch(supabaseUrl + '/auth/v1/user', {
          headers: { 'Authorization': 'Bearer ' + accessToken, 'apikey': anon }
        }).then(function (res) { return res.json(); }).then(function (user) {
          var meta = user.user_metadata || {};
          var inviteId = meta.admin_invite_id;
          var email = user.email;
          if (!inviteId || !email) return;
          return fetch(supabaseUrl + '/rest/v1/rpc/mark_admin_user_invite_activated', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + accessToken,
              'apikey': anon
            },
            body: JSON.stringify({ p_invite_id: inviteId, p_email: email })
          });
        }).catch(function () { /* non bloquant */ });
      }

      function showChoiceScreen() {
        choiceEl.style.display = 'block';
        pwdForm.style.display = 'none';
        appFallback.style.display = 'none';
        title.textContent = sessionState.kind === 'recovery' ? 'Réinitialiser le mot de passe' : 'Activer votre compte';
        message.textContent = 'THE LOOP est installée ? Ouvrez l\\'app. Sinon, continuez sur le web pour choisir votre mot de passe.';
      }

      function showWebForm() {
        usedWebPath = true;
        choiceEl.style.display = 'none';
        pwdForm.style.display = 'block';
        appFallback.style.display = 'none';
        title.textContent = 'Nouveau mot de passe';
        message.textContent = 'Choisissez votre mot de passe ci-dessous. Vous pourrez ensuite installer ou ouvrir THE LOOP.';
        errEl.style.display = 'none';
        okEl.style.display = 'none';
      }

      function beginSession(accessToken, refreshToken, kind, paramString) {
        sessionState.accessToken = accessToken;
        sessionState.refreshToken = refreshToken;
        sessionState.kind = kind;
        sessionState.paramString = paramString;
        sessionState.deepLink = buildDeepLink(paramString);
        showChoiceScreen();
      }

      btnApp.addEventListener('click', openNativeApp);
      btnWeb.addEventListener('click', showWebForm);
      fallbackWeb.addEventListener('click', showWebForm);
      backToChoice.addEventListener('click', showChoiceScreen);
      openAppAfter.addEventListener('click', function () {
        hideInstallModal();
        openNativeApp();
      });
      installLater.addEventListener('click', hideInstallModal);

      pwdForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var pwd = document.getElementById('pwd').value;
        var pwd2 = document.getElementById('pwd2').value;
        if (pwd.length < 8) { showErr('Minimum 8 caractères.'); return; }
        if (pwd !== pwd2) { showErr('Les mots de passe ne correspondent pas.'); return; }
        fetch(supabaseUrl + '/auth/v1/user', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + sessionState.accessToken,
            'apikey': anon
          },
          body: JSON.stringify({ password: pwd })
        }).then(function (res) {
          if (!res.ok) return res.json().then(function (j) { throw new Error(authError(j)); });
          return markInviteActivated(sessionState.accessToken);
        }).then(function () {
          pwdForm.style.display = 'none';
          title.textContent = 'Compte prêt';
          message.textContent = sessionState.kind === 'invite'
            ? 'Votre invitation est activée.'
            : 'Votre mot de passe a été mis à jour.';
          if (usedWebPath) {
            showInstallModal();
          } else {
            openNativeApp();
          }
        }).catch(function (err) {
          showErr(err.message || 'Enregistrement impossible.');
        });
      });

      function otpVerifyType(kind) {
        if (kind === 'recovery') return 'recovery';
        if (kind === 'signup' || kind === 'email') return 'signup';
        return 'invite';
      }

      function verifyTokenHash(tokenHash, kind) {
        return fetch(supabaseUrl + '/auth/v1/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anon },
          body: JSON.stringify({ type: otpVerifyType(kind), token_hash: tokenHash })
        }).then(function (res) {
          return res.json().then(function (body) {
            if (!res.ok) throw new Error(authError(body));
            return body;
          });
        });
      }

      function exchangeCode(code) {
        return fetch(supabaseUrl + '/auth/v1/token?grant_type=pkce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anon },
          body: JSON.stringify({ auth_code: code })
        }).then(function (res) {
          return res.json().then(function (body) {
            if (!res.ok) throw new Error(authError(body));
            return body;
          });
        });
      }

      var parsed = readParams();
      var params = parsed.params;
      var paramString = parsed.paramString;
      var kind = (params.get('type') || 'invite').toLowerCase();
      var tokenHash = params.get('token_hash');
      var code = params.get('code');
      var accessToken = params.get('access_token');
      var refreshToken = params.get('refresh_token');

      var error = params.get('error_description') || params.get('error');
      if (error) {
        title.textContent = 'Lien invalide';
        message.textContent = decodeURIComponent(String(error).replace(/\\+/g, ' '));
        return;
      }

      if (tokenHash) {
        verifyTokenHash(tokenHash, kind)
          .then(function (session) {
            var at = session.access_token;
            var rt = session.refresh_token;
            if (!at || !rt) throw new Error('Session invalide après validation.');
            var ps = 'type=' + kind + '&access_token=' + encodeURIComponent(at) + '&refresh_token=' + encodeURIComponent(rt);
            beginSession(at, rt, kind, ps);
          })
          .catch(function (err) {
            title.textContent = 'Lien invalide ou expiré';
            message.textContent = err.message || 'Demandez un nouvel e-mail depuis l\\'administrateur THE LOOP.';
          });
        return;
      }

      if (code && !accessToken) {
        exchangeCode(code)
          .then(function (session) {
            beginSession(session.access_token, session.refresh_token, kind, paramString);
          })
          .catch(function (err) {
            title.textContent = 'Lien incomplet';
            message.textContent = (err.message || 'Ce lien ne peut pas être validé ici.')
              + ' Demandez à l\\'équipe THE LOOP de renvoyer l\\'invitation (nouveau modèle d\\'e-mail).';
          });
        return;
      }

      if (!paramString) {
        title.textContent = 'Lien incomplet';
        message.textContent = 'Ce lien ne fonctionne pas. Demandez un nouvel e-mail d\\'invitation.';
        return;
      }

      if ((kind === 'recovery' || kind === 'invite') && accessToken && refreshToken) {
        beginSession(accessToken, refreshToken, kind, paramString);
        return;
      }

      title.textContent = 'E-mail confirmé';
      message.textContent = 'Utilisez les boutons ci-dessous pour continuer dans l\\'app ou sur le web.';
      sessionState.deepLink = buildDeepLink(paramString);
      sessionState.paramString = paramString;
      sessionState.kind = kind;
      showChoiceScreen();
    })();
  </script>
</body>
</html>`;

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      },
    });
  }

  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const html = HTML
    .replace('window.__SUPABASE_ANON__', JSON.stringify(anon))
    .replace('window.__SUPABASE_URL__', JSON.stringify(url));

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': 'inline; filename="auth-callback.html"',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
