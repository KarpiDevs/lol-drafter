import type { Context, Hono } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { timingSafeEqual } from 'hono/utils/buffer';

const COOKIE = 'draft_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

/**
 * Login con pantalla propia: sin sesión válida el server solo entrega el formulario
 * (ni el cliente, ni íconos, ni la API). La cookie se firma con usuario+contraseña,
 * así que cambiar la contraseña cierra todas las sesiones.
 */
export function installAuth(app: Hono, user: string, password: string) {
  const secret = process.env.AUTH_SECRET ?? `${user}:${password}`;

  app.post('/login', async (c) => {
    const body = await c.req.parseBody();
    const okUser = await timingSafeEqual(String(body.user ?? ''), user);
    const okPass = await timingSafeEqual(String(body.password ?? ''), password);
    if (!okUser || !okPass) {
      await new Promise((r) => setTimeout(r, 700)); // frena intentos por fuerza bruta
      return c.html(loginPage('Usuario o contraseña incorrectos'), 401);
    }
    await setSignedCookie(c, COOKIE, 'ok', secret, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: isHttps(c),
      maxAge: MAX_AGE,
    });
    return c.redirect('/');
  });

  app.get('/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.redirect('/');
  });

  app.use(async (c, next) => {
    if ((await getSignedCookie(c, secret, COOKIE)) === 'ok') return next();
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Sesión expirada' }, 401);
    return c.html(loginPage(), 401);
  });
}

const isHttps = (c: Context) =>
  c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';

function loginPage(error?: string) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Ingresar</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    display: grid; place-items: center; padding: 16px;
    background: #061418; color: #e3eef0;
    font-family: system-ui, -apple-system, sans-serif;
  }
  form {
    width: 100%; max-width: 320px; display: grid; gap: 12px;
    padding: 24px; border: 1px solid #1f444d; border-radius: 8px; background: #0e272e;
  }
  h1 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
  label { display: grid; gap: 4px; font-size: 13px; color: #8aa6ad; }
  input {
    font: inherit; font-size: 16px; color: inherit; padding: 10px 12px;
    background: #061418; border: 1px solid #2a5560; border-radius: 6px;
  }
  input:focus { outline: 2px solid #3b8beb; outline-offset: -1px; }
  button {
    font: inherit; font-weight: 600; padding: 10px; margin-top: 4px; cursor: pointer;
    color: #fff; background: #3b8beb; border: 0; border-radius: 6px;
  }
  .error { margin: 0; font-size: 13px; color: #e5484d; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>Ingresar</h1>
  ${error ? `<p class="error">${error}</p>` : ''}
  <label>Usuario <input name="user" autocomplete="username" autocapitalize="none" required autofocus></label>
  <label>Contraseña <input name="password" type="password" autocomplete="current-password" required></label>
  <button type="submit">Entrar</button>
</form>
</body>
</html>`;
}
