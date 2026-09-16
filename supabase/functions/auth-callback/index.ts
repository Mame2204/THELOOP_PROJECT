/**
 * Page HTTPS — invite / reset mot de passe (navigateur e-mail).
 * URL : https://<project>.supabase.co/functions/v1/auth-callback
 *
 * Le template e-mail Supabase doit pointer ici avec token_hash :
 *   …/auth-callback?token_hash={{ .TokenHash }}&type=invite
 */
const HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>THE LOOP — Compte</title>
  <style>
    :root { color-scheme: light; --bg:#f4fcfd; --text:#0a0a0a; --muted:#636e72; --gold:#c9a84c; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px;
      font-family:system-ui,-apple-system,sans-serif; background:var(--bg); color:var(--text); }
    main { max-width:400px; width:100%; text-align:center; }
    .kicker { font-size:10px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--gold); }
    h1 { margin:12px 0 0; font-size:1.25rem; line-height:1.3; }
    p { margin:12px 0 0; font-size:.9rem; line-height:1.5; color:var(--muted); }
    .form { margin-top:20px; text-align:left; display:none; }
    label { display:block; font-size:11px; font-weight:600; margin-bottom:6px; color:var(--muted); }
    input { width:100%; padding:12px; border:1px solid #ddd; border-radius:10px; font-size:16px; margin-bottom:12px; }
    .btn { display:block; width:100%; padding:14px; border:none; border-radius:12px; background:#0a0a0a; color:#fff;
      font-size:.95rem; font-weight:700; cursor:pointer; margin-top:8px; }
    .btn.secondary { background:#fff; color:#0a0a0a; border:1px solid #ddd; margin-top:12px; text-decoration:none; text-align:center; }
    .err { color:#dc2626; font-size:13px; margin-top:8px; display:none; }
    .ok { color:#059669; font-size:13px; margin-top:8px; display:none; }
  </style>
</head>
<body>
  <main>
    <p class="kicker">THE LOOP</p>
    <h1 id="title">Chargement…</h1>
    <p id="message">Validation du lien…</p>
    <form id="pwdForm" class="form">
      <label for="pwd">Nouveau mot de passe (8+ caractères)</label>
      <input id="pwd" type="password" minlength="8" autocomplete="new-password" required />
      <label for="pwd2">Confirmer</label>
      <input id="pwd2" type="password" minlength="8" autocomplete="new-password" required />
      <button type="submit" class="btn">Enregistrer le mot de passe</button>
      <p class="err" id="err"></p>
      <p class="ok" id="ok"></p>
    </form>
    <a class="btn secondary" id="openApp" href="theloop://auth/callback" style="display:none">Ouvrir l'app THE LOOP</a>
  </main>
  <script>
    (function () {
      var supabaseUrl = window.__SUPABASE_URL__;
      var anon = window.__SUPABASE_ANON__;
      var title = document.getElementById('title');
      var message = document.getElementById('message');
      var pwdForm = document.getElementById('pwdForm');
      var openApp = document.getElementById('openApp');
      var errEl = document.getElementById('err');
      var okEl = document.getElementById('ok');

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

      function showPasswordForm(accessToken, refreshToken, kind, paramString) {
        var deepLink = paramString ? 'theloop://auth/callback#' + paramString : 'theloop://auth/callback';
        openApp.href = deepLink;
        openApp.style.display = 'block';
        title.textContent = 'Nouveau mot de passe';
        message.textContent = 'Choisissez votre mot de passe pour activer votre compte THE LOOP.';
        pwdForm.style.display = 'block';

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
              'Authorization': 'Bearer ' + accessToken,
              'apikey': anon
            },
            body: JSON.stringify({ password: pwd })
          }).then(function (res) {
            if (!res.ok) return res.json().then(function (j) { throw new Error(authError(j)); });
            return markInviteActivated(accessToken);
          }).then(function () {
            okEl.textContent = 'Mot de passe enregistré. Ouvrez THE LOOP et connectez-vous.';
            okEl.style.display = 'block';
            errEl.style.display = 'none';
            pwdForm.style.display = 'none';
            title.textContent = 'Compte prêt';
            message.textContent = kind === 'invite'
              ? 'Votre invitation est activée.'
              : 'Votre mot de passe a été mis à jour.';
          }).catch(function (err) {
            showErr(err.message || 'Enregistrement impossible.');
          });
        });
      }

      function verifyTokenHash(tokenHash, type) {
        return fetch(supabaseUrl + '/auth/v1/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': anon },
          body: JSON.stringify({ type: type, token_hash: tokenHash })
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
        verifyTokenHash(tokenHash, kind === 'recovery' ? 'recovery' : 'invite')
          .then(function (session) {
            var at = session.access_token;
            var rt = session.refresh_token;
            if (!at || !rt) throw new Error('Session invalide après validation.');
            showPasswordForm(at, rt, kind, 'type=' + kind + '&access_token=' + encodeURIComponent(at) + '&refresh_token=' + encodeURIComponent(rt));
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
            showPasswordForm(session.access_token, session.refresh_token, kind, paramString);
          })
          .catch(function (err) {
            title.textContent = 'Lien incomplet';
            message.textContent = err.message || 'Ouvrez le lien depuis le même appareil ou demandez un nouvel e-mail.';
          });
        return;
      }

      if (!paramString) {
        title.textContent = 'Lien incomplet';
        message.textContent = 'Ce lien ne fonctionne pas. Demandez un nouvel e-mail d\\'invitation.';
        return;
      }

      if ((kind === 'recovery' || kind === 'invite') && accessToken && refreshToken) {
        showPasswordForm(accessToken, refreshToken, kind, paramString);
        return;
      }

      title.textContent = 'E-mail confirmé';
      message.textContent = 'Ouvrez l\\'application THE LOOP pour continuer.';
      openApp.href = 'theloop://auth/callback#' + paramString;
      openApp.style.display = 'block';
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
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
