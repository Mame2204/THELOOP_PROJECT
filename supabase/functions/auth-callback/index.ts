/**
 * Page HTTPS de confirmation e-mail — Content-Type text/html (contrairement à Storage).
 * URL : https://<project>.supabase.co/functions/v1/auth-callback
 */
const HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>THE LOOP — Confirmation e-mail</title>
  <style>
    :root { color-scheme: light; --bg:#f4fcfd; --text:#0a0a0a; --muted:#636e72; --gold:#c9a84c; --accent:#12a8bc; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;
      font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--text); text-align:center; }
    main { max-width:420px; }
    .kicker { font-size:10px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--gold); }
    h1 { margin:12px 0 0; font-size:1.35rem; line-height:1.3; }
    p { margin:16px 0 0; font-size:.95rem; line-height:1.55; color:var(--muted); }
    .hint { margin-top:20px; font-size:.8rem; }
    .btn { display:inline-block; margin-top:24px; padding:14px 22px; border-radius:12px; background:#0a0a0a; color:#fff;
      font-size:.95rem; font-weight:700; text-decoration:none; }
  </style>
</head>
<body>
  <main>
    <p class="kicker">THE LOOP</p>
    <h1 id="title">Confirmation en cours…</h1>
    <p id="message">Validation de votre e-mail…</p>
    <p class="hint" id="hint"></p>
    <a class="btn" id="openApp" href="theloop://auth/callback" style="display:none">Ouvrir THE LOOP</a>
  </main>
  <script>
    (function () {
      var title = document.getElementById('title');
      var message = document.getElementById('message');
      var hint = document.getElementById('hint');
      var openApp = document.getElementById('openApp');
      var hash = window.location.hash || '';
      var search = window.location.search || '';
      var paramString = hash.indexOf('#') === 0 ? hash.slice(1)
        : (search.indexOf('?') === 0 ? search.slice(1) : '');

      function ok(deepLink, kind) {
        if (kind === 'recovery' || kind === 'invite') {
          title.textContent = 'Lien validé';
          message.textContent = 'Ouvrez THE LOOP pour choisir votre nouveau mot de passe. Ne fermez pas l\\'application avant d\\'avoir confirmé.';
          hint.textContent = 'Build natif : utilisez le bouton ci-dessous. Expo Go : rouvrez l\\'app si elle ne s\\'ouvre pas seule.';
        } else {
          title.textContent = 'E-mail confirmé';
          message.textContent = 'Votre compte THE LOOP est activé. L\\'application s\\'ouvre — vous êtes connecté.';
          hint.textContent = 'Expo Go : rouvrez l\\'app si besoin. Build natif : utilisez le bouton ci-dessous.';
        }
        if (deepLink) { openApp.href = deepLink; openApp.style.display = 'inline-block'; }
      }

      if (!paramString) {
        title.textContent = 'Lien incomplet';
        message.textContent = 'Rouvrez le message reçu par e-mail ou renvoyez la confirmation depuis l\\'application.';
        return;
      }
      var params = new URLSearchParams(paramString);
      var error = params.get('error_description') || params.get('error');
      if (error) {
        title.textContent = 'Confirmation impossible';
        message.textContent = decodeURIComponent(String(error).replace(/\\+/g, ' '));
        hint.textContent = 'THE LOOP → Connexion → renvoyez l\\'e-mail de confirmation.';
        return;
      }
      var kind = (params.get('type') || '').toLowerCase();
      var deepLink = 'theloop://auth/callback#' + paramString;
      ok(deepLink, kind);
      setTimeout(function () { try { window.location.href = deepLink; } catch (e) {} }, 700);
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

  return new Response(HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
