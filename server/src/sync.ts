import { runMigrations } from './db';
import { syncChampions } from './ddragon';

runMigrations();
const downloadImages = process.argv.includes('--images');
const r = await syncChampions({ downloadImages });
console.log(`${r.count} campeones (versión ${r.version}, ${r.locale})` + (downloadImages ? `, ${r.downloaded} íconos nuevos descargados` : ''));
