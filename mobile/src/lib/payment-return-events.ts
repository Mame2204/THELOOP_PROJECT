/** Retour portail Djomy → deep link theloop://payment/complete */
type Listener = () => void;

const listeners = new Set<Listener>();

export function emitPaymentReturn(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      console.warn('[PaymentReturn]', err);
    }
  });
}

export function subscribePaymentReturn(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isPaymentReturnUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('payment/complete') || url.includes('payment%2Fcomplete');
}
