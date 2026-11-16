import fs from 'node:fs';
import path from 'node:path';

const RAW = path.resolve('scripts/raw');
const OUT = path.resolve('public/data');
fs.mkdirSync(OUT, { recursive: true });

const readGeo = (name) => JSON.parse(fs.readFileSync(path.join(RAW, name), 'utf8'));

/** Ramer-Douglas-Peucker on a flat [x,y,x,y,...] array. */
function simplify(points, tolerance) {
  const count = points.length / 2;
  if (count <= 2) return points;

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const tol2 = tolerance * tolerance;
  const stack = [[0, count - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    const ax = points[first * 2];
    const ay = points[first * 2 + 1];
    const bx = points[last * 2];
    const by = points[last * 2 + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const denom = dx * dx + dy * dy;
    let maxDist = -1;
    let maxIndex = -1;

    for (let i = first + 1; i < last; i += 1) {
      const px = points[i * 2];
      const py = points[i * 2 + 1];
      let cx = ax;
      let cy = ay;
      if (denom > 0) {
        const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / denom));
        cx = ax + t * dx;
        cy = ay + t * dy;
      }
      const ex = px - cx;
      const ey = py - cy;
      const dist = ex * ex + ey * ey;
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > tol2 && maxIndex > 0) {
      keep[maxIndex] = 1;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }

  const result = [];
  for (let i = 0; i < count; i += 1) {
    if (keep[i] === 1) result.push(points[i * 2], points[i * 2 + 1]);
  }
  return result;
}

/**
 * Rewrites a ring with continuous (unwrapped) longitudes so a polygon that
 * straddles the antimeridian can be filled at multiple x offsets without a
 * horizontal smear.
 */
function prepareRing(ring, tolerance) {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const raw = new Float64Array(ring.length * 2);
  let previous = ring[0][0];
  let shift = 0;

  for (let i = 0; i < ring.length; i += 1) {
    const lon = Number(ring[i][0]);
    const lat = Number(ring[i][1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

    if (i === 0) {
      raw[0] = lon;
      raw[1] = lat;
      previous = lon;
      continue;
    }

    let unwrapped = lon + shift;
    while (unwrapped - previous > 180) {
      shift -= 360;
      unwrapped -= 360;
    }
    while (unwrapped - previous < -180) {
      shift += 360;
      unwrapped += 360;
    }
    raw[i * 2] = unwrapped;
    raw[i * 2 + 1] = lat;
    previous = unwrapped;
  }

  const points = simplify(Array.from(raw), tolerance);
  if (points.length < 6) return null;

  const out = new Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    out[i] = Math.round(points[i] * 1000) / 1000;
  }
  return out;
}

function geometryPolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function bakePolygons(features, tolerance) {
  const polygons = [];
  let vertices = 0;

  for (const feature of features) {
    for (const polygon of geometryPolygons(feature.geometry)) {
      const rings = [];
      for (const ring of polygon) {
        const prepared = prepareRing(ring, tolerance);
        if (prepared) {
          rings.push(prepared);
          vertices += prepared.length / 2;
        }
      }
      if (rings.length > 0) polygons.push(rings);
    }
  }

  return { polygons, vertices };
}

function writeJson(name, value) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(value));
  const kb = fs.statSync(file).size / 1024;
  console.log(`  ${name.padEnd(16)} ${kb.toFixed(0)} KB`);
}

