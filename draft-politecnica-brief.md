# Draft Politécnica — Brief para Claude Code

Proyecto: herramienta local para el equipo de League of Legends de la **Facultad Politécnica (UNA)** en los Juegos Universitarios. Sirve para simular picks y bans y ver, en todo momento, qué campeones le quedan habilitados a cada jugador. Los pools de campeones y sus prioridades se editan desde la app y se guardan en una base de datos local.

La app también permite **dar de alta equipos de otras facultades** (rivales) con sus jugadores y los campeones que juega cada uno. Así, en el draft se puede elegir contra quién se juega y ver los pools de ambos lados: qué nos queda a nosotros y qué le queda al rival, para decidir mejor los bans.

> **Prompt sugerido para arrancar en Claude Code:**
> "Leé `BRIEF.md` y armá el proyecto según la sección *Stack* y *Plan de trabajo*. Empezá por el backend con SQLite y el seed de jugadores, después el editor de pools y por último el simulador de draft. Usá como referencia de UI y lógica el archivo `referencia/draft-politecnica.html`."

---

## 1. Equipo y pools actuales (datos semilla)

10 jugadores, 2 por rol. Cada uno tiene un **Top 5** (prioridad 1 = el mejor) y hasta 3 **complementarios**.

| Rol | Jugador | 1 | 2 | 3 | 4 | 5 | Comp 1 | Comp 2 | Comp 3 |
|---|---|---|---|---|---|---|---|---|---|
| TOP | Cao Cao | Garen | Jayce | Gragas | Malphite | Gangplank | K'Sante | Olaf | Cho'Gath |
| TOP | Mingo | Zac | Gnar | Zaahen | Ornn | Volibear | – | – | – |
| JG | RedFerret | Xin Zhao | Nunu | Maestro Yi | Gragas | Gwen | Shyvana | Amumu | – |
| JG | Foneca | Shyvana | Nunu | Rammus | Amumu | Kayn | Jarvan IV | Sejuani | Cho'Gath |
| MID | Swiftale | Hwei | Mel | Syndra | Taliyah | Seraphine | Lux | Morgana | – |
| MID | JDDLC10 | Hwei | Lissandra | Mel | Syndra | Xerath | Sylas | – | – |
| ADC | Khal | Aphelios | Jinx | Vayne | Smolder | Caitlyn | – | – | – |
| ADC | Karpi | Caitlyn | Yunara | Jinx | Ezreal | Xayah | Lucian | Tristana | – |
| SUPP | Hanzo | Nami | Seraphine | Janna | Milio | Lulu | Morgana | Karma | – |
| SUPP | 0rBiT | Nautilus | Leona | Braum | Poppy | Taric | Morgana | Bardo | Maokai |

Notas:
- "Swiftale" también aparece como Tswiftsale; "0rBiT" como Orbit.
- En la planilla original el campeón de Mingo figuraba como "Zaheen"; el nombre correcto en el juego es **Zaahen**.
- Nombres en español del cliente: "Maestro Yi" (Master Yi), "Bardo" (Bard). Conviene guardar el **id de Data Dragon** de cada campeón y mostrar el nombre localizado.
- Campeones compartidos entre jugadores: Gragas, Nunu, Shyvana, Amumu, Hwei, Mel, Syndra, Jinx, Caitlyn, Seraphine, Morgana, Cho'Gath. Si uno los pickea, se bloquean para el compañero.

## 2. Composiciones de referencia (seed de la pantalla "Comps")

1. **Todos adentro (engage):** Cao Cao Malphite · Foneca Amumu · Swiftale Seraphine · Khal Jinx · 0rBiT Leona
2. **Proteger al ADC:** Mingo Ornn · RedFerret Nunu · JDDLC10 Lissandra · Khal Smolder · Hanzo Lulu
3. **Asedio y poke:** Cao Cao Jayce · RedFerret Gragas · JDDLC10 Xerath · Karpi Caitlyn · Hanzo Janna
4. **Early y snowball:** Mingo Volibear · RedFerret Xin Zhao · Swiftale Taliyah · Karpi Lucian · 0rBiT Nautilus
5. **Frontline:** Cao Cao Garen · Foneca Shyvana · Swiftale Syndra · Karpi Xayah · 0rBiT Braum

Plan de juego y clave de cada una (para el campo `game_plan` / `key_point`):

