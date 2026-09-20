import rateLimit, { type Options } from 'express-rate-limit';

const SHARED: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
};

/**
 * Le webhook Djomy est déjà authentifié par signature HMAC et doit passer même
 * en rafale : une notification refusée retarde la livraison d'un PASS payé.
 */
function isExempt(path: string): boolean {
  return path === '/health' || path.startsWith('/api/webhook/');
}

/** Garde-fou général sur toute l'API. */
export const globalLimiter = rateLimit({
  ...SHARED,
  windowMs: 60_000,
  limit: 120,
  skip: (req) => isExempt(req.path),
  message: { error: 'Trop de requêtes. Réessayez dans un instant.' },
});

/** Routes dont le seul secret est devinable par force brute (jeton SPOT, code partenaire). */
export const bruteForceLimiter = rateLimit({
  ...SHARED,
  windowMs: 60_000,
  limit: 10,
  message: { error: 'Trop de tentatives. Réessayez dans une minute.' },
});
