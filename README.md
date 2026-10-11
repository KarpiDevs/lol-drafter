# Draft Politécnica

Herramienta local para simular picks y bans del equipo de LoL de la Facultad Politécnica (UNA): pools editables por jugador, equipos rivales, sugerencias de ban y viabilidad de comps en vivo.

## Arranque

```bash
npm install          # instala raíz, server/ y client/
npm run db:seed      # crea data/draft.db, baja los campeones de Data Dragon y carga a Politécnica + 5 comps
npm run dev          # API en :8787 y web en http://localhost:5173 (también accesible desde el celu en la misma red)
```

El seed es idempotente: se puede volver a correr para restaurar los pools y comps originales del equipo propio (no toca rivales).

## Series y fearless

En el setup del draft se elige BO1, BO3 o BO5. En series, al terminar cada partida se marca "Ganamos" o "Perdimos" (queda guardada en Historial) y se elige el lado de la siguiente. Los campeones pickeados en partidas anteriores se bloquean solos:

- **Fearless completo** (por defecto): lo que pickeó cualquiera de los dos equipos queda bloqueado para ambos.
- **Por equipo**: cada equipo solo pierde sus propios picks.

Los bans no se arrastran entre partidas. "Volver a la partida N" reabre la última partida si se cargó mal el resultado.

## Scripts útiles

| Script | Qué hace |
|---|---|
| `npm run champions:sync` | Vuelve a bajar la lista de campeones (nueva versión del juego) |
| `npm run champions:offline` | Descarga todos los íconos a `data/champions/` para jugar sin internet |
| `npm test` | Tests de la lógica del draft |
| `npm run typecheck` | Chequeo de tipos de server y client |
| `npm run db:generate` | Genera una migración nueva tras cambiar `server/src/db/schema.ts` |

Respaldo: copiar `data/draft.db`.

## Estructura

- `server/` — Hono + better-sqlite3 + Drizzle. Schema en `src/db/schema.ts`, rutas en `src/index.ts`, lógica en `src/repo.ts`, Data Dragon en `src/ddragon.ts`, seed en `src/seed.ts`. Las migraciones se aplican solas al arrancar.
- `client/` — Vite + React + TanStack Query + dnd-kit. La lógica pura del draft (orden de 20 pasos, estados, sugerencias, viabilidad de comps) está en `src/lib/draft.ts`.

## Configuración

- Límites de pool: `MAX_TOP` (5) y `MAX_COMP` (3) como variables de entorno del server.
- `PORT` (8787), `DB_PATH`, `IMG_DIR` opcionales.

## Deploy (Google Cloud e2-micro + Docker)

Cada push a `main` dispara GitHub Actions, que construye la imagen y la sube a `ghcr.io/<usuario>/<repo>:latest`. La VM revisa cada 5 minutos si hay una imagen nueva y, si la hay, reinicia la app. La base vive en `deploy/data/` y no se toca al actualizar.

**Una sola vez:**

1. Subir el repo a GitHub y esperar a que termine el workflow **Docker**.
2. En GitHub → *Packages* → el paquete → *Package settings*, cambiar la visibilidad a **Public**. Si queda privado, hay que correr `docker login ghcr.io` en la VM con un token que tenga `read:packages`.
3. Crear la VM: e2-micro, Debian 12, región `us-central1`, `us-west1` o `us-east1` (las del free tier), con **Allow HTTP** y **Allow HTTPS** tildados.
4. Copiar la carpeta y correr el setup:
   ```bash
   gcloud compute scp --recurse deploy <vm>:~/draft
   gcloud compute ssh <vm> -- 'cd ~/draft && ./setup.sh'
   ```
   El setup pide la imagen, el dominio (por defecto `<ip>.sslip.io`, que sirve para HTTPS sin comprar dominio) y la contraseña.

**Después:** `git push` y en unos minutos está online.

**Respaldos:** quedan en `deploy/backups/` (uno por día, se guardan los últimos 14). Para restaurar uno: `docker compose stop app`, copiar el backup a `data/draft.db`, borrar `data/draft.db-wal` y `data/draft.db-shm`, y `docker compose start app`.

Variables nuevas del server: `AUTH_PASSWORD` (si está definida, pide usuario y contraseña) y `AUTH_USER` (por defecto `politecnica`).
