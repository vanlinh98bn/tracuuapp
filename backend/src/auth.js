/* =============================================================
   Đăng nhập bằng Microsoft 365 (Microsoft Entra ID, OpenID Connect + PKCE)
   - Phiên đăng nhập lưu trong bảng sessions; cookie chỉ giữ mã ngẫu nhiên.
   - Người dùng khóa (is_active = false) mất quyền ngay ở yêu cầu kế tiếp.
   ============================================================= */
import crypto from 'node:crypto';
import express from 'express';
import { ConfidentialClientApplication, CryptoProvider } from '@azure/msal-node';
import { config, entraEnabled } from './config.js';
import { query, audit, clientIp } from './db.js';

const SID = 'qc_sid';
const LOGIN = 'qc_login';
const SCOPES = ['openid', 'profile', 'email'];
const secureCookie = config.publicUrl.startsWith('https://');
const redirectUri = config.publicUrl + '/auth/callback';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

/* ---------- Cookie ---------- */
function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* bỏ qua cookie lỗi */ } }
  });
  return out;
}
const cookieOpts = (extra) => Object.assign({ httpOnly: true, secure: secureCookie, sameSite: 'lax', path: '/' }, extra);
const hmac = (s) => crypto.createHmac('sha256', config.sessionSecret).update(s).digest('base64url');
function sign(obj) { const s = Buffer.from(JSON.stringify(obj)).toString('base64url'); return s + '.' + hmac(s); }
function unsign(v) {
  const [s, mac] = String(v || '').split('.');
  if (!s || !mac) return null;
  const a = Buffer.from(hmac(s)), b = Buffer.from(mac);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(s, 'base64url').toString()); } catch { return null; }
}

/* ---------- Phiên đăng nhập ---------- */
async function createSession(req, res, user, remember) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ms = remember ? config.sessionRememberDays * 864e5 : config.sessionHours * 36e5;
  await query('INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent) VALUES ($1, $2, now() + $3 * interval \'1 millisecond\', $4, $5)',
    [sha256(token), user.id, ms, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 300)]);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  // Không "Ghi nhớ": cookie mất khi đóng trình duyệt (máy chủ vẫn giới hạn SESSION_HOURS)
  res.cookie(SID, token, cookieOpts(remember ? { maxAge: ms } : {}));
  req.user = user;
  await audit(req, 'login', { detail: { remember: !!remember } });
}

/* Gắn req.user nếu có phiên hợp lệ */
export async function loadUser(req, res, next) {
  const token = cookies(req)[SID];
  if (token) {
    const r = await query(`SELECT u.id, u.email, u.full_name, u.department, u.role
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`, [sha256(token)]);
    if (r.rows[0]) req.user = r.rows[0];
  }
  next();
}
export const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'unauthenticated' }));
export const requireAdmin = (req, res, next) => (!req.user ? res.status(401).json({ error: 'unauthenticated' })
  : req.user.role !== 'admin' ? res.status(403).json({ error: 'forbidden' }) : next());

/* Tìm người dùng theo Object ID / email; tạo mới nếu được phép. Lỗi → mã để hiện trên trang đăng nhập. */
async function findOrCreateUser({ oid, email, name }) {
  email = String(email || '').trim().toLowerCase();
  if (!email.includes('@')) throw new LoginError('no_email');
  if (config.allowedDomains.length && !config.allowedDomains.includes(email.split('@').pop())) throw new LoginError('domain');
  const r = await query(`SELECT * FROM users WHERE ($1::uuid IS NOT NULL AND entra_oid = $1::uuid) OR email = $2
    ORDER BY (entra_oid IS NOT DISTINCT FROM $1::uuid) DESC LIMIT 1`, [oid || null, email]);
  let user = r.rows[0];
  if (user) {
    if (!user.is_active) throw new LoginError('inactive');
    const u = await query(`UPDATE users SET entra_oid = COALESCE(entra_oid, $2::uuid), email = $3,
      full_name = CASE WHEN $4 <> '' THEN $4 ELSE full_name END WHERE id = $1 RETURNING *`, [user.id, oid || null, email, name || '']);
    return u.rows[0];
  }
  if (!config.autoCreateUsers) throw new LoginError('not_registered');
  const ins = await query('INSERT INTO users (entra_oid, email, full_name) VALUES ($1, $2, $3) RETURNING *', [oid || null, email, name || email]);
  return ins.rows[0];
}
class LoginError extends Error { constructor(code) { super(code); this.code = code; } }