| Comp | Plan de juego | Clave |
|---|---|---|
| Todos adentro | Agruparse desde mid game y pelear en dragón/barón. Malphite o Amumu entran con la ulti, Leona sigue, Seraphine amplifica y Jinx limpia. | Que el engage sea de a todos juntos. |
| Proteger al ADC | Early tranquilo, Smolder farmea y acumula stacks. Ornn y Nunu adelante, Lissandra y Lulu frenan a quien se le acerque. | No forzar peleas antes de los 25 min. |
| Asedio y poke | Pegar de lejos antes de cada objetivo y tirar torres. Si el rival entra, Janna y Gragas los sacan. | Paciencia: desgastar y tomar objetivos. |
| Early y snowball | Presión desde el minuto 1. Xin Zhao y Taliyah rotan a gankear, Lucian + Nautilus ganan línea. | Cerrar antes de los 25–30 min. |
| Frontline | Garen y Shyvana van al frente, Syndra stunea y Xayah hace daño protegida por Braum. | Pelear de frente 5v5; la más fácil de ejecutar. |

## 3. Lo que ya existe (prototipo)

Hay un prototipo HTML de una sola página (`referencia/draft-politecnica.html`) con toda la lógica del simulador. Portarlo a React respetando este comportamiento:

**Pantalla 1 — Setup**
- Elegir lado: azul (primer ban y primer pick) o rojo (último pick).
- Elegir un jugador por rol entre los dos disponibles.
- *(Nuevo en el proyecto React)* Elegir el equipo rival entre los cargados, y su alineación por rol. Si no hay rival cargado, el draft funciona igual con un rival "genérico" sin pools.

**Pantalla 2 — Draft**
- Orden competitivo de 20 pasos:
  - Bans 1: B R B R B R
  - Picks 1: B R R B B R
  - Bans 2: R B R B
  - Picks 2: R B B R
- Indicador de fase y turno (quién banea/pickea), barra de 20 pasos con el progreso.
- Tablero con los dos equipos: 5 slots de ban (3 + 2) y 5 slots de pick por lado. Nuestros picks se muestran por rol y jugador.
- **Tarjeta por jugador** con su pool ordenado por prioridad (1–5 y "C" para complementarios) y contador "X de N disponibles". Estados de cada campeón:
  - Disponible.
  - Baneado (por cualquiera de los dos equipos): gris, tachado, etiqueta "Ban".
  - Pickeado por el rival: gris, etiqueta "Rival".
  - Pickeado por un compañero: gris, etiqueta con el nombre del compañero.
  - Pick propio: resaltado.
- En nuestros turnos de pick: tocar un campeón en la tarjeta de un jugador se lo asigna a ese jugador. También se puede elegir desde la grilla general, asignándolo al jugador seleccionado en "Pick para:".
- Grilla con todos los campeones, buscador (Enter elige si hay un solo resultado) y filtro "Solo nuestro pool". Un punto marca los que están en nuestro pool.
- Botones: Saltar ban, Deshacer, Reiniciar draft, Cambiar jugadores.

Lo que faltaba y motiva este proyecto: **íconos reales de los campeones** (el artefacto no podía cargar imágenes externas), **pools editables y persistentes** y **equipos rivales**.

**Extensiones del draft con equipo rival (nuevo)**
- Si se eligió un rival, mostrar también una tarjeta por cada jugador rival con su pool, con los mismos estados (disponible, ban, pickeado). El layout queda espejado: nuestros pools de un lado, los del rival del otro (en el celular, pestañas "Nosotros / Rival").
- Los picks del rival se pueden asignar a un jugador rival concreto (igual que los nuestros), o quedar sin asignar si no sabemos quién lo juega.
- **Sugerencias de ban**: en nuestros turnos de ban, destacar los campeones de mayor prioridad del rival que siguen disponibles (por ejemplo, el top 1–2 de cada jugador rival). También avisar cuando un ban del rival nos deja a un jugador con 2 o menos campeones disponibles.
- **Campeones en común**: marcar los campeones que están tanto en nuestro pool como en el del rival; son candidatos a pick prioritario porque al tomarlos se los sacamos al otro.

## 4. Stack propuesto

Monorepo simple, todo local, sin servicios externos salvo Data Dragon.

- **Frontend:** Vite + React + TypeScript. Estado del draft con `useReducer` (lista de acciones + índice de paso → deshacer es `pop`). Fetch con TanStack Query.
- **Backend:** Node + **Hono** (o Express) con una API REST chica.
- **Base de datos:** **SQLite** con `better-sqlite3` y **Drizzle ORM** (migraciones y seed tipados). Un solo archivo `data/draft.db`, no requiere levantar ningún servidor de base de datos y se puede respaldar copiando el archivo.
- Scripts: `npm run dev` levanta API y front juntos (`concurrently`), `npm run db:seed` carga los datos de la sección 1.

