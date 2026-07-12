/**
 * Lekki reverse proxy dla wdrożenia demo w jednym kontenerze.
 * Jeden publiczny port (PORT) -> konfigurator, a ścieżki API tego samego
 * originu przekierowuje do backendu. Dzięki temu frontend woła API bez CORS
 * i bez ujawniania portów wewnętrznych.
 *
 *   /public/*  /files/*  /auth/*  /admin/*  /docs*  -> API (4000)
 *   /panel/*                                        -> panel admina (3001)
 *   pozostałe                                       -> configurator (3000)
 */
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8080);
const API = { host: '127.0.0.1', port: 4000 };
const WEB = { host: '127.0.0.1', port: 3000 };
const ADMIN = { host: '127.0.0.1', port: 3001 };

const API_PREFIXES = ['/public', '/files', '/auth', '/admin', '/docs'];
const ADMIN_PREFIXES = ['/panel'];

function matches(url, prefixes) {
  return prefixes.some((p) => url === p || url.startsWith(p + '/') || url.startsWith(p + '?'));
}

function pick(url) {
  if (matches(url, ADMIN_PREFIXES)) return ADMIN;
  if (matches(url, API_PREFIXES)) return API;
  return WEB;
}

const server = http.createServer((req, res) => {
  const target = pick(req.url ?? '/');
  const proxyReq = http.request(
    { host: target.host, port: target.port, method: req.method, path: req.url, headers: req.headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', () => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Usługa startuje, odśwież za chwilę…');
  });
  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () =>
  console.log(`[proxy] nasłuchuje na :${PORT} -> web:${WEB.port}, admin:${ADMIN.port}, api:${API.port}`),
);
