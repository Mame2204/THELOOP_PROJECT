import { Router } from 'express';

export const publicPagesRouter = Router();

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — THE LOOP</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #fafafa; margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    main { max-width: 28rem; text-align: center; }
    h1 { font-size: 1.35rem; letter-spacing: 0.04em; color: #C9A84C; }
    p { line-height: 1.5; color: #d4d4d4; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${body}</p>
  </main>
</body>
</html>`;
}

/** Retour portail Djomy — l’app mobile poll le statut ; ces pages ferment le navigateur. */
publicPagesRouter.get('/payment/success', (_req, res) => {
  res
    .type('html')
    .send(
      page(
        'Paiement reçu',
        'Vous pouvez revenir dans l’application THE LOOP. Votre PASS s’active automatiquement sous peu.',
      ),
    );
});

publicPagesRouter.get('/payment/cancel', (_req, res) => {
  res
    .type('html')
    .send(
      page(
        'Paiement annulé',
        'Aucun débit n’a été confirmé. Revenez dans THE LOOP pour réessayer.',
      ),
    );
});