Alternativa si no se quiere escribir backend: **PocketBase** (un binario, SQLite por dentro, panel de admin incluido y API REST automática). Es más rápido de arrancar, pero da menos control sobre la lógica.

## 5. Modelo de datos

```
teams
  id            integer pk
  name          text unique        -- "Politécnica", "Ingeniería", "Medicina"…
  short_name    text null          -- "POLI", "FIUNA"
  faculty       text null          -- nombre completo de la facultad
  is_own        integer default 0  -- 1 solo para nuestro equipo (Politécnica)
  notes         text null          -- estilo de juego, observaciones de scouting
  created_at    text

players
  id            integer pk
  team_id       integer fk -> teams
  name          text               -- "Cao Cao", "0rBiT"
  role          text               -- TOP | JG | MID | ADC | SUPP
  aliases       text null          -- "Tswiftsale", "Orbit"
  riot_id       text null          -- "Nombre#TAG", útil para scouting de rivales
  active        integer default 1
  unique (team_id, name)

champions                          -- cache de Data Dragon
  id            text pk            -- id DDragon: "MonkeyKing", "Chogath", "KSante"
  name          text               -- nombre localizado: "Wukong", "Cho'Gath"
  image         text               -- "Chogath.png"
  tags          text               -- JSON: ["Tank","Mage"]

player_champions
  player_id     integer fk
  champion_id   text fk
  tier          text               -- 'top' | 'comp'
  priority      integer            -- orden dentro del tier (1 = mejor)
  notes         text null
  updated_at    text
  pk (player_id, champion_id)

pool_history                       -- opcional: ver cómo cambian las prioridades entre prácticas
  id, player_id, snapshot_json, created_at, note

comps                              -- composiciones del equipo propio
  id            integer pk
  name          text               -- "Todos adentro"
  style         text               -- engage | protect | poke | early | frontline | otro
  game_plan     text
  key_point     text
  active        integer default 1
  created_at, updated_at

comp_slots                         -- un slot por rol (5 por comp)
  comp_id       integer fk -> comps
  role          text               -- TOP | JG | MID | ADC | SUPP
  player_id     integer fk -> players
  champion_id   text fk -> champions
  pk (comp_id, role)

comp_alternatives                  -- opcional: reemplazos si banean el campeón principal
  comp_id, role, champion_id, priority

drafts                             -- opcional: guardar drafts simulados o reales
  id, side, own_team_id, rival_team_id null,
  own_lineup_json, rival_lineup_json, actions_json, result null, notes, created_at
```

Reglas:
- Máximo 5 en `tier = 'top'` y 3 en `tier = 'comp'` por jugador (validar en la API; dejar los límites configurables).
- Exactamente un equipo con `is_own = 1`. El seed crea "Politécnica" con los 10 jugadores de la sección 1.
- Los equipos rivales pueden tener cualquier cantidad de jugadores por rol (titulares y suplentes) y pools incompletos: muchas veces solo vamos a conocer 2 o 3 campeones de cada rival. La app tiene que funcionar bien con pools vacíos o parciales.
- Borrar un equipo borra en cascada sus jugadores y pools (pedir confirmación en la UI).

## 6. API

```
GET    /api/teams                       -- todos los equipos (con cantidad de jugadores)
POST   /api/teams                       -- alta de equipo {name, shortName, faculty, notes}
GET    /api/teams/:id                   -- equipo con jugadores y sus pools ordenados
PUT    /api/teams/:id
DELETE /api/teams/:id                   -- no permitir borrar el equipo propio

POST   /api/teams/:id/players           -- alta de jugador {name, role, aliases, riotId}
PUT    /api/players/:id                 -- editar nombre, rol, activo
DELETE /api/players/:id
GET    /api/players?teamId=             -- jugadores con su pool ordenado
GET    /api/players/:id
PUT    /api/players/:id/pool            -- reemplaza el pool completo [{championId, tier, priority}]
GET    /api/comps                       -- comps con sus 5 slots (jugador + campeón) y alternativas
POST   /api/comps
PUT    /api/comps/:id                   -- reemplaza datos y slots
DELETE /api/comps/:id
GET    /api/champions                   -- lista cacheada
POST   /api/champions/sync              -- vuelve a bajar champion.json de Data Dragon
GET    /api/drafts | POST /api/drafts   -- opcional
GET    /api/players/:id/history         -- opcional
```

## 7. Data Dragon (íconos y lista de campeones)

