import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { logger } from 'hono/logger';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { db, ROOT_DIR, runMigrations, schema } from './db';
import { asc } from 'drizzle-orm';
import { cacheImage, championImageUrl, ddragonVersion, IMG_DIR, syncChampions } from './ddragon';
import * as repo from './repo';
import { HttpError } from './repo';
import { poolLimits } from './settings';

runMigrations();

const app = new Hono().basePath('/api');
app.use(logger());

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: err.message || 'Error interno' }, 500);
});

const idParam = (raw: string) => {
  const id = Number(raw);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Id inválido');
  return id;
};

// Config
app.get('/config', (c) => c.json({ ...poolLimits(), ddragonVersion: ddragonVersion() ?? null }));

// Equipos
app.get('/teams', (c) => c.json(repo.listTeams()));
app.post('/teams', async (c) => c.json(repo.createTeam(await c.req.json()), 201));
app.get('/teams/:id', (c) => c.json(repo.getTeam(idParam(c.req.param('id')))));
app.put('/teams/:id', async (c) => c.json(repo.updateTeam(idParam(c.req.param('id')), await c.req.json())));
app.delete('/teams/:id', (c) => {
  repo.deleteTeam(idParam(c.req.param('id')));
  return c.body(null, 204);
});

// Jugadores
app.post('/teams/:id/players', async (c) =>
  c.json(repo.createPlayer(idParam(c.req.param('id')), await c.req.json()), 201),
);
app.get('/players', (c) => {
  const teamId = c.req.query('teamId');
  return c.json(repo.listPlayers(teamId ? idParam(teamId) : undefined));
});
app.get('/players/:id', (c) => c.json(repo.getPlayer(idParam(c.req.param('id')))));
app.put('/players/:id', async (c) => c.json(repo.updatePlayer(idParam(c.req.param('id')), await c.req.json())));
app.delete('/players/:id', (c) => {
  repo.deletePlayer(idParam(c.req.param('id')));
  return c.body(null, 204);
});
app.put('/players/:id/pool', async (c) => {
  const body = await c.req.json();
  // Acepta el array directo o { pool, snapshot, note }
  const pool = Array.isArray(body) ? body : body.pool;
  const note = !Array.isArray(body) && body.snapshot ? (body.note ?? '') : undefined;
  return c.json(repo.replacePool(idParam(c.req.param('id')), pool, note));
});
app.get('/players/:id/history', (c) => c.json(repo.playerHistory(idParam(c.req.param('id')))));

// Comps
app.get('/comps', (c) => c.json(repo.listComps()));
app.post('/comps', async (c) => c.json(repo.createComp(await c.req.json()), 201));
app.put('/comps/:id', async (c) => c.json(repo.updateComp(idParam(c.req.param('id')), await c.req.json())));
app.delete('/comps/:id', (c) => {
  repo.deleteComp(idParam(c.req.param('id')));
  return c.body(null, 204);
});

// Campeones
app.get('/champions', (c) =>
  c.json(db.select().from(schema.champions).orderBy(asc(schema.champions.name)).all()),
);
app.post('/champions/sync', async (c) => {
  const downloadImages = c.req.query('images') === '1';
  return c.json(await syncChampions({ downloadImages }));
});
// Ícono: sirve la copia local; si no existe la baja de Data Dragon y la guarda (modo offline progresivo)
app.get('/champions/img/:file', async (c) => {
  const file = c.req.param('file');
  if (!/^[A-Za-z0-9_]+\.png$/.test(file)) throw new HttpError(400, 'Archivo inválido');
  const path = resolve(IMG_DIR, file);
  if (!existsSync(path)) {
    try {
      await cacheImage(file);
    } catch {
      return c.redirect(championImageUrl(file));
    }
  }
  c.header('Cache-Control', 'public, max-age=604800');
  return c.body(readFileSync(path), 200, { 'Content-Type': 'image/png' });
});

// Drafts
app.get('/drafts', (c) => {
  const rival = c.req.query('rivalTeamId');
  return c.json(repo.listDrafts(rival ? idParam(rival) : undefined));
});
app.post('/drafts', async (c) => c.json(repo.createDraft(await c.req.json()), 201));
app.delete('/drafts/:id', (c) => {
  repo.deleteDraft(idParam(c.req.param('id')));
  return c.body(null, 204);
});

// Producción: un solo proceso sirve la API y el build del cliente, con contraseña opcional
const root = new Hono();

const password = process.env.AUTH_PASSWORD;
if (password) {
  root.use(basicAuth({ username: process.env.AUTH_USER ?? 'politecnica', password }));
}

root.route('/', app);

const CLIENT_DIR = process.env.CLIENT_DIR ?? resolve(ROOT_DIR, 'client/dist');
if (existsSync(CLIENT_DIR)) {
  const indexHtml = readFileSync(resolve(CLIENT_DIR, 'index.html'), 'utf8');
  root.use('/*', serveStatic({ root: CLIENT_DIR }));
  // Fallback para las rutas de React Router (BrowserRouter)
  root.get('*', (c) => c.html(indexHtml));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: root.fetch, port }, () => console.log(`API en http://localhost:${port}/api`));
