import { Router } from 'express';
import { verifyWebhookSignature } from '../lib/djomy.js';
import { processDjomyWebhookEvent } from '../services/reconcile-payment-intent.js';

export const webhookRouter = Router();

type WebhookPayload = {
  eventType: string;
  eventId: string;
  message: string;
  data: Record<string, unknown>;
  timestamp: string;
};

webhookRouter.post('/webhook/djomy', async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  if (typeof signature !== 'string' || !signature.trim()) {
    res.status(401).json({ error: 'Signature webhook manquante.' });
    return;
  }

  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    res.status(400).json({ error: 'Corps brut requis.' });
    return;
  }

  const rawText = rawBody.toString('utf8');
  if (!verifyWebhookSignature(rawText, signature)) {
    res.status(401).json({ error: 'Signature webhook invalide.' });
    return;
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawText) as WebhookPayload;
  } catch {
    res.status(400).json({ error: 'JSON invalide.' });
    return;
  }

  res.status(200).json({ received: true });

  void (async () => {
    try {
      const transactionId = String(payload.data?.transactionId ?? '').trim();
      const merchantReference =
        String(payload.data?.merchantPaymentReference ?? '').trim() || undefined;
      if (!transactionId) {
        console.warn('[webhook/djomy] transactionId manquant', payload.eventType);
        return;
      }

      console.log('[webhook/djomy]', payload.eventType, transactionId);
      await processDjomyWebhookEvent(payload.eventType, transactionId, merchantReference);
    } catch (err) {
      console.error('[webhook/djomy] traitement async', err);
    }
  })();
});
