import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
let resolved = process.env.PLAYWRIGHT_MODULE;
if (!resolved) {
 try { resolved = path.dirname(fileURLToPath(import.meta.resolve('playwright/package.json'))); } catch {
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache'), 'npm-cache', '_npx');
  if (fs.existsSync(cache)) for (const item of fs.readdirSync(cache)) {
   const candidate = path.join(cache, item, 'node_modules', 'playwright');
   if (fs.existsSync(path.join(candidate, 'package.json'))) { resolved = candidate; break; }
  }
 }
}
if (!resolved) throw new Error('Execute npx --yes --package=@playwright/test playwright --version, ou defina PLAYWRIGHT_MODULE.');
export default resolved;
