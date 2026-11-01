import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';

export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const challengeFor = verifier => createHash('sha256').update(verifier).digest('base64url');
export const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export function fixedFrontend(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/') || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new Error('FRONTEND_URL must be a fixed HTTPS URL ending in /, without query or fragment');
  return url.toString();
}
export function sameValue(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
}
export function bearer(header) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header || '');
  return match ? match[1] : null;
}

// The conditional UPDATE is the replay barrier. It is atomic across serverless instances.
export async function consumeHandoff(query, code, verifier, state) {
  if (![code,verifier,state].every(validToken)) return null;
  const codeHash=digest(code);
  const result=await query("UPDATE auth_handoffs SET status='consumed' WHERE code_hash=? AND BINARY verifier_challenge=BINARY ? AND client_state_hash=? AND status='ready' AND expires_at > UTC_TIMESTAMP()",[codeHash,challengeFor(verifier),digest(state)]);
  if (result.affectedRows !== 1) return null;
  const rows=await query("SELECT user_id FROM auth_handoffs WHERE code_hash=? AND status='consumed'",[codeHash]);
  return rows[0]?.user_id || null;
}
