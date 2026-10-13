import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '..', 'exports-png-v4-light', 'AVANT_APRES_teal_mobile.png');
const art = '/opt/cursor/artifacts/theloop-acte-a-v4/AVANT_APRES_teal_mobile.png';

const html = `<!DOCTYPE html><html><head><style>
body{margin:0;display:flex;gap:0;font-family:system-ui}
.half{width:540px;height:1350px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;text-align:center;padding:20px;box-sizing:border-box}
.a{background:linear-gradient(145deg,#a8dce8 0%,#5eb3c4 40%,#3a9aad 75%,#0f7a8e 100%)}
.b{background:linear-gradient(150deg,#6eb8c9 0%,#2d96a8 32%,#0f7a8e 58%,#0a3a44 100%)}
</style></head><body>
<div class="half a">N2<br/>ancien<br/>(clair)</div>
<div class="half b">N2+<br/>nouveau<br/>(plus foncé)</div>
</body></html>`;

const tmp = path.join(dir, '..', '_tmp-compare.html');
fs.writeFileSync(tmp, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
await page.goto(`file://${tmp}`);
await page.screenshot({ path: out });
fs.copyFileSync(out, art);
await browser.close();
fs.unlinkSync(tmp);
console.log('avant/apres exported');
