import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
const root = 'public/assets';
async function scan(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) result.push(...await scan(path));
    else if (/\.(png|svg|txt)$/.test(item.name)) {
      const bytes = await readFile(path);
      result.push({ file: relative(root, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  return result.sort((a, b) => a.file.localeCompare(b.file));
}
await writeFile(join(root, 'manifest.json'), JSON.stringify({ verifiedOn: '2026-10-23', assets: await scan(root) }, null, 2) + '\n');
