/**
 * Lekki reverse proxy dla wdrożenia demo w jednym kontenerze.
 * Jeden publiczny port (PORT) -> konfigurator, a ścieżki API tego samego
 * originu przekierowuje do backendu. Dzięki temu frontend woła API bez CORS
 * i bez ujawniania portów wewnętrznych.
 *
 *   /public/*  /files/*  /docs*  -> API (4000)
 *   pozostałe                    -> configurator Next.js (3000)
 */
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8080);
const API = { host: '127.0.0.1', port: 4000 };
const WEB = { host: '127.0.0.1', port: 3000 };

const API_PREFIXES = ['/public', '/files', '/docs'];

function pick(url) {
  return API_PREFIXES.some((p) => url === p || url.startsWith(p + '/') || url.startsWith(p + '?'))
    ? API
    : WEB;
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

server.listen(PORT, '0.0.0.0', () => console.log(`[proxy] nasłuchuje na :${PORT} -> web:${WEB.port}, api:${API.port}`));
