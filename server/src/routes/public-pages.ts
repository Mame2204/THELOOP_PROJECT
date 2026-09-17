import { Router } from 'express';

export const publicPagesRouter = Router();

type PageVariant = 'success' | 'cancel';

const LOOP_MARK_SVG = `
<svg width="40" height="40" viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <circle cx="18" cy="18" r="15" stroke="#C9A84C" stroke-width="3"/>
  <path d="M 13.5 10.21 A 9 9 0 1 1 13.5 25.79" stroke="#C9A84C" stroke-width="3" stroke-linecap="round"/>
  <circle cx="10" cy="18" r="2" fill="#C9A84C"/>
</svg>`;

function paymentPage(variant: PageVariant): string {
  const isSuccess = variant === 'success';
  const title = isSuccess ? 'Paiement reçu' : 'Paiement annulé';
  const message = isSuccess
    ? 'Vous pouvez revenir dans l’application THE LOOP. Votre PASS s’active automatiquement sous peu.'
    : 'Aucun débit n’a été confirmé. Revenez dans THE LOOP pour réessayer.';
  const hint = isSuccess
    ? 'Fermez cet onglet, puis ouvrez THE LOOP. Votre abonnement apparaîtra dans Mon PASS.'
    : 'Fermez cet onglet et rouvrez THE LOOP pour choisir un autre moyen de paiement.';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#f4fcfd" />
  <meta name="robots" content="noindex" />
  <title>${title} — THE LOOP</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4fcfd;
      --bg-accent: #e8f6f8;
      --text: #0a0a0a;
      --muted: #636e72;
      --gold: #c9a84c;
      --accent: #12a8bc;
      --card: #ffffff;
      --border: rgba(10, 10, 10, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: var(--text);
      text-align: center;
      background:
        radial-gradient(ellipse 80% 50% at 50% -10%, var(--bg-accent), transparent 55%),
        var(--bg);
    }
    main {
      width: 100%;
      max-width: 420px;
      padding: 32px 28px 28px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: 0 12px 40px rgba(18, 168, 188, 0.08);
    }
    .mark { display: flex; justify-content: center; margin-bottom: 16px; }
    .kicker {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--gold);
    }
    h1 {
      margin: 12px 0 0;
      font-size: 1.35rem;
      line-height: 1.3;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    p {
      margin: 16px 0 0;
      font-size: 0.95rem;
      line-height: 1.55;
      color: var(--muted);
    }
    .hint {
      margin-top: 20px;
      font-size: 0.8rem;
      color: var(--muted);
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 20px;
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      ${
        isSuccess
          ? 'background: rgba(18, 168, 188, 0.12); color: #0d7a88;'
          : 'background: rgba(99, 110, 114, 0.12); color: #4a5560;'
      }
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
    }
    .btn {
      display: inline-block;
      margin-top: 24px;
      padding: 14px 22px;
      border-radius: 12px;
      background: #0a0a0a;
      color: #fff;
      font-size: 0.95rem;
      font-weight: 700;
      text-decoration: none;
    }
    .btn-secondary {
      display: block;
      margin-top: 14px;
      color: var(--accent);
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <main>
    <div class="mark">${LOOP_MARK_SVG}</div>
    <p class="kicker">THE LOOP</p>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="status" role="status">
      <span class="status-dot" aria-hidden="true"></span>
      ${isSuccess ? 'Confirmé' : 'Non débité'}
    </div>
    <p class="hint">${hint}</p>
    <p class="hint">Si THE LOOP est déjà installée, touchez le bouton ci-dessous. Sinon, fermez cet onglet et rouvrez l’app depuis l’écran d’accueil de votre téléphone.</p>
    <a class="btn" id="openApp" href="theloop://payment/complete?status=${variant}">Ouvrir THE LOOP</a>
    <a class="btn-secondary" href="https://www.theloop-app.com/">www.theloop-app.com</a>
  </main>
  <script>
    (function () {
      var openApp = document.getElementById('openApp');
      var deepLink = 'theloop://payment/complete?status=${variant}';
      var androidIntent =
        'intent://payment/complete?status=${variant}#Intent;scheme=theloop;package=gn.theloop.app;end';

      if (!openApp) return;

      openApp.addEventListener('click', function (e) {
        e.preventDefault();
        var isAndroid = /Android/i.test(navigator.userAgent);
        try {
          if (isAndroid) {
            window.location.href = androidIntent;
          } else {
            window.location.href = deepLink;
          }
        } catch (err) { /* ignore */ }
      });
    })();
  </script>
</body>
</html>`;
}

/** Retour portail Djomy — l’app mobile poll le statut ; ces pages guident le retour dans l’app. */
publicPagesRouter.get('/payment/success', (_req, res) => {
  res
    .set({
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    .type('html')
    .send(paymentPage('success'));
});

publicPagesRouter.get('/payment/cancel', (_req, res) => {
  res
    .set({
      'Cache-Control': 'no-store',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    .type('html')
    .send(paymentPage('cancel'));
});
