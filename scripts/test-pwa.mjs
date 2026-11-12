import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
const html = await readFile(new URL('../index.source.html', import.meta.url), 'utf8')
const main = await readFile(new URL('../src/PwaNotice.tsx', import.meta.url), 'utf8')

assert.equal(manifest.display, 'standalone', 'O manifesto deve abrir em modo standalone.')
assert.equal(manifest.lang, 'pt-BR', 'O idioma do PWA deve ser português do Brasil.')
assert.equal(manifest.start_url, './', 'A URL inicial deve ser relativa ao caminho do manifesto/Pages.')
assert.equal(manifest.scope, './', 'O escopo deve respeitar o subdiretório do GitHub Pages.')
assert(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'))
assert(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'))
assert(html.includes('rel="manifest" href="./manifest.webmanifest"'))
assert(html.includes('apple-mobile-web-app-capable'))
assert(main.includes('updateViaCache: \'none\''), 'A verificação da nova versão do worker não deve depender do cache HTTP.')
assert(main.includes('navigator.serviceWorker.register'))
assert(worker.includes("cache: 'no-store'"), 'Navegações devem consultar a versão mais atual na rede.')
assert(!worker.includes('caches.open') && !worker.includes('cache.put'), 'O worker não deve armazenar respostas, inclusive dados de API.')

console.log('PWA: manifesto, escopo, ícones e política de atualização/cache aprovados.')
