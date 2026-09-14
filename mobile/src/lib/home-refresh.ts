import { DeviceEventEmitter } from 'react-native';

export const HOME_REFRESH_EVENT = 'loop-home-refresh';

/** Notifie Accueil (et blocs) qu’un contenu admin a changé — sans attendre reconnexion. */
export function emitHomeRefresh(reason = 'update'): void {
  DeviceEventEmitter.emit(HOME_REFRESH_EVENT, reason);
}

export function subscribeHomeRefresh(listener: (reason: string) => void): () => void {
  const sub = DeviceEventEmitter.addListener(HOME_REFRESH_EVENT, (reason: string) => {
    listener(typeof reason === 'string' ? reason : 'update');
  });
  return () => sub.remove();
}
