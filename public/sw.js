const APP_PREFIX = new URL('./', self.location.href).pathname

self.addEventListener('install', () => {
  // Uma versão nova aguarda a confirmação do usuário para evitar interromper formulários em andamento.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // O HTML de navegação sempre vem da rede; isso impede uma versão antiga do shell após deploy.
  // Arquivos JS/CSS do Vite têm nomes com hash e podem usar o cache HTTP normal com segurança.
  if (request.method === 'GET' && request.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith(APP_PREFIX)) {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })))
  }
  // Nenhuma resposta é gravada no Cache Storage. Em particular, dados do Supabase nunca são cacheados aqui.
})
