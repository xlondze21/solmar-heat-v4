// Solmar itself: a 12x12 block grid with roads between the blocks, a beach and
// open sea to the south, and a marina cut into the south-west shore. Pure data
// and geometry — no drawing, no browser — so the autopilot sim can import it.
import { BEACH, BLOCK, CITY, GANGS, GRID, ROAD, SEA, WORLD } from './config.js';
import { range } from './random.js';

export function roadCenter(index) {
  return index * (BLOCK + ROAD) + ROAD / 2;
}

export function blockRect(col, row) {
  return {
    x: ROAD + col * (BLOCK + ROAD),
    y: ROAD + row * (BLOCK + ROAD),
    w: BLOCK,
    h: BLOCK,
  };
}

function blockCenter(col, row) {
  const r = blockRect(col, row);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function roadPoint(i, j) {
  return { x: roadCenter(i), y: roadCenter(j) };
}

export function buildCity(random) {
  // Buildings: one or two per block, inset from the block edge so sidewalks read.
  const buildings = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const r = blockRect(col, row);
      const oldTown = col <= 3 && row <= 2;
      const market = col === 5 && row === 10;
      const count = market ? 1 : oldTown ? 2 : 1 + Math.floor(random() * 2);
      for (let k = 0; k < count; k += 1) {
        const w = range(random, 60, 110);
        const h = range(random, 50, 100);
        const x = r.x + 12 + random() * Math.max(1, r.w - 24 - w);
        const y = r.y + 12 + random() * Math.max(1, r.h - 24 - h);
        buildings.push({
          x, y, w, h, col, row,
          kind: market ? 'market' : oldTown ? 'oldtown' : 'house',
          hue: Math.floor(random() * 360),
        });
      }
    }
  }

  // Points of interest, all in world coordinates.
  const plaza = blockCenter(5, 5);
  const pois = {
    'plaza-taxi': { x: roadPoint(6, 6).x, y: roadPoint(6, 6).y, r: 80, label: 'Plaza Sol taxi rank' },
    'old-town-drop': { x: roadPoint(2, 2).x, y: roadPoint(2, 2).y, r: 80, label: 'Old Town gate' },
    'fish-market': { x: blockCenter(5, 10).x, y: blockCenter(5, 10).y, r: 90, label: 'Fish Market' },
    'marina-dock': { x: 260, y: CITY + 46, r: 90, label: 'Marina dock' },
    'marina-boat': { x: 300, y: CITY + 96, r: 90, label: 'Marina skiff' },
    'buoy': { x: 1850, y: CITY + BEACH + 150, r: 90, label: 'Red buoy' },
    'market-truck': { x: blockCenter(5, 10).x - 60, y: blockCenter(5, 10).y + 70, r: 80, label: 'Market truck' },
    'garage': { x: blockCenter(2, 5).x, y: blockCenter(2, 5).y, r: 100, label: 'Rico\'s Garage' },
    'beach-road': { x: 1300, y: CITY + 62, r: 90, label: 'Sand road' },
    'beach-crate': { x: 2250, y: CITY + 62, r: 80, label: 'Stranded crate' },
    'deco-1': { x: roadPoint(1, 10).x, y: roadPoint(1, 10).y, r: 80, label: 'Checkpoint 1' },
    'deco-2': { x: roadPoint(10, 1).x, y: roadPoint(10, 1).y, r: 80, label: 'Checkpoint 2' },
    'deco-3': { x: roadPoint(10, 10).x, y: roadPoint(10, 10).y, r: 80, label: 'Checkpoint 3' },
    'deco-4': { x: roadPoint(3, 3).x, y: roadPoint(3, 3).y, r: 80, label: 'Checkpoint 4' },
    'hospital-gate': { x: roadPoint(9, 3).x, y: roadPoint(9, 3).y, r: 80, label: 'Hospital gate' },
    'hospital': { x: blockCenter(9, 2).x, y: blockCenter(9, 2).y, r: 100, label: 'Solmar General' },
    'helipad': { x: blockCenter(9, 2).x + 40, y: blockCenter(9, 2).y - 30, r: 70, label: 'Helipad' },
    'showroom-sports': { x: blockCenter(1, 11).x, y: blockCenter(1, 11).y, r: 90, label: 'Marina showroom' },
    'safehouse': { x: blockCenter(4, 3).x, y: blockCenter(4, 3).y, r: 90, label: 'Rico\'s safehouse' },
    'gun-shop': { x: blockCenter(7, 7).x, y: blockCenter(7, 7).y, r: 80, label: 'Gun shop' },
    'paint-shop': { x: blockCenter(10, 5).x, y: blockCenter(10, 5).y, r: 80, label: 'Paint shop' },
    'viper-drops': { x: 0, y: 0, r: 0, label: 'Viper drops' },
  };
  // Three Viper drops spread across east-side turf.
  const viperDrops = [
    { x: blockCenter(9, 4).x, y: blockCenter(9, 4).y, r: 60 },
    { x: blockCenter(11, 5).x, y: blockCenter(11, 5).y, r: 60 },
    { x: blockCenter(10, 6).x, y: blockCenter(10, 6).y, r: 60 },
  ];

  // The marina basin: open water cut into the south-west shore.
  const marinaBasin = { x: 60, y: CITY - 30, w: 420, h: BEACH + 90 };
  void plaza;

  return {
    buildings, pois, viperDrops, marinaBasin,
    gangs: GANGS,
    width: WORLD.width,
    height: WORLD.height,
    city: CITY,
    beach: BEACH,
    sea: SEA,
  };
}

