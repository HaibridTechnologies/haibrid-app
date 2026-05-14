const LOG_URL = 'http://localhost:3000/api/ext-log';

function serialize(args) {
  return args.map(a => {
    if (a === null) return 'null';
    if (a === undefined) return 'undefined';
    if (typeof a === 'object') { try { return JSON.stringify(a); } catch { return String(a); } }
    return String(a);
  }).join(' ');
}

function send(level, args) {
  const msg = serialize(args);
  fetch(LOG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, msg }),
  }).catch(() => {}); // fire-and-forget; never throw
}

export const log   = (...args) => send('info',  args);
export const warn  = (...args) => send('warn',  args);
export const error = (...args) => send('error', args);
