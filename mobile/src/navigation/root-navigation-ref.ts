import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation/types';

/** Navigation racine — ouvre VisitorGateway depuis n’importe quel écran (tabs, fiches modal iOS). */
export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();

/** Ouvre un écran racine sans params (ex. VisitorGateway). */
export function navigateRoot(name: 'VisitorGateway'): boolean {
  if (!rootNavigationRef.isReady()) return false;
  rootNavigationRef.navigate(name);
  return true;
}
