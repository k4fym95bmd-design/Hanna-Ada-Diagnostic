// Windows/local serial bridge. USB enumeration and port open/close ONLY.
// Intentionally exposes NO arbitrary TX/RX, BMW requests, actuator, DTC erase or flash endpoints.
// Run locally; never deploy to Railway, Vercel or another cloud host.
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MAX_BODY = 2048;
const isLoopback = host => ['127.0.0.1', 'localhost', '::1'].includes(host);
const validPort = p => p && typeof p.path === 'string' && p.path.length > 0 && p.path.length <= 240;
const safePort = p => ({ path: p.path, manufacturer: String(p.manufacturer || '').slice(0, 100), vendorId: p.vendorId || null, productId: p.productId || null });
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body)); };

export function createCableBridge({ serial, token, allowedOrigin, host = '127.0.0.1', tls = null } = {}) {
  if (!serial || typeof serial.list !== 'function' || typeof serial.createPort !== 'function') throw new TypeError('A serial driver is required');
  if (typeof token !== 'string' || token.length < 32) throw new TypeError('A random token of at least 32 characters is required');
  if (typeof allowedOrigin !== 'string' || !/^https?:\/\/[^/]+$/.test(allowedOrigin)) throw new TypeError('Set an exact allowed browser origin');
  if (!isLoopback(host) && !tls) throw new TypeError('LAN access requires a trusted HTTPS certificate');
  let selected = null, active = null, sessionId = null, busy = false;
  const equalToken = candidate => {
    const provided = Buffer.from(candidate || '');
    const expected = Buffer.from(token);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  };
  const currentStatus = async () => {
    const ports = (await serial.list()).filter(validPort);
    const detected = selected !== null && ports.some(p => p.path === selected);
    const opened = !!(detected && active?.isOpen);
    return { version: 1, transport: 'physical-vci', cableDetected: detected, portOpen: opened,
      selectedPath: detected ? selected : null, sessionId: opened ? sessionId : null,
      ecuVerified: false, writesEnabled: false, flashEnabled: false,
      message: opened ? 'Port USB-serial otwarty. ECU niezweryfikowane.' : detected ? 'Kabel wybrany; port zamknięty.' : 'Nie wybrano wykrytego kabla.' };
  };
  const readBody = async req => {
    let data = '';
    for await (const chunk of req) {
      data += chunk.toString('utf8');
      if (Buffer.byteLength(data) > MAX_BODY) throw new Error('BODY_TOO_LARGE');
    }
    try { return JSON.parse(data || '{}'); } catch { throw new Error('INVALID_JSON'); }
  };
  const handler = async (req, res) => {
    try {
      const origin = req.headers.origin;
      if (origin && origin !== allowedOrigin) return json(res, 403, { error: 'ORIGIN_DENIED' });
      if (origin === allowedOrigin) {
        res.setHeader('access-control-allow-origin', allowedOrigin);
        res.setHeader('vary', 'Origin');
        res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
        res.setHeader('access-control-allow-headers', 'Authorization, Content-Type');
      }
      if (req.method === 'OPTIONS') return origin === allowedOrigin ? (res.writeHead(204), res.end()) : json(res, 403, { error: 'ORIGIN_DENIED' });
      if (!equalToken((req.headers.authorization || '').replace(/^Bearer /, ''))) return json(res, 401, { error: 'UNAUTHORIZED' });
      const route = new URL(req.url || '/', 'http://local.invalid').pathname;
      if (req.method === 'GET' && route === '/v1/status') return json(res, 200, await currentStatus());
      if (req.method === 'GET' && route === '/v1/ports') {
        const ports = (await serial.list()).filter(validPort).map(safePort);
        return json(res, 200, { ports, selectedPath: selected });
      }
      if (req.method === 'POST' && route === '/v1/open') {
        if (busy || active?.isOpen) return json(res, 409, { error: 'PORT_BUSY' });
        busy = true;
        try {
          const body = await readBody(req);
          if (typeof body.path !== 'string' || body.path.length > 240) return json(res, 400, { error: 'INVALID_PORT' });
          const matches = (await serial.list()).filter(validPort).filter(p => p.path === body.path);
          if (matches.length !== 1) return json(res, 404, { error: 'PORT_NOT_ENUMERATED' });
          const port = serial.createPort(matches[0].path);
          if (!port || typeof port.open !== 'function' || typeof port.close !== 'function') throw new Error('DRIVER_UNAVAILABLE');
          await new Promise((resolve, reject) => port.open(err => err ? reject(err) : resolve()));
          active = port; selected = matches[0].path; sessionId = randomBytes(20).toString('hex');
          const localSession = sessionId;
          port.on?.('close', () => { if (sessionId === localSession) { active = null; sessionId = null; } });
          return json(res, 200, await currentStatus());
        } finally { busy = false; }
      }
      if (req.method === 'POST' && route === '/v1/close') {
        if (busy) return json(res, 409, { error: 'PORT_BUSY' });
        busy = true;
        try {
          if (active?.isOpen) await new Promise((resolve, reject) => active.close(err => err ? reject(err) : resolve()));
          active = null; selected = null; sessionId = null;
          return json(res, 200, await currentStatus());
        } finally { busy = false; }
      }
      return json(res, 404, { error: 'UNKNOWN_ROUTE' });
    } catch (err) {
      return json(res, err.message === 'INVALID_JSON' || err.message === 'BODY_TOO_LARGE' ? 400 : 503,
        { error: err.message === 'INVALID_JSON' || err.message === 'BODY_TOO_LARGE' ? err.message : 'BRIDGE_UNAVAILABLE' });
    }
  };
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  server.on('close', () => { try { if (active?.isOpen) active.close(); } catch {} });
  return { server, host, getStatus: currentStatus };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = process.env.HAA_BRIDGE_HOST || '127.0.0.1';
  const tls = process.env.HAA_BRIDGE_TLS_CERT && process.env.HAA_BRIDGE_TLS_KEY
    ? { cert: readFileSync(process.env.HAA_BRIDGE_TLS_CERT), key: readFileSync(process.env.HAA_BRIDGE_TLS_KEY) } : null;
  try {
    const { SerialPort } = await import('serialport');
    const bridge = createCableBridge({
      token: process.env.HAA_BRIDGE_TOKEN,
      allowedOrigin: process.env.HAA_BRIDGE_ORIGIN,
      host, tls,
      serial: { list: () => SerialPort.list(), createPort: path => new SerialPort({ path, baudRate: 9600, autoOpen: false }) },
    });
    const port = Number(process.env.HAA_BRIDGE_PORT || 8765);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid bridge TCP port');
    bridge.server.listen(port, host, () => console.log(`Hanna & Ada USB bridge: ${tls ? 'https' : 'http'}://${host}:${port} (USB-only, no ECU commands)`));
  } catch (err) {
    console.error('Bridge startup blocked:', err.message);
    process.exitCode = 1;
  }
}