let msal;
const cca = () => msal || (msal = new ConfidentialClientApplication({
  auth: {
    clientId: config.entra.clientId,
    authority: `https://login.microsoftonline.com/${config.entra.tenantId}`,
    clientSecret: config.entra.clientSecret,
  },
}));

/* ---------- Đường dẫn /auth/* ---------- */
export const authRouter = express.Router();

authRouter.get('/login', async (req, res) => {
  if (!entraEnabled()) return res.redirect('/?err=entra_off');
  const { verifier, challenge } = await new CryptoProvider().generatePkceCodes();
  const state = crypto.randomBytes(16).toString('base64url');
  const url = await cca().getAuthCodeUrl({
    scopes: SCOPES, redirectUri, state, prompt: 'select_account',
    codeChallenge: challenge, codeChallengeMethod: 'S256',
  });
  res.cookie(LOGIN, sign({ state, v: verifier, r: req.query.remember === '1' ? 1 : 0, t: Date.now() }),
    cookieOpts({ path: '/auth', maxAge: 10 * 60e3 }));
  res.redirect(url);
});

authRouter.get('/callback', async (req, res) => {
  const st = unsign(cookies(req)[LOGIN]);
  res.clearCookie(LOGIN, cookieOpts({ path: '/auth' }));
  if (req.query.error) return res.redirect('/?err=ms');
  if (!st || st.state !== req.query.state || Date.now() - st.t > 10 * 60e3 || !req.query.code) return res.redirect('/?err=state');
  let email = '';
  try {
    const result = await cca().acquireTokenByCode({ code: String(req.query.code), scopes: SCOPES, redirectUri, codeVerifier: st.v });
    const c = result.idTokenClaims || {};
    email = String(c.preferred_username || c.email || c.upn || '').slice(0, 320);
    if (c.tid !== config.entra.tenantId) throw new LoginError('tenant');
    const user = await findOrCreateUser({ oid: c.oid, email, name: c.name });
    await createSession(req, res, user, st.r === 1);
    res.redirect('/');
  } catch (e) {
    if (e instanceof LoginError) {
      await audit(req, 'login_denied', { detail: { reason: e.code, email } });
      return res.redirect('/?err=' + e.code);
    }
    console.error('Đăng nhập Microsoft lỗi:', e.message);
    res.redirect('/?err=ms');
  }
});

/* Đăng nhập thử không cần Microsoft: chỉ khi DEV_LOGIN=true, không phải production, và truy cập từ chính máy này */
const isLoopback = (req) => /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(req.socket.remoteAddress || '');
authRouter.get('/dev-login', async (req, res) => {
  if (!config.devLogin || config.production || !isLoopback(req)) return res.status(404).end();
  try {
    const user = await findOrCreateUser({ email: req.query.email, name: '' });
    await createSession(req, res, user, req.query.remember === '1');
    res.redirect('/');
  } catch (e) {
    if (!(e instanceof LoginError)) throw e;
    await audit(req, 'login_denied', { detail: { reason: e.code, email: String(req.query.email || '').slice(0, 320), dev: true } });
    res.redirect('/?err=' + e.code);
  }
});

authRouter.post('/logout', async (req, res) => {
  const token = cookies(req)[SID];
  if (token) {
    if (req.user) await audit(req, 'logout');
    await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  }
  res.clearCookie(SID, cookieOpts());
  res.json({ ok: true });
});

authRouter.get('/options', (req, res) => {
  res.json({ microsoft: entraEnabled(), dev: config.devLogin && !config.production && isLoopback(req) });
});

/* Dọn phiên hết hạn mỗi giờ */
export function startSessionCleanup() {
  const run = () => query('DELETE FROM sessions WHERE expires_at < now()').catch((e) => console.error('Dọn phiên lỗi:', e.message));
  run();
  setInterval(run, 36e5).unref();
}
