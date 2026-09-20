import Constants from 'expo-constants';
import { Platform } from 'react-native';

export function getAppVersionLabel(): string {
  const version = Constants.expoConfig?.version ?? '0.0.0';
  if (Platform.OS === 'ios') {
    const build = Constants.expoConfig?.ios?.buildNumber ?? '—';
    return `${version} (${build})`;
  }
  if (Platform.OS === 'android') {
    const build = Constants.expoConfig?.android?.versionCode;
    return build != null ? `${version} (${build})` : version;
  }
  return version;
}

export function getAppBuildNumber(): string {
  if (Platform.OS === 'ios') {
    return String(Constants.expoConfig?.ios?.buildNumber ?? '—');
  }
  if (Platform.OS === 'android') {
    const build = Constants.expoConfig?.android?.versionCode;
    return build != null ? String(build) : '—';
  }
  return '—';
}
