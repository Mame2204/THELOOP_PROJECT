import fs from 'fs';
import path from 'path';

/** Copie miroir optionnelle (walkthrough) — ne doit pas bloquer l’export PNG repo. */
export function copyToArtifacts(src, artifactsDir, destName) {
  try {
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.copyFileSync(src, path.join(artifactsDir, destName));
  } catch {
    /* EIO / quota : ignorer */
  }
}
