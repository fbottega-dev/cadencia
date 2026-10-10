import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

// Run after Vite: hashed JS, CSS and self-hosted fonts all belong to this release.
const output = resolve('dist');
async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(file));
    else if (entry.name !== 'sw.js') result.push(file);
  }
  return result;
}
const files = (await filesIn(output)).sort();
const urls = files.map(file => relative(output, file).split(sep).map(encodeURIComponent).join('/'));
if (!urls.includes('index.html')) throw new Error('Offline: dist/index.html não foi encontrado. Execute o build do Vite primeiro.');
const template = await readFile('public/sw.js', 'utf8');
for (const token of ['self.__PRECACHE__', 'self.__VERSION__']) {
  if (template.split(token).length !== 2) throw new Error(`Offline: o template deve conter exatamente um ${token}.`);
}
const hash = createHash('sha256');
for (let index = 0; index < files.length; index++) {
  const content = await readFile(files[index]);
  hash.update(`${urls[index]}\0${content.byteLength}\0`).update(content);
}
hash.update(template);
const version = hash.digest('hex').slice(0, 16);
const worker = template
  .replace('self.__PRECACHE__', JSON.stringify(urls))
  .replace('self.__VERSION__', JSON.stringify(version));
await writeFile(resolve(output, 'sw.js'), worker);
console.log(`Offline: ${urls.length} recursos, versão ${version}.`);
