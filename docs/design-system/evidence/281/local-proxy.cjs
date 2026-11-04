// Local browser-only bridge for the existing Keycloak localhost:3000 allowlist.
// The production UI itself must already be served on 3100. Binds only loopback 3101.
const http = require('http');
const server = http.createServer((req, res) => {
  const u = new URL(req.url);
  if (u.hostname === 'localhost' && u.port === '3000') u.port = '3100';
  const out = http.request(
    u,
    { method: req.method, headers: { ...req.headers, host: u.host } },
    (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    },
  );
  out.on('error', () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(out);
});
server.on('connect', (req, client, head) => {
  const [host, port] = req.url.split(':');
  const upstream = require('net').connect(
    host === 'localhost' && port === '3000' ? 3100 : Number(port),
    host,
    () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    },
  );
  upstream.on('error', () => client.destroy());
  client.on('error', () => upstream.destroy());
});
server.listen(3101, '127.0.0.1');
