/**
 * Page HTTPS — confirmation e-mail / reset mot de passe sans app obligatoire.
 * URL : https://<project>.supabase.co/functions/v1/auth-callback
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
    <p id="message"></p>
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
      var title = document.getElementById('title');
      var message = document.getElementById('message');
      var pwdForm = document.getElementById('pwdForm');
      var openApp = document.getElementById('openApp');
      var errEl = document.getElementById('err');
      var okEl = document.getElementById('ok');
      var hash = window.location.hash || '';
      var search = window.location.search || '';
      var paramString = hash.indexOf('#') === 0 ? hash.slice(1)
        : (search.indexOf('?') === 0 ? search.slice(1) : '');
      var params = new URLSearchParams(paramString);
      var kind = (params.get('type') || '').toLowerCase();
      var accessToken = params.get('access_token');
      var refreshToken = params.get('refresh_token');
      var deepLink = paramString ? 'theloop://auth/callback#' + paramString : 'theloop://auth/callback';

      function showErr(msg) {
        errEl.textContent = msg;
        errEl.style.display = 'block';
        okEl.style.display = 'none';
      }

      if (!paramString) {
        title.textContent = 'Lien incomplet';
        message.textContent = 'Rouvrez le message reçu par e-mail.';
        return;
      }

      var error = params.get('error_description') || params.get('error');
      if (error) {
        title.textContent = 'Lien invalide';
        message.textContent = decodeURIComponent(String(error).replace(/\\+/g, ' '));
        return;
      }

      openApp.href = deepLink;
      openApp.style.display = 'block';

      if ((kind === 'recovery' || kind === 'invite') && accessToken) {
        title.textContent = 'Nouveau mot de passe';
        message.textContent = 'Choisissez votre mot de passe ci-dessous, ou ouvrez l\\'application.';
        pwdForm.style.display = 'block';
        pwdForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var pwd = document.getElementById('pwd').value;
          var pwd2 = document.getElementById('pwd2').value;
          if (pwd.length < 8) { showErr('Minimum 8 caractères.'); return; }
          if (pwd !== pwd2) { showErr('Les mots de passe ne correspondent pas.'); return; }
          fetch(window.__SUPABASE_URL__ + '/auth/v1/user', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + accessToken,
              'apikey': window.__SUPABASE_ANON__
            },
            body: JSON.stringify({ password: pwd })
          }).then(function (res) {
            if (!res.ok) return res.json().then(function (j) { throw new Error(j.msg || j.message || 'Erreur'); });
            okEl.textContent = 'Mot de passe enregistré. Vous pouvez ouvrir THE LOOP.';
            okEl.style.display = 'block';
            errEl.style.display = 'none';
            pwdForm.style.display = 'none';
            title.textContent = 'Compte prêt';
            message.textContent = 'Connectez-vous avec votre nouveau mot de passe.';
          }).catch(function (err) {
            showErr(err.message || 'Enregistrement impossible.');
          });
        });
        return;
      }

      title.textContent = kind === 'recovery' || kind === 'invite' ? 'Lien validé' : 'E-mail confirmé';
      message.textContent = kind === 'recovery' || kind === 'invite'
        ? 'Ouvrez THE LOOP pour finaliser votre mot de passe.'
        : 'Votre compte est activé. Ouvrez l\\'application.';
      setTimeout(function () { try { window.location.href = deepLink; } catch (e) {} }, 600);
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
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