- Última versión: `https://ddragon.leagueoflegends.com/api/versions.json` (primer elemento).
- Lista de campeones en español: `https://ddragon.leagueoflegends.com/cdn/{version}/data/es_AR/champion.json` (si no existe el locale, usar `es_ES` o `es_MX`).
- Ícono cuadrado: `https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{image.full}`.
- El sync guarda id, nombre e imagen en la tabla `champions`; al hacer el seed, mapear los nombres de la sección 1 a ids buscando por nombre localizado y por nombre en inglés (ej.: "Maestro Yi" → `MasterYi`, "Bardo" → `Bard`, "Nunu" → `Nunu`, "Jarvan IV" → `JarvanIV`, "K'Sante" → `KSante`, "Cho'Gath" → `Chogath`). Si algún nombre no matchea (por ejemplo un campeón nuevo como Zaahen o Yunara), loguearlo para corregirlo a mano.
- Opcional: descargar los PNG a `public/champions/` en el sync para que la app funcione sin internet durante un torneo.

## 8. Pantallas de la app

1. **Equipos** (nueva): lista de equipos con nombre, facultad y cantidad de jugadores; el nuestro aparece primero y marcado. Botón "Nuevo equipo" con un formulario corto (nombre, abreviatura, facultad, notas). Al entrar a un equipo se ve su plantel agrupado por rol, con alta, edición y baja de jugadores.
2. **Pools** (dentro de cada equipo): una tarjeta por jugador con dos listas (Top 5 y Complementarios). Reordenar con drag and drop (`@dnd-kit/sortable`), mover entre listas, agregar desde un buscador con íconos, quitar. Botón "Guardar" que llama a `PUT /pool` y opcionalmente guarda un snapshot en `pool_history` con una nota ("práctica 12/10"). Es la misma pantalla para nuestro equipo y para los rivales.
   - Carga rápida para rivales: permitir pegar una lista de texto por jugador ("Garen, Darius, Sett") y que se resuelva contra la tabla de campeones.
3. **Draft**: el simulador de la sección 3, leyendo los pools desde la API, con selección de rival y sus pools. Cualquier cambio guardado en Pools se refleja al volver al draft.
4. **Comps**: catálogo de composiciones del equipo, sembrado con las 5 de la sección 2.
   - Cada comp es una tarjeta con nombre, estilo, los 5 slots (rol, jugador, ícono del campeón), plan de juego y clave. Filtro por estilo.
   - Crear y editar comps: por cada rol se elige el jugador y un campeón **de su pool** (el selector muestra solo su pool; avisar si un campeón ya no está en el pool del jugador porque cambió de prioridad). Opcionalmente, 1–2 alternativas por rol.
   - **Viabilidad en vivo durante el draft**: un panel (o pestaña en el celular) dentro del Draft muestra las comps con su estado según las acciones actuales:
     - *Viable*: todos sus campeones disponibles o ya pickeados por el jugador indicado.
     - *Con reemplazo*: algún campeón cayó pero hay alternativa disponible (mostrar cuál).
     - *Rota*: un campeón sin alternativa fue baneado o tomado.
     - Ordenar viables primero y mostrar "X de 5 listos". Un slot caído se muestra en gris como en las tarjetas de pool.
   - Desde una comp viable, botón "Seguir esta comp": resalta en las tarjetas de pool los campeones de esa comp para que el próximo pick sea un click. Si la comp elige un jugador distinto al de la alineación actual, avisarlo.
   - Si hay rival cargado, indicar en cada comp qué campeones también están en el pool del rival (riesgo de que lo pickeen primero).
5. **Historial** (opcional): drafts guardados (filtrables por rival) y cambios de prioridad por jugador.

## 9. Plan de trabajo

1. Crear el monorepo (Vite React TS + servidor Hono), configurar Drizzle con SQLite.
2. Escribir el schema y las migraciones; script de sync de Data Dragon; seed del equipo Politécnica con sus jugadores y pools.
3. Endpoints de equipos, jugadores, pools y campeones.
4. Pantallas de Equipos y Pools con alta, edición y guardado (sirven para nuestro equipo y para los rivales).
5. Portar el simulador de draft con íconos, consumiendo la API.
6. Agregar al draft la selección de rival, sus pools, sugerencias de ban y campeones en común.
7. Pantalla de Comps (catálogo + editor, con seed de la sección 2) y panel de viabilidad dentro del Draft.
8. Extras: drafts guardados, historial de prioridades, modo offline de imágenes.

## 10. Detalles de diseño del prototipo

- Tema oscuro tipo pantalla de draft: fondo azul petróleo muy oscuro, lado azul y lado rojo como colores de equipo, un acento dorado para "nuestro" (picks propios, jugador seleccionado).
- Tipografías: Barlow Condensed para títulos y etiquetas, Barlow para el cuerpo.
- Debe funcionar en el celular: el tablero y las tarjetas se apilan en una columna.