/** Ray-casting point test for a flat [lon, lat, ...] ring. */
function pointInRing(ring, lon, lat) {
  let inside = false;
  const count = ring.length / 2;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const xi = ring[i * 2];
    const yi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const yj = ring[j * 2 + 1];
    if (yi > lat !== yj > lat) {
      const x = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (lon < x) inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(polygon, lon, lat) {
  let inside = false;
  for (const ring of polygon) {
    if (pointInRing(ring, lon, lat)) inside = !inside;
  }
  return inside;
}

function pointInPolygons(polygons, lon, lat) {
  for (const polygon of polygons) {
    for (const shift of [0, 360, -360]) {
      if (pointInPolygon(polygon, lon + shift, lat)) return true;
    }
  }
  return false;
}

function greatCircleKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function isValidTimeZone(timezone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

console.log('Baking Natural Earth geometry…');

const placeSource = readGeo('places.geojson');
const allPlaces = placeSource.features
  .map((feature) => {
    const props = feature.properties ?? {};
    const lat = Number(props.LATITUDE);
    const lon = Number(props.LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const featureClass = String(props.FEATURECLA);
    const isRegionCapital = featureClass.includes('Admin-0 region capital');
    const capitalRank = isRegionCapital
      ? 1
      : featureClass.includes('Admin-0 capital')
        ? 0
        : -1;
    return {
      name: props.NAME ?? '',
      lat,
      lon,
      timezone: props.TIMEZONE || null,
      population: Number(props.POP_MAX) || 0,
      capitalRank,
      adm0A3: props.ADM0_A3 ?? '',
      isoA2: props.ISO_A2 && props.ISO_A2 !== '-99' ? props.ISO_A2 : '',
    };
  })
  .filter(Boolean);

const zonedPlaces = allPlaces.filter((place) => place.timezone);

const capitalCandidates = allPlaces
  .filter((place) => place.capitalRank >= 0)
  .sort(
    (a, b) =>
      a.capitalRank - b.capitalRank ||
      b.population - a.population ||
      a.name.localeCompare(b.name),
  );

console.log(
  `places: ${allPlaces.length} (${zonedPlaces.length} zoned, ${capitalCandidates.length} admin capitals)`,
);

const land = bakePolygons(readGeo('land.geojson').features, 0.012);
console.log(`land: ${land.polygons.length} polygons, ${land.vertices.toLocaleString()} vertices`);
writeJson('land.json', { polygons: land.polygons });

const lakes = bakePolygons(readGeo('lakes.geojson').features, 0.015);
console.log(`lakes: ${lakes.polygons.length} polygons, ${lakes.vertices.toLocaleString()} vertices`);
writeJson('lakes.json', { polygons: lakes.polygons });

const countrySource = readGeo('countries.geojson');
const gazaSource = readGeo('gaza.geojson');
const gazaGeometry = gazaSource.features[0]?.geometry;
const capitalOverrides = {
  Palestine: { name: 'West Bank', lat: 31.902945, lon: 35.206209, timezone: 'Asia/Hebron' },
};
const countries = [];
let fallbackZones = 0;
let missingZones = 0;
for (const feature of countrySource.features) {
  const props = feature.properties ?? {};
  const countryFeatures =
    props.NAME === 'Palestine' && gazaGeometry ? [feature, { geometry: gazaGeometry }] : [feature];
  const baked = bakePolygons(countryFeatures, 0.015);
  if (baked.polygons.length === 0) continue;

  const pop = Number(props.POP_EST);
  const labelLat = Number(props.LABEL_Y);
  const labelLon = Number(props.LABEL_X);
  const iso = props.ISO_A2 && props.ISO_A2 !== '-99' ? props.ISO_A2 : props.ISO_A3 ?? '';
  const iso3 = props.ISO_A3 && props.ISO_A3 !== '-99' ? props.ISO_A3 : '';

  // The capital's IANA zone is the country's clock. Prefer containment, then
  // fall back to ISO ownership: simplified coastlines can leave island and
  // coastal capitals just outside their country polygon.
  let capital = null;
  for (const candidate of capitalCandidates) {
    if (pointInPolygons(baked.polygons, candidate.lon, candidate.lat)) {
      capital = candidate;
      break;
    }
  }
  if (!capital) {
    capital =
      capitalCandidates.find(
        (candidate) =>
          (iso && candidate.isoA2 === iso) ||
          (iso3 && candidate.adm0A3 === iso3),
      ) ?? null;
  }

  let timezone = capital?.timezone ?? null;
  let capitalName = capital?.name ?? '';

  if (!timezone && labelLat >= -60) {
    // Moscow and a few other capitals have no TIMEZONE field in the places
    // layer. Use the nearest zoned place to the capital itself, not the label.
    const referenceLat = capital?.lat ?? labelLat;
    const referenceLon = capital?.lon ?? labelLon;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const place of zonedPlaces) {
      const distance = greatCircleKm(referenceLat, referenceLon, place.lat, place.lon);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = place;
      }
    }
    if (nearest) {
      timezone = nearest.timezone;
      if (!capital) capitalName = nearest.name;
      fallbackZones += 1;
    }
  }

  let capitalLat = capital ? Math.round(capital.lat * 1000) / 1000 : null;
  let capitalLon = capital ? Math.round(capital.lon * 1000) / 1000 : null;
  const override = capitalOverrides[props.NAME];
  if (override) {
    capitalName = override.name;
    capitalLat = override.lat;
    capitalLon = override.lon;
    timezone = override.timezone;
  }

  if (!timezone || !isValidTimeZone(timezone)) {
    timezone = 'UTC';
    capitalName = '';
    missingZones += 1;
  }

  const siteLat =
    capitalLat ?? (Number.isFinite(labelLat) ? Math.round(labelLat * 1000) / 1000 : null);
  const siteLon =
    capitalLon ?? (Number.isFinite(labelLon) ? Math.round(labelLon * 1000) / 1000 : null);

  countries.push({
    name: props.NAME ?? props.ADMIN ?? 'Unknown',
    iso,
    capital: capitalName,
    capitalLat,
    capitalLon,
    siteLat,
    siteLon,
    timezone,
    pop: Number.isFinite(pop) && pop > 0 ? Math.round(pop) : 0,
    polygons: baked.polygons,
  });
}
console.log(
  `countries: ${countries.length} (${fallbackZones} nearest-city zones, ${missingZones} UTC fallback)`,
);
writeJson('countries.json', { countries });

const cities = [];
let cityPopulation = 0;
for (const feature of placeSource.features) {
  const props = feature.properties ?? {};
  const pop = Number(props.POP_MAX);
  const lat = Number(props.LATITUDE);
  const lon = Number(props.LONGITUDE);
  if (!Number.isFinite(pop) || pop <= 0 || pop > 100_000_000) continue;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  cities.push(
    Math.round(lat * 1000) / 1000,
    Math.round(lon * 1000) / 1000,
    Math.round(pop),
  );
  cityPopulation += pop;
}
console.log(`cities: ${cities.length / 3}, listed population ${(cityPopulation / 1e9).toFixed(2)}B`);
writeJson('cities.json', { cities });

console.log('Done.');
