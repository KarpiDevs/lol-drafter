/**
 * Seed: equipo Politécnica con sus 10 jugadores y pools, y las 5 comps de referencia.
 * Es idempotente: si el equipo/jugador/comp ya existe, lo actualiza.
 * Uso: npm run db:seed   (con --sync vuelve a bajar los campeones de Data Dragon)
 */
import { and, eq } from 'drizzle-orm';
import { db, runMigrations, schema } from './db';
import type { Role } from './db/schema';
import { championResolver, syncChampions } from './ddragon';
import { createComp, updateComp, replacePool } from './repo';

type SeedPlayer = { name: string; role: Role; aliases?: string; top: string[]; comp: string[] };

const PLAYERS: SeedPlayer[] = [
  { name: 'Cao Cao', role: 'TOP', top: ['Garen', 'Jayce', 'Gragas', 'Malphite', 'Gangplank'], comp: ["K'Sante", 'Olaf', "Cho'Gath"] },
  { name: 'Mingo', role: 'TOP', top: ['Zac', 'Gnar', 'Zaahen', 'Ornn', 'Volibear'], comp: [] },
  { name: 'RedFerret', role: 'JG', top: ['Xin Zhao', 'Nunu', 'Maestro Yi', 'Gragas', 'Gwen'], comp: ['Shyvana', 'Amumu'] },
  { name: 'Foneca', role: 'JG', top: ['Shyvana', 'Nunu', 'Rammus', 'Amumu', 'Kayn'], comp: ['Jarvan IV', 'Sejuani', "Cho'Gath"] },
  { name: 'Swiftale', role: 'MID', aliases: 'Tswiftsale', top: ['Hwei', 'Mel', 'Syndra', 'Taliyah', 'Seraphine'], comp: ['Lux', 'Morgana'] },
  { name: 'JDDLC10', role: 'MID', top: ['Hwei', 'Lissandra', 'Mel', 'Syndra', 'Xerath'], comp: ['Sylas'] },
  { name: 'Khal', role: 'ADC', top: ['Aphelios', 'Jinx', 'Vayne', 'Smolder', 'Caitlyn'], comp: [] },
  { name: 'Karpi', role: 'ADC', top: ['Caitlyn', 'Yunara', 'Jinx', 'Ezreal', 'Xayah'], comp: ['Lucian', 'Tristana'] },
  { name: 'Hanzo', role: 'SUPP', top: ['Nami', 'Seraphine', 'Janna', 'Milio', 'Lulu'], comp: ['Morgana', 'Karma'] },
  { name: '0rBiT', role: 'SUPP', aliases: 'Orbit', top: ['Nautilus', 'Leona', 'Braum', 'Poppy', 'Taric'], comp: ['Morgana', 'Bardo', 'Maokai'] },
];

type SeedComp = {
  name: string;
  style: string;
  gamePlan: string;
  keyPoint: string;
  slots: [Role, string, string][];
};

