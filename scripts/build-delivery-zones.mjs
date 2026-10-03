/**
 * Builds the `delivery.zones` table in src/bot/bot-config.json from a plain
 * list of barrios (scripts/delivery-barrios.json), using two free,
 * no-API-key services instead of Google Maps (no credit card required):
 *   - Nominatim (OpenStreetMap) for geocoding each barrio to lat/lng.
 *   - OSRM's public demo router for the *driving* distance from the local.
 * The charge is `ceil(km) * delivery.ratePerKm`, rounded up per km.
 *
 * One-time / occasional job — the result is committed as static data, so the
 * bot never calls any mapping API at runtime.
 *
 * Usage:
 *   node scripts/build-delivery-zones.mjs
 *   node scripts/build-delivery-zones.mjs --dry-run      # print, don't write
 *
 * Nominatim's usage policy caps requests at 1/second and requires an
 * identifying User-Agent — both are handled below. OSRM's public demo
 * server is meant for light/evaluation use, which fits an occasional
 * manual script like this one; self-host OSRM if this ever needs to run
 * often or at a larger scale.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(root, 'src', 'bot', 'bot-config.json');
const BARRIOS_PATH = join(root, 'scripts', 'delivery-barrios.json');

const DRY_RUN = process.argv.includes('--dry-run');
const USER_AGENT = 'juampis-cheladas-bot/1.0 (delivery zones build script)';
const NOMINATIM_DELAY_MS = 1100; // stay under Nominatim's 1 req/s limit

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
const delivery = config.delivery ?? {};
const origin = delivery.origin;
const ratePerKm = delivery.ratePerKm ?? 1000;
if (!origin) {
  console.error('config.delivery.origin is empty — set the local address first.');
  process.exit(1);
}

/** @type {Array<string | {name: string, aliases?: string[]}>} */
const rawBarrios = JSON.parse(readFileSync(BARRIOS_PATH, 'utf-8'));
const barrios = rawBarrios.map((b) =>
  typeof b === 'string' ? { name: b, aliases: [] } : { aliases: [], ...b },
);

// Carry over any aliases already curated in the config.
const existingAliases = new Map(
  (delivery.zones ?? []).map((z) => [z.name, z.aliases ?? []]),
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Geocodes one query via Nominatim. Returns { lat, lng } or throws. */
async function geocode(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co&q=' +
    encodeURIComponent(query);
  const data = await getJson(url, { 'User-Agent': USER_AGENT });
  if (!data.length) throw new Error(`geocode "${query}": no results`);
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

/** meters from `originPoint` to each of `destPoints`, via OSRM's table service
 *  (one request for all destinations, same shape as a distance matrix). */
async function drivingMeters(originPoint, destPoints) {
  const coords = [originPoint, ...destPoints]
    .map((p) => `${p.lng},${p.lat}`) // OSRM wants lng,lat
    .join(';');
  const destIndexes = destPoints.map((_, i) => i + 1).join(';');
  const url =
    `https://router.project-osrm.org/table/v1/driving/${coords}` +
    `?sources=0&destinations=${destIndexes}&annotations=distance`;
  const data = await getJson(url);
  if (data.code !== 'Ok') throw new Error(`OSRM table: ${data.code}`);
  return data.distances[0]; // meters, same order as destPoints, null if unreachable
}

async function main() {
  if (DRY_RUN) {
    console.log('[dry-run] would resolve', barrios.length, 'barrios from:', origin);
    for (const b of barrios) console.log('  -', b.name);
    return;
  }

  console.log(`Geocoding origin + ${barrios.length} barrios via Nominatim (~1/s, be patient)...`);
  const coordMatch = origin.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
  let originPoint;
  if (coordMatch) {
    originPoint = { lat: parseFloat(coordMatch[1]), lng: parseFloat(coordMatch[2]) };
  } else {
    try {
      originPoint = await geocode(origin);
    } catch (err) {
      console.error(
        `Could not geocode the origin address via Nominatim: ${err.message}\n` +
          'Nominatim struggles with Colombian "Calle/Carrera #-#" style addresses. ' +
          'Fix: open Google Maps (free, no API key needed), right-click your exact ' +
          'location, click the lat/lng shown at the top to copy it, and set ' +
          '`delivery.origin` in bot-config.json to "lat,lng" (e.g. "3.4516,-76.5320") — ' +
          'or any plain string like "<lat>,<lng>" works directly, no geocoding needed.',
      );
      process.exit(1);
    }
    await sleep(NOMINATIM_DELAY_MS);
  }

  const resolved = [];
  for (const b of barrios) {
    try {
      const point = await geocode(`${b.name}, Cali, Valle del Cauca, Colombia`);
      resolved.push({ ...b, point });
    } catch (err) {
      console.warn(`! skipping ${b.name}: ${err.message}`);
    }
    await sleep(NOMINATIM_DELAY_MS);
  }

  console.log(`Resolved ${resolved.length}/${barrios.length} barrios. Fetching driving distances...`);
  const meters = await drivingMeters(
    originPoint,
    resolved.map((b) => b.point),
  );

  const zones = [];
  resolved.forEach((b, i) => {
    const m = meters[i];
    if (m == null) {
      console.warn(`! no route for ${b.name}`);
      return;
    }
    const km = Math.round((m / 1000) * 10) / 10;
    const fee = Math.ceil(km) * ratePerKm;
    const aliases = [...new Set([...(existingAliases.get(b.name) ?? []), ...b.aliases])];
    zones.push({ name: b.name, aliases, km, fee });
  });

  zones.sort((a, b) => a.km - b.km);
  config.delivery.zones = zones;
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');

  console.table(zones.map(({ name, km, fee }) => ({ name, km, fee })));
  console.log(`\nWrote ${zones.length} zones to ${CONFIG_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
