/**
 * Convertit les fichiers Markdown de ce dossier en .docx (Word).
 * Usage : node DocumentationsTheLoop/convert-to-docx.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toDocx } from 'md-to-docx';
import { tablePlugin } from '@m2d/table';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FILES_ORDER = [
  'README.md',
  '01-Vue-Ensemble-Fonctionnelle.md',
  '02-Architecture-Technique-Etat-Actuel.md',
  '03-Referentiel-Complet-Tables-Supabase.md',
  '04-Parametres-Purge-Seed-Ecarts.md',
  '05-Cache-Local-Telephone-AsyncStorage.md',
  '06-Roles-Permissions-Navigation.md',
];

function parseMarkdown(md) {
  return unified().use(remarkParse).use(remarkGfm).parse(md);
}

async function mdFileToDocxBuffer(mdPath) {
  const md = fs.readFileSync(mdPath, 'utf8');
  const ast = parseMarkdown(md);
  const result = await toDocx(
    ast,
    {
      title: path.basename(mdPath, '.md'),
      creator: 'THE LOOP',
      description: 'Documentation technique THE LOOP',
    },
    {
      plugins: [tablePlugin()],
    },
    'nodebuffer',
  );
  return result;
}

async function main() {
  const wordDir = path.join(__dirname, 'Word');
  fs.mkdirSync(wordDir, { recursive: true });

  const sectionAsts = [];

  for (const name of FILES_ORDER) {
    const mdPath = path.join(__dirname, name);
    if (!fs.existsSync(mdPath)) {
      console.warn('Ignoré (absent):', name);
      continue;
    }

    const docxName = name.replace(/\.md$/i, '.docx');
    const outPath = path.join(wordDir, docxName);
    const buffer = await mdFileToDocxBuffer(mdPath);
    fs.writeFileSync(outPath, buffer);
    console.log('OK', docxName);

    const md = fs.readFileSync(mdPath, 'utf8');
    sectionAsts.push({
      ast: parseMarkdown(`\n\n---\n\n${md}`),
      props: { plugins: [tablePlugin()] },
    });
  }

  if (sectionAsts.length) {
    const combined = await toDocx(
      sectionAsts,
      {
        title: 'THE LOOP — Documentation complète',
        creator: 'THE LOOP',
        description: 'Documentation technique, fonctionnelle et référentiel tables — état actuel',
      },
      { plugins: [tablePlugin()] },
      'nodebuffer',
    );
    const combinedPath = path.join(wordDir, 'THE_LOOP_Documentation_Complete.docx');
    fs.writeFileSync(combinedPath, combined);
    console.log('OK THE_LOOP_Documentation_Complete.docx');
  }

  console.log('\nFichiers Word dans:', wordDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