const COMPS: SeedComp[] = [
  {
    name: 'Todos adentro',
    style: 'engage',
    gamePlan:
      'Agruparse desde mid game y pelear en dragón/barón. Malphite o Amumu entran con la ulti, Leona sigue, Seraphine amplifica y Jinx limpia.',
    keyPoint: 'Que el engage sea de a todos juntos.',
    slots: [['TOP', 'Cao Cao', 'Malphite'], ['JG', 'Foneca', 'Amumu'], ['MID', 'Swiftale', 'Seraphine'], ['ADC', 'Khal', 'Jinx'], ['SUPP', '0rBiT', 'Leona']],
  },
  {
    name: 'Proteger al ADC',
    style: 'protect',
    gamePlan:
      'Early tranquilo, Smolder farmea y acumula stacks. Ornn y Nunu adelante, Lissandra y Lulu frenan a quien se le acerque.',
    keyPoint: 'No forzar peleas antes de los 25 min.',
    slots: [['TOP', 'Mingo', 'Ornn'], ['JG', 'RedFerret', 'Nunu'], ['MID', 'JDDLC10', 'Lissandra'], ['ADC', 'Khal', 'Smolder'], ['SUPP', 'Hanzo', 'Lulu']],
  },
  {
    name: 'Asedio y poke',
    style: 'poke',
    gamePlan: 'Pegar de lejos antes de cada objetivo y tirar torres. Si el rival entra, Janna y Gragas los sacan.',
    keyPoint: 'Paciencia: desgastar y tomar objetivos.',
    slots: [['TOP', 'Cao Cao', 'Jayce'], ['JG', 'RedFerret', 'Gragas'], ['MID', 'JDDLC10', 'Xerath'], ['ADC', 'Karpi', 'Caitlyn'], ['SUPP', 'Hanzo', 'Janna']],
  },
  {
    name: 'Early y snowball',
    style: 'early',
    gamePlan: 'Presión desde el minuto 1. Xin Zhao y Taliyah rotan a gankear, Lucian + Nautilus ganan línea.',
    keyPoint: 'Cerrar antes de los 25–30 min.',
    slots: [['TOP', 'Mingo', 'Volibear'], ['JG', 'RedFerret', 'Xin Zhao'], ['MID', 'Swiftale', 'Taliyah'], ['ADC', 'Karpi', 'Lucian'], ['SUPP', '0rBiT', 'Nautilus']],
  },
  {
    name: 'Frontline',
    style: 'frontline',
    gamePlan: 'Garen y Shyvana van al frente, Syndra stunea y Xayah hace daño protegida por Braum.',
    keyPoint: 'Pelear de frente 5v5; la más fácil de ejecutar.',
    slots: [['TOP', 'Cao Cao', 'Garen'], ['JG', 'Foneca', 'Shyvana'], ['MID', 'Swiftale', 'Syndra'], ['ADC', 'Karpi', 'Xayah'], ['SUPP', '0rBiT', 'Braum']],
  },
];

async function main() {
  runMigrations();

  const championCount = db.select().from(schema.champions).all().length;
  if (!championCount || process.argv.includes('--sync')) {
    console.log('Sincronizando campeones con Data Dragon…');
    const r = await syncChampions();
    console.log(`  ${r.count} campeones (versión ${r.version}, ${r.locale})`);
  }
  const resolve = championResolver();
  const unresolved: string[] = [];
  const toId = (name: string) => {
    const id = resolve(name);
    if (!id) unresolved.push(name);
    return id;
  };

  // Equipo propio
  let team = db.select().from(schema.teams).where(eq(schema.teams.isOwn, true)).get();
  if (!team) {
    team = db
      .insert(schema.teams)
      .values({ name: 'Politécnica', shortName: 'POLI', faculty: 'Facultad Politécnica (UNA)', isOwn: true })
      .returning()
      .get();
    console.log('Equipo Politécnica creado');
  }

  const playerIds = new Map<string, number>();
  for (const p of PLAYERS) {
    let row = db
      .select()
      .from(schema.players)
      .where(and(eq(schema.players.teamId, team.id), eq(schema.players.name, p.name)))
      .get();
    if (!row) {
      row = db
        .insert(schema.players)
        .values({ teamId: team.id, name: p.name, role: p.role, aliases: p.aliases ?? null })
        .returning()
        .get();
    }
    playerIds.set(p.name, row.id);

    const pool = [
      ...p.top.map((n, i) => ({ championId: toId(n), tier: 'top' as const, priority: i + 1 })),
      ...p.comp.map((n, i) => ({ championId: toId(n), tier: 'comp' as const, priority: i + 1 })),
    ].filter((e): e is { championId: string; tier: 'top' | 'comp'; priority: number } => !!e.championId);
    replacePool(row.id, pool);
  }
  console.log(`${PLAYERS.length} jugadores con sus pools`);

  // Comps
  const existing = db.select().from(schema.comps).all();
  for (const c of COMPS) {
    const input = {
      name: c.name,
      style: c.style,
      gamePlan: c.gamePlan,
      keyPoint: c.keyPoint,
      slots: c.slots.map(([role, player, champ]) => ({
        role,
        playerId: playerIds.get(player) ?? null,
        championId: toId(champ) ?? null,
      })),
    };
    const found = existing.find((e) => e.name === c.name);
    if (found) updateComp(found.id, input);
    else createComp(input);
  }
  console.log(`${COMPS.length} comps de referencia`);

  if (unresolved.length) {
    console.warn(`\n⚠ No se pudieron resolver estos campeones (corregir a mano): ${[...new Set(unresolved)].join(', ')}`);
  } else {
    console.log('Todos los nombres de campeones se resolvieron contra Data Dragon.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
