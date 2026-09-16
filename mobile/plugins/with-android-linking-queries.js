const { withAndroidManifest, createRunOncePlugin } = require('expo/config-plugins');

/** Visibilité package Android 11+ pour mailto, tel, https et WhatsApp. */
function withAndroidLinkingQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const root = manifest.queries?.[0] ?? {};
    const intents = Array.isArray(root.intent) ? [...root.intent] : root.intent ? [root.intent] : [];
    const packages = Array.isArray(root.package) ? [...root.package] : root.package ? [root.package] : [];

    const hasIntent = (scheme) =>
      intents.some((entry) => {
        const data = entry?.data;
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        return rows.some((row) => row?.$?.['android:scheme'] === scheme);
      });

    const hasPackage = (name) => packages.some((pkg) => pkg?.$?.['android:name'] === name);

    const nextIntents = [...intents];
    if (!hasIntent('mailto')) {
      nextIntents.push({
        action: [{ $: { 'android:name': 'android.intent.action.SENDTO' } }],
        data: [{ $: { 'android:scheme': 'mailto' } }],
      });
    }
    if (!hasIntent('tel')) {
      nextIntents.push({
        action: [{ $: { 'android:name': 'android.intent.action.DIAL' } }],
        data: [{ $: { 'android:scheme': 'tel' } }],
      });
    }
    if (!hasIntent('https')) {
      nextIntents.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': 'https' } }],
      });
    }
    if (!hasIntent('http')) {
      nextIntents.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        data: [{ $: { 'android:scheme': 'http' } }],
      });
    }

    const nextPackages = [...packages];
    for (const pkg of ['com.whatsapp', 'com.whatsapp.w4b']) {
      if (!hasPackage(pkg)) {
        nextPackages.push({ $: { 'android:name': pkg } });
      }
    }

    manifest.queries = [
      {
        ...root,
        intent: nextIntents,
        ...(nextPackages.length > 0 ? { package: nextPackages } : {}),
      },
    ];

    return cfg;
  });
}

module.exports = createRunOncePlugin(withAndroidLinkingQueries, 'with-android-linking-queries', '1.0.0');