// The waterline slides with the tide: 0 is low (beach dry), 1 is high (sea up
// to the promenade). The sand road is driveable while the tide is low.
export function waterLineY(tideLevel) {
  return CITY + BEACH * (1 - tideLevel) + 8;
}

export function inMarinaBasin(city, x, y) {
  const b = city.marinaBasin;
  return x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
}

export function isWater(city, x, y, tideLevel) {
  if (y > waterLineY(tideLevel)) return true;
  return inMarinaBasin(city, x, y);
}

export function isBeach(x, y) {
  return y >= CITY && y < CITY + BEACH;
}

export function onRoad(x, y) {
  const inRoadX = ((x % (BLOCK + ROAD)) + (BLOCK + ROAD)) % (BLOCK + ROAD) < ROAD;
  const inRoadY = ((y % (BLOCK + ROAD)) + (BLOCK + ROAD)) % (BLOCK + ROAD) < ROAD;
  return (inRoadX || inRoadY) && x >= 0 && y >= 0 && x < CITY && y < CITY;
}

export function nearestNode(x, y) {
  const i = Math.max(0, Math.min(GRID, Math.round((x - ROAD / 2) / (BLOCK + ROAD))));
  const j = Math.max(0, Math.min(GRID, Math.round((y - ROAD / 2) / (BLOCK + ROAD))));
  return { i, j };
}

export function nodePos(i, j) {
  return { x: roadCenter(i), y: roadCenter(j) };
}

export function nodeKey(i, j) {
  return `${i},${j}`;
}

// Breadth-first path over the 13x13 intersection grid; returns waypoints.
export function findPath(fromI, fromJ, toI, toJ) {
  const start = nodeKey(fromI, fromJ);
  const goal = nodeKey(toI, toJ);
  if (start === goal) return [nodePos(toI, toJ)];
  const prev = new Map();
  const queue = [[fromI, fromJ]];
  prev.set(start, null);
  while (queue.length > 0) {
    const [i, j] = queue.shift();
    const neighbours = [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]];
    for (const [ni, nj] of neighbours) {
      if (ni < 0 || ni > GRID || nj < 0 || nj > GRID) continue;
      const key = nodeKey(ni, nj);
      if (prev.has(key)) continue;
      prev.set(key, nodeKey(i, j));
      if (key === goal) {
        const path = [];
        let cur = key;
        while (cur !== null) {
          const [pi, pj] = cur.split(',').map(Number);
          path.unshift(nodePos(pi, pj));
          cur = prev.get(cur);
        }
        return path;
      }
      queue.push([ni, nj]);
    }
  }
  return [nodePos(toI, toJ)];
}

// Traffic lights: each intersection alternates north-south / east-west green
// on an 8-second cycle, offset by the intersection's parity.
export function lightState(i, j, time) {
  const phase = (time + ((i + j) % 2) * 4) % 8;
  return phase < 4 ? 'ns' : 'ew';
}

export function blockAt(x, y) {
  if (x < 0 || y < 0 || x >= CITY || y >= CITY) return null;
  const col = Math.floor((x - ROAD) / (BLOCK + ROAD));
  const row = Math.floor((y - ROAD) / (BLOCK + ROAD));
  if (col < 0 || col >= GRID || row < 0 || row >= GRID) return null;
  return { col, row };
}

// Push a circle out of any building in its block; returns true on a hit.
export function collideBuildings(city, x, y, radius) {
  const b = blockAt(x, y);
  if (!b) return null;
  for (const bd of city.buildings) {
    if (bd.col !== b.col || bd.row !== b.row) continue;
    const cx = Math.max(bd.x, Math.min(x, bd.x + bd.w));
    const cy = Math.max(bd.y, Math.min(y, bd.y + bd.h));
    const dx = x - cx;
    const dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 0.001;
      return { x: cx + (dx / d) * radius, y: cy + (dy / d) * radius };
    }
  }
  return null;
}
