/** Événements auth transverses (deep link → navigation). */
export type AuthFlowEvent = 'password_recovery' | 'goto_login';

type Listener = (event: AuthFlowEvent) => void;

const listeners = new Set<Listener>();

export function emitAuthFlowEvent(event: AuthFlowEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      console.warn('[AuthFlow]', err);
    }
  });
}

export function subscribeAuthFlowEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
