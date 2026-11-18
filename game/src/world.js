// Solmar Heat's rules and state, with no drawing and no browser in it: the
// player on foot and in cars, boats and the helipad helicopter, traffic that
// follows the road graph and stops at red lights, pedestrians who flee,
// police cruisers that pathfind and ram, a police helicopter, ten story
// missions, wanted stars, the tide, the day/night cycle, shops, the garage and
// the safehouse, and saving. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing
// about screens or sound. A storage object is injected so the autopilot sim
// can stand in for localStorage.
import {
  BEACH, BLOCK, CAR_TYPES, CITY, DAY, ECONOMY, GANGS, MISSIONS, PLAYER,
  ROAD, SAVE_KEY, TIDE, WANTED, WORLD,
} from './config.js';
import { createRandom, pick, range } from './random.js';
import {
  blockAt, buildCity, collideBuildings, findPath, isBeach, isWater,
  lightState, nearestNode, nodePos, onRoad, waterLineY,
} from './city.js';

export const EVENT_STEAL = 1;
export const EVENT_MISSION_DONE = 2;
export const EVENT_BUSTED = 4;
export const EVENT_SHOT = 8;
export const EVENT_PUNCH = 16;
export const EVENT_PICKUP = 32;
export const EVENT_CRASH = 64;
export const EVENT_WASTED = 128;
export const EVENT_MISSION_FAIL = 256;

const TAU = Math.PI * 2;
const TRAFFIC_COUNT = 14;
const PED_COUNT = 24;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

function makeCar(id, type, x, y, angle, color) {
  const spec = CAR_TYPES[type];
  return {
    id, type, x, y, angle, speed: 0,
    color: color || spec.color,
    length: spec.length, width: spec.width,
    driver: null, hp: 100, missionCar: null, fromGarage: false,
    path: null, pathIdx: 0, repathTimer: 0,
    stopped: false, smoke: 0, dead: false,
  };
}

function memoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, v); },
  };
}

export function createGame(seed, storage) {
  const random = createRandom(seed);
  const city = buildCity(random);
  const store = storage || (typeof window !== 'undefined' && window.localStorage ? window.localStorage : memoryStorage());
  let carId = 1;

  const state = {
    seed,
    time: 0,
    dayTime: 0.35, // late morning over Solmar (noon is 0.5, midnight 0/1)
    tideTime: 0,
    tideLevel: 0.5,
    player: {
      x: 0, y: 0, angle: -Math.PI / 2, health: PLAYER.health,
      inCar: null, inBoat: false, inHeli: false,
      punchCd: 0, shootCd: 0, safehouseTimer: 0,
      aimX: 0, aimY: 0,
    },
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    skids: [],
    wanted: 0,
    wantedCleanTimer: 0,
    bustTimer: 0,
    crimeCooldown: 0,
    heli: { active: false, x: 0, y: 0, angle: 0, hp: 3, respawnTimer: 0, falling: false, fallTimer: 0 },
    parkedHeli: { x: 0, y: 0 },
    cash: ECONOMY.startCash,
    rep: 0,
    ammo: 12,
    missionIndex: 0,
    missionStep: 0,
    missionTimer: 0,
    missionActive: true,
    collected: [],
    checkpointsHit: [],
    radioStation: 0,
    ownedCars: ['sedan'],
    garageCars: [],
    camera: { x: 0, y: 0 },
    message: '',
    messageTimer: 0,
    shake: 0,
    stats: { carsStolen: 0, missionsDone: 0, bustedCount: 0, shotsFired: 0 },
    screen: 'title',
    attract: true,
  };

  function poi(name) {
    return city.pois[name];
  }

  function say(text, seconds) {
    state.message = text;
    state.messageTimer = seconds || 3;
  }

  function addWanted(n, reason) {
    if (state.crimeCooldown > 0 && reason !== 'steal') return;
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.crimeCooldown = 4;
    state.wantedCleanTimer = 0;
  }

  function spawnTrafficCar() {
    const i = Math.floor(random() * 13);
    const j = Math.floor(random() * 13);
    const dir = Math.floor(random() * 4);
    const p = nodePos(i, j);
    const type = pick(random, ['sedan', 'sedan', 'taxi', 'truck', 'sports']);
    const car = makeCar(carId++, type, p.x, p.y, dir * Math.PI / 2, undefined);
    car.driver = 'traffic';
    car.speed = range(random, 140, 220);
    const ti = clamp(i + (dir === 0 ? 1 : dir === 2 ? -1 : 0), 0, 12);
    const tj = clamp(j + (dir === 1 ? 1 : dir === 3 ? -1 : 0), 0, 12);
    car.path = findPath(i, j, ti, tj);
    car.pathIdx = 0;
    return car;
  }

  function spawnPed() {
    const col = Math.floor(random() * 12);
    const row = Math.floor(random() * 12);
    const r = { x: ROAD + col * (BLOCK + ROAD), y: ROAD + row * (BLOCK + ROAD) };
    const edge = Math.floor(random() * 4);
    const x = edge === 0 ? r.x + random() * BLOCK : edge === 1 ? r.x + random() * BLOCK : edge === 2 ? r.x + 4 : r.x + BLOCK - 4;
    const y = edge === 0 ? r.y + 4 : edge === 1 ? r.y + BLOCK - 4 : r.y + random() * BLOCK;
    return {
      x, y, angle: random() * TAU, speed: range(random, 40, 70),
      state: 'walk', tx: x, ty: y, color: pick(random, ['#d8c27a', '#7ab8d8', '#d88a7a', '#9ad8a0', '#c9a0d8']),
      fleeTimer: 0, down: false, downTimer: 0,
    };
  }

  function spawnMissionCars() {
    // Mission cars are parked where the story leaves them.
    const taxi = makeCar(carId++, 'taxi', poi('plaza-taxi').x + 30, poi('plaza-taxi').y, Math.PI / 2);
    taxi.missionCar = 'first-fare';
    state.cars.push(taxi);
    const truck = makeCar(carId++, 'truck', poi('market-truck').x, poi('market-truck').y, 0);
    truck.missionCar = 'fish-market-heist';
    state.cars.push(truck);
    const sports = makeCar(carId++, 'sports', poi('showroom-sports').x, poi('showroom-sports').y, -Math.PI / 2);
    sports.missionCar = 'solmar-crown';
    state.cars.push(sports);
    const boat = makeCar(carId++, 'boat', poi('marina-boat').x, poi('marina-boat').y, Math.PI / 2);
    boat.missionCar = 'gull-run';
    state.cars.push(boat);
    // A few ordinary parked cars for the taking.
    for (let k = 0; k < 5; k += 1) {
      const i = 1 + Math.floor(random() * 11);
      const j = 1 + Math.floor(random() * 11);
      const p = nodePos(i, j);
      const type = pick(random, ['sedan', 'sedan', 'taxi']);
      const car = makeCar(carId++, type, p.x + range(random, -14, 14), p.y + range(random, -14, 14), Math.floor(random() * 4) * Math.PI / 2);
      state.cars.push(car);
    }
  }

  function reset() {
    state.time = 0;
    state.dayTime = 0.35;
    state.wanted = 0;
    state.wantedCleanTimer = 0;
    state.bustTimer = 0;
    state.crimeCooldown = 0;
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.particles = [];
    state.skids = [];
    state.heli = { active: false, x: 0, y: 0, angle: 0, hp: 3, respawnTimer: 0, falling: false, fallTimer: 0 };
    state.parkedHeli = { x: poi('helipad').x, y: poi('helipad').y };
    state.missionIndex = 0;
    state.missionStep = 0;
    state.missionTimer = 0;
    state.missionActive = true;
    state.collected = [];
    state.checkpointsHit = [];
    state.cash = ECONOMY.startCash;
    state.rep = 0;
    state.ammo = 12;
    state.ownedCars = [];
    state.garageCars = [];
    state.stats = { carsStolen: 0, missionsDone: 0, bustedCount: 0, shotsFired: 0 };
    loadSave();
    const start = poi('plaza-taxi');
    state.player.x = start.x - 90;
    state.player.y = start.y + 40;
    state.player.angle = -Math.PI / 2;
    state.player.health = PLAYER.health;
    state.player.inCar = null;
    state.player.inBoat = false;
    state.player.inHeli = false;
    for (let k = 0; k < TRAFFIC_COUNT; k += 1) state.cars.push(spawnTrafficCar());
    for (let k = 0; k < PED_COUNT; k += 1) state.peds.push(spawnPed());
    spawnMissionCars();
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    say('Solmar Heat — Rico is back in town. Follow the gold marker.', 5);
  }

  function saveGame() {
    try {
      store.setItem(SAVE_KEY, JSON.stringify({
        cash: state.cash, rep: state.rep, ammo: state.ammo,
        missionIndex: state.missionIndex, ownedCars: state.ownedCars,
        garageCars: state.garageCars,
      }));
    } catch { /* storage can be off; the run still plays */ }
  }

  function loadSave() {
    try {
      const raw = store.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.cash === 'number') state.cash = data.cash;
      if (typeof data.rep === 'number') state.rep = data.rep;
      if (typeof data.ammo === 'number') state.ammo = data.ammo;
      if (typeof data.missionIndex === 'number') state.missionIndex = clamp(data.missionIndex, 0, MISSIONS.length - 1);
      if (Array.isArray(data.ownedCars)) state.ownedCars = data.ownedCars;
      if (Array.isArray(data.garageCars)) state.garageCars = data.garageCars;
    } catch { /* a corrupt save starts fresh */ }
  }

  function playerCar() {
    if (state.player.inCar === null) return null;
    return state.cars.find((c) => c.id === state.player.inCar) || null;
  }

  function playerPos() {
    const car = playerCar();
    if (car) return { x: car.x, y: car.y, speed: Math.abs(car.speed) };
    return { x: state.player.x, y: state.player.y, speed: 0 };
  }

  function nearestCar(x, y, maxDist, filter) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.dead) continue;
      if (filter && !filter(car)) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function currentMission() {
    return MISSIONS[Math.min(state.missionIndex, MISSIONS.length - 1)];
  }

  function currentStep() {
    const m = currentMission();
    return m.steps[Math.min(state.missionStep, m.steps.length - 1)];
  }

  function missionTarget() {
    const step = currentStep();
    if (!state.missionActive) return null;
    if (step.type === 'collect') {
      const remaining = city.viperDrops.filter((d, idx) => !state.collected.includes(idx));
      return remaining.length > 0 ? remaining[0] : null;
    }
    if (step.type === 'checkpoints') {
      const next = step.pois[state.checkpointsHit.length];
      return next ? poi(next) : null;
    }
    if (step.poi) return poi(step.poi);
    if (step.type === 'boatTo') return poi(step.poi);
    return null;
  }

  function advanceStep() {
    const m = currentMission();
    state.missionStep += 1;
    state.missionTimer = 0;
    if (state.missionStep >= m.steps.length) {
      state.cash += m.reward;
      state.rep += ECONOMY.repPerMission;
      state.stats.missionsDone += 1;
      state.missionIndex = Math.min(state.missionIndex + 1, MISSIONS.length - 1);
      state.missionStep = 0;
      state.collected = [];
      state.checkpointsHit = [];
      saveGame();
      say(`${m.name} complete — $${m.reward} earned. REP ${state.rep}.`, 4);
      return EVENT_MISSION_DONE;
    }
    return EVENT_PICKUP;
  }

  function failMission() {
    state.missionStep = 0;
    state.missionTimer = 0;
    state.collected = [];
    state.checkpointsHit = [];
    say('Mission failed — back to the start of this job.', 3);
    return EVENT_MISSION_FAIL;
  }

  function stepMission(dt) {
    if (!state.missionActive) return 0;
    const step = currentStep();
    const pos = playerPos();
    if (step.timed) {
      if (state.missionTimer === 0) state.missionTimer = step.timed;
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) return failMission();
    }
    switch (step.type) {
      case 'goto': {
        const p = poi(step.poi);
        if (dist(pos.x, pos.y, p.x, p.y) < p.r) return advanceStep();
        break;
      }
      case 'enterCar': {
        const car = playerCar();
        if (car && car.type === step.car) return advanceStep();
        break;
      }
      case 'driveTo': {
        const p = poi(step.poi);
        // Night fares only count after dark (dayTime below 0.2 or above 0.8).
        if (step.night && !(state.dayTime < 0.2 || state.dayTime > 0.8)) break;
        if (dist(pos.x, pos.y, p.x, p.y) < p.r) return advanceStep();
        break;
      }
      case 'gainWanted': {
        if (state.wanted >= step.stars) return advanceStep();
        break;
      }
      case 'loseWanted': {
        if (state.wanted <= step.stars) return advanceStep();
        break;
      }
      case 'collect': {
        for (let idx = 0; idx < city.viperDrops.length; idx += 1) {
          if (state.collected.includes(idx)) continue;
          const d = city.viperDrops[idx];
          if (dist(pos.x, pos.y, d.x, d.y) < d.r) {
            state.collected.push(idx);
            say(`Drop ${state.collected.length}/${step.count} collected.`, 2);
            if (state.collected.length >= step.count) return advanceStep();
            return EVENT_PICKUP;
          }
        }
        break;
      }
      case 'boatTo': {
        const p = poi(step.poi);
        if (state.player.inBoat && dist(pos.x, pos.y, p.x, p.y) < p.r) return advanceStep();
        break;
      }
      case 'waitTide': {
        if (state.tideLevel < TIDE.openBelow) return advanceStep();
        break;
      }
      case 'checkpoints': {
        const next = step.pois[state.checkpointsHit.length];
        if (!next) return advanceStep();
        const p = poi(next);
        if (dist(pos.x, pos.y, p.x, p.y) < p.r) {
          state.checkpointsHit.push(next);
          say(`Checkpoint ${state.checkpointsHit.length}/${step.pois.length}.`, 2);
          if (state.checkpointsHit.length >= step.pois.length) return advanceStep();
          return EVENT_PICKUP;
        }
        break;
      }
      default:
        break;
    }
    return 0;
  }

  function driveCar(car, dt, throttle, steer, aggression) {
    const spec = CAR_TYPES[car.type];
    const inWater = isWater(city, car.x, car.y, state.tideLevel);
    const beach = isBeach(car.x, car.y) && !inWater;
    const offroad = !onRoad(car.x, car.y) && !beach && !inWater && car.type !== 'heli';
    const drag = inWater && car.type !== 'boat' ? 6 : offroad ? 1.9 : beach ? 1.35 : 1;
    const top = spec.topSpeed * (aggression || 1);
    if (throttle > 0) car.speed += spec.accel * throttle * dt;
    else if (throttle < 0) car.speed += spec.accel * 0.7 * throttle * dt;
    car.speed -= car.speed * (0.55 + (drag - 1) * 0.9) * dt;
    car.speed = clamp(car.speed, -top * 0.45, top);
    const turnRate = spec.grip * clamp(Math.abs(car.speed) / 200, 0.25, 1);
    car.angle += steer * turnRate * dt * (car.speed >= 0 ? 1 : -1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // Cars cannot drive into the sea (boats can); the waterline pushes them back.
    if (car.type !== 'boat' && car.type !== 'heli' && isWater(city, nx, ny, state.tideLevel)) {
      car.speed *= 0.3;
      return;
    }
    // Boats cannot climb onto land.
    if (car.type === 'boat' && !isWater(city, nx, ny, state.tideLevel)) {
      car.speed *= 0.3;
      return;
    }
    car.x = clamp(nx, 20, WORLD.width - 20);
    car.y = clamp(ny, 20, WORLD.height - 20);
    const hit = collideBuildings(city, car.x, car.y, car.length / 2);
    if (hit && car.type !== 'heli') {
      car.x = hit.x;
      car.y = hit.y;
      if (Math.abs(car.speed) > 120) {
        car.hp -= 8;
        car.speed *= -0.25;
        spawnSparks(car.x, car.y, 8);
      } else {
        car.speed *= 0.4;
      }
    }
    // Hard cornering at speed leaves skid marks.
    if (Math.abs(steer) > 0.6 && Math.abs(car.speed) > 260) {
      state.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 6 });
      if (state.skids.length > 240) state.skids.shift();
    }
    if (car.hp <= 55 && Math.random() < 0.3) {
      state.particles.push({ x: car.x, y: car.y, vx: range(random, -20, 20), vy: range(random, -40, -10), life: 0.7, max: 0.7, kind: 'smoke' });
    }
  }

  function spawnSparks(x, y, n) {
    for (let k = 0; k < n; k += 1) {
      state.particles.push({ x, y, vx: range(random, -160, 160), vy: range(random, -160, 160), life: 0.4, max: 0.4, kind: 'spark' });
    }
  }

  function spawnSmoke(x, y, n) {
    for (let k = 0; k < n; k += 1) {
      state.particles.push({ x, y, vx: range(random, -30, 30), vy: range(random, -60, -20), life: 1.1, max: 1.1, kind: 'smoke' });
    }
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.driver !== 'traffic') continue;
      if (car.dead) continue;
      // Follow the path; pick a new destination at the end of it.
      if (!car.path || car.pathIdx >= car.path.length) {
        const n = nearestNode(car.x, car.y);
        const ti = Math.floor(random() * 13);
        const tj = Math.floor(random() * 13);
        car.path = findPath(n.i, n.j, ti, tj);
        car.pathIdx = 0;
      }
      const target = car.path[Math.min(car.pathIdx, car.path.length - 1)];
      const d = dist(car.x, car.y, target.x, target.y);
      if (d < 26) {
        car.pathIdx += 1;
        continue;
      }
      // Red light: stop before the intersection when crossing against it.
      const node = nearestNode(target.x, target.y);
      const light = lightState(node.i, node.j, state.time);
      const heading = angleTo(car.x, car.y, target.x, target.y);
      const movingNS = Math.abs(Math.sin(heading)) > Math.abs(Math.cos(heading));
      const red = (movingNS && light === 'ew') || (!movingNS && light === 'ns');
      let throttle = 0.55;
      let steer = 0;
      if (red && d < 90) throttle = -0.6;
      // A car right ahead: overtake one lane over instead of sitting on its
      // bumper forever (a head-on shove with a car going the other way would
      // deadlock both of them).
      let blocked = false;
      for (const other of state.cars) {
        if (other === car || other.dead) continue;
        const od = dist(car.x, car.y, other.x, other.y);
        if (od < 70 && Math.abs(angleDiff(angleTo(car.x, car.y, other.x, other.y), car.angle)) < 0.6) {
          blocked = true;
          break;
        }
      }
      const want = angleDiff(heading, car.angle);
      steer = clamp(want * 2.2, -1, 1);
      if (blocked) {
        const side = car.id % 2 === 0 ? 1 : -1;
        const dodgeHeading = angleTo(car.x, car.y, target.x - Math.sin(heading) * side * 44, target.y + Math.cos(heading) * side * 44);
        steer = clamp(angleDiff(dodgeHeading, car.angle) * 2.2, -1, 1);
        throttle = 0.45;
      }
      driveCar(car, dt, throttle, steer, 0.62);
    }
  }

  function stepPeds(dt) {
    const pos = playerPos();
    const car = playerCar();
    for (const ped of state.peds) {
      if (ped.down) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) ped.down = false;
        continue;
      }
      if (ped.state === 'flee') {
        ped.fleeTimer -= dt;
        ped.x += Math.cos(ped.angle) * 190 * dt;
        ped.y += Math.sin(ped.angle) * 190 * dt;
        if (ped.fleeTimer <= 0) ped.state = 'walk';
      } else {
        const d = dist(ped.x, ped.y, pos.x, pos.y);
        const threatened = (car && d < 130 && Math.abs(car.speed) > 140) || d < 60;
        if (threatened) {
          ped.state = 'flee';
          ped.fleeTimer = 1.6;
          ped.angle = angleTo(pos.x, pos.y, ped.x, ped.y);
        } else {
          const td = dist(ped.x, ped.y, ped.tx, ped.ty);
          if (td < 12) {
            // Pick a new stroll target on a nearby sidewalk.
            const b = blockAt(ped.x, ped.y);
            if (b) {
              ped.tx = ROAD + b.col * (BLOCK + ROAD) + range(random, 6, BLOCK - 6);
              ped.ty = ROAD + b.row * (BLOCK + ROAD) + range(random, 6, BLOCK - 6);
            } else {
              ped.tx = clamp(ped.x + range(random, -200, 200), 40, CITY - 40);
              ped.ty = clamp(ped.y + range(random, -200, 200), 40, CITY - 40);
            }
          }
          ped.angle = angleTo(ped.x, ped.y, ped.tx, ped.ty);
          ped.x += Math.cos(ped.angle) * ped.speed * dt;
          ped.y += Math.sin(ped.angle) * ped.speed * dt;
        }
      }
      const hit = collideBuildings(city, ped.x, ped.y, 10);
      if (hit) { ped.x = hit.x; ped.y = hit.y; ped.tx = ped.x; ped.ty = ped.y; }
      ped.x = clamp(ped.x, 20, WORLD.width - 20);
      ped.y = clamp(ped.y, 20, WORLD.height - 20);
    }
  }

  function stepPolice(dt) {
    const pos = playerPos();
    const aggression = (state.dayTime > 0.42 && state.dayTime < 0.58 ? DAY.noonHeat : 1) * (state.heli.active ? 1.25 : 1);
    const want = WANTED.cruiserCap[state.wanted];
    let cruisers = state.cars.filter((c) => c.type === 'cruiser' && !c.dead);
    // Spawn up to the wanted level's cap.
    while (cruisers.length < want) {
      const n = nearestNode(pos.x, pos.y);
      const edge = Math.floor(random() * 4);
      const si = edge === 0 ? 0 : edge === 1 ? 12 : Math.floor(random() * 13);
      const sj = edge === 2 ? 0 : edge === 3 ? 12 : Math.floor(random() * 13);
      const p = nodePos(si, sj);
      const car = makeCar(carId++, 'cruiser', p.x, p.y, angleTo(p.x, p.y, pos.x, pos.y));
      car.driver = 'police';
      car.path = findPath(si, sj, n.i, n.j);
      car.pathIdx = 0;
      state.cars.push(car);
      cruisers.push(car);
    }
    // Extra cruisers stand down when the heat fades.
    for (const car of cruisers) {
      if (state.wanted === 0) {
        car.driver = null;
        car.speed *= 0.9;
        if (Math.abs(car.speed) < 5) car.dead = true;
        continue;
      }
      const d = dist(car.x, car.y, pos.x, pos.y);
      car.repathTimer -= dt;
      if (car.repathTimer <= 0) {
        const from = nearestNode(car.x, car.y);
        const to = nearestNode(pos.x, pos.y);
        car.path = findPath(from.i, from.j, to.i, to.j);
        car.pathIdx = 0;
        car.repathTimer = 1.5;
      }
      let target = null;
      if (d < 150) {
        target = { x: pos.x, y: pos.y };
      } else if (car.path && car.pathIdx < car.path.length) {
        target = car.path[car.pathIdx];
        if (dist(car.x, car.y, target.x, target.y) < 30) {
          car.pathIdx += 1;
          target = car.path[Math.min(car.pathIdx, car.path.length - 1)];
        }
      } else {
        target = { x: pos.x, y: pos.y };
      }
      const heading = angleTo(car.x, car.y, target.x, target.y);
      const want2 = angleDiff(heading, car.angle);
      const steer = clamp(want2 * 2.4, -1, 1);
      // A cruiser that catches Rico on foot holds position to make the bust.
      const throttle = !playerCar() && d < 70 ? 0 : d < 150 ? 1 : 0.85;
      driveCar(car, dt, throttle, steer, aggression);
      // Ram: shove the player's car and shake the camera (once per cruiser
      // per half second — a touch should hurt, not glue the car to the road).
      const pc = playerCar();
      car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
      if (pc && car.ramCd <= 0 && dist(car.x, car.y, pc.x, pc.y) < (car.length + pc.length) / 2) {
        car.ramCd = 0.5;
        pc.speed *= 0.85;
        pc.hp -= 2;
        state.shake = Math.max(state.shake, 5);
        if (pc.hp <= 0) {
          pc.dead = true;
          state.player.inCar = null;
          say('Your car is wrecked!', 2);
        }
      }
    }
    // Bust: a cruiser holds the player close while they are slow.
    if (state.wanted > 0) {
      const speed = playerCar() ? Math.abs(playerCar().speed) : 0;
      let close = false;
      for (const car of cruisers) {
        if (dist(car.x, car.y, pos.x, pos.y) < WANTED.bustRange && speed < 30) { close = true; break; }
      }
      if (close) {
        state.bustTimer += dt;
        if (state.bustTimer >= WANTED.bustHoldSeconds) {
          state.bustTimer = 0;
          return EVENT_BUSTED;
        }
      } else {
        state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
      }
      // Wanted fades when no cruiser is anywhere near.
      let near = false;
      for (const car of cruisers) {
        if (dist(car.x, car.y, pos.x, pos.y) < 380) { near = true; break; }
      }
      if (!near && !state.heli.active) {
        state.wantedCleanTimer += dt;
        if (state.wantedCleanTimer >= WANTED.decaySeconds) {
          state.wanted = Math.max(0, state.wanted - 1);
          state.wantedCleanTimer = 0;
        }
      } else {
        state.wantedCleanTimer = 0;
      }
    }
    return 0;
  }

  function stepHeli(dt) {
    const h = state.heli;
    const pos = playerPos();
    if (h.respawnTimer > 0) h.respawnTimer -= dt;
    if (h.falling) {
      h.fallTimer -= dt;
      h.y += 260 * dt;
      if (h.fallTimer <= 0) {
        h.falling = false;
        h.active = false;
        h.respawnTimer = WANTED.heliRespawn;
        spawnSmoke(h.x, h.y, 14);
        state.shake = 12;
      }
      return;
    }
    if (state.wanted >= WANTED.heliAt && !h.active && h.respawnTimer <= 0) {
      h.active = true;
      h.hp = 3;
      h.x = pos.x - 260;
      h.y = pos.y - 260;
      h.angle = 0;
      say('Police helicopter overhead — it is calling in ground units.', 3);
    }
    if (h.active) {
      if (state.wanted < WANTED.heliAt) {
        h.active = false;
        return;
      }
      h.angle += dt * 0.55;
      const tx = pos.x + Math.cos(h.angle) * 230;
      const ty = pos.y + Math.sin(h.angle) * 230 - 40;
      h.x += (tx - h.x) * dt * 1.4;
      h.y += (ty - h.y) * dt * 1.4;
    }
  }

  function stepBullets(dt) {
    for (const b of state.bullets) {
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }
      // Helicopter hit?
      const h = state.heli;
      if (h.active && !h.falling && dist(b.x, b.y, h.x, h.y) < 42) {
        h.hp -= 1;
        b.dead = true;
        spawnSparks(b.x, b.y, 6);
        if (h.hp <= 0) {
          h.falling = true;
          h.fallTimer = 1.4;
          say('Helicopter down! It will take a while to send another.', 3);
        }
        continue;
      }
      // Pedestrian hit.
      for (const ped of state.peds) {
        if (!ped.down && dist(b.x, b.y, ped.x, ped.y) < 16) {
          ped.down = true;
          ped.downTimer = 6;
          b.dead = true;
          addWanted(1, 'shoot');
          break;
        }
      }
      if (b.dead) continue;
      // Car hit.
      for (const car of state.cars) {
        if (car.dead || car.id === state.player.inCar) continue;
        if (dist(b.x, b.y, car.x, car.y) < car.length / 2) {
          car.hp -= 25;
          b.dead = true;
          spawnSparks(b.x, b.y, 5);
          if (car.driver === 'traffic') {
            car.driver = null;
            car.speed = 0;
          }
          if (car.hp <= 0) { car.dead = true; spawnSmoke(car.x, car.y, 10); }
          break;
        }
      }
      if (b.dead) continue;
      const bb = blockAt(b.x, b.y);
      if (bb) {
        for (const bd of city.buildings) {
          if (bd.col === bb.col && bd.row === bb.row && b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) {
            b.dead = true;
            spawnSparks(b.x, b.y, 3);
            break;
          }
        }
      }
    }
    state.bullets = state.bullets.filter((b) => !b.dead);
  }

  function stepPlayer(dt, input) {
    const p = state.player;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.shootCd = Math.max(0, p.shootCd - dt);
    if (state.crimeCooldown > 0) state.crimeCooldown -= dt;

    // Flying the police helicopter from the hospital helipad.
    if (p.inHeli) {
      const heliCar = playerCar();
      if (heliCar) {
        const steer = input.x || 0;
        const throttle = input.y < 0 ? 1 : input.y > 0 ? -0.6 : 0.2;
        heliCar.angle += steer * 2.2 * dt * (heliCar.speed >= 0 ? 1 : -1);
        heliCar.speed = clamp(heliCar.speed + 320 * throttle * dt, -160, CAR_TYPES.heli.topSpeed);
        heliCar.speed -= heliCar.speed * 0.4 * dt;
        heliCar.x = clamp(heliCar.x + Math.cos(heliCar.angle) * heliCar.speed * dt, 20, WORLD.width - 20);
        heliCar.y = clamp(heliCar.y + Math.sin(heliCar.angle) * heliCar.speed * dt, 20, WORLD.height - 20);
      }
      if (input.enter) {
        input.enter = false;
        const hc = playerCar();
        if (hc && !isWater(city, hc.x, hc.y, state.tideLevel)) {
          state.player.inHeli = false;
          state.player.inCar = null;
          state.player.x = hc.x + 40;
          state.player.y = hc.y + 40;
          hc.driver = null;
          say('Landed the helicopter.', 2);
        } else {
          say('Too wet to land here.', 2);
        }
      }
      return 0;
    }

    const car = playerCar();
    if (car) {
      // Driving.
      const throttle = input.y < 0 ? 1 : input.y > 0 ? -0.7 : 0;
      const steer = input.x || 0;
      const before = { x: car.x, y: car.y };
      driveCar(car, dt, throttle, steer, 1);
      const moved = dist(before.x, before.y, car.x, car.y);
      if (moved < 1 && throttle !== 0 && Math.abs(car.speed) > 60) {
        // Pinned against something: scrape damage, shake.
        car.hp -= 3 * dt;
        state.shake = Math.max(state.shake, 2);
      }
      if (car.hp <= 0 && !car.dead) {
        car.dead = true;
        state.player.inCar = null;
        state.player.x = car.x + 30;
        state.player.y = car.y + 30;
        spawnSmoke(car.x, car.y, 12);
        say('Your car is wrecked!', 2);
        return EVENT_CRASH;
      }
      if (input.enter) {
        // Near the paint shop or the garage the keypress belongs to the shop
        // handler below; anywhere else it means getting out of the car.
        const ps = poi('paint-shop');
        const g = poi('garage');
        const nearShop = dist(car.x, car.y, ps.x, ps.y) < ps.r || dist(car.x, car.y, g.x, g.y) < g.r;
        if (!nearShop) {
          input.enter = false;
          exitCar(car);
        }
      }
      return 0;
    }

    // On foot.
    const len = Math.hypot(input.x || 0, input.y || 0);
    if (len > 0) {
      const nx = p.x + ((input.x || 0) / len) * PLAYER.walkSpeed * dt;
      const ny = p.y + ((input.y || 0) / len) * PLAYER.walkSpeed * dt;
      p.angle = Math.atan2((input.y || 0), (input.x || 0));
      if (!isWater(city, nx, p.y, state.tideLevel)) p.x = clamp(nx, 16, WORLD.width - 16);
      if (!isWater(city, p.x, ny, state.tideLevel)) p.y = clamp(ny, 16, WORLD.height - 16);
      const hit = collideBuildings(city, p.x, p.y, PLAYER.radius);
      if (hit) { p.x = hit.x; p.y = hit.y; }
    }

    if (input.enter) {
      input.enter = false;
      return tryEnter();
    }
    if (input.punch && p.punchCd <= 0) {
      input.punch = false;
      p.punchCd = PLAYER.punchCooldown;
      return doPunch();
    }
    if (input.shoot && p.shootCd <= 0) {
      input.shoot = false;
      if (state.ammo > 0) {
        p.shootCd = PLAYER.shootCooldown;
        state.ammo -= 1;
        state.stats.shotsFired += 1;
        const angle = angleTo(p.x, p.y, p.aimX || p.x + Math.cos(p.angle), p.aimY || p.y + Math.sin(p.angle));
        state.bullets.push({ x: p.x + Math.cos(angle) * 20, y: p.y + Math.sin(angle) * 20, angle, speed: PLAYER.bulletSpeed, life: PLAYER.bulletRange / PLAYER.bulletSpeed, dead: false });
        addWanted(1, 'shoot');
        return EVENT_SHOT;
      }
      say('Out of ammo — buy more at the gun shop.', 2);
    }
    return 0;
  }

  function exitCar(car) {
    const p = state.player;
    p.inCar = null;
    p.inBoat = false;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    car.driver = null;
    car.speed = 0;
  }

  function tryEnter() {
    const p = state.player;
    // The helipad helicopter.
    if (dist(p.x, p.y, state.parkedHeli.x, state.parkedHeli.y) < 70) {
      const heliCar = makeCar(carId++, 'heli', state.parkedHeli.x, state.parkedHeli.y, -Math.PI / 2);
      heliCar.driver = 'player';
      state.cars.push(heliCar);
      state.player.inCar = heliCar.id;
      state.player.inHeli = true;
      say('You took the hospital helicopter. E to land.', 3);
      return EVENT_PICKUP;
    }
    // The marina skiff.
    const boat = nearestCar(p.x, p.y, 70, (c) => c.type === 'boat' && !c.dead);
    if (boat && isWater(city, boat.x, boat.y, state.tideLevel)) {
      state.player.inCar = boat.id;
      state.player.inBoat = true;
      boat.driver = 'player';
      say('Skiff away. Steer with W A S D.', 2);
      return EVENT_PICKUP;
    }
    // Garage: take out an owned car.
    const g = poi('garage');
    if (dist(p.x, p.y, g.x, g.y) < g.r && state.garageCars.length > 0) {
      const type = state.garageCars[state.garageCars.length - 1];
      const car = makeCar(carId++, type, g.x + 60, g.y, 0);
      car.driver = 'player';
      car.fromGarage = true;
      state.cars.push(car);
      state.player.inCar = car.id;
      say(`Took the ${CAR_TYPES[type].name} out of the garage.`, 2);
      return EVENT_PICKUP;
    }
    // Any nearby car.
    const car = nearestCar(p.x, p.y, 64, (c) => c.type !== 'boat' && c.type !== 'heli' && c.type !== 'cruiser' && !c.dead);
    if (car) {
      const wasTraffic = car.driver === 'traffic';
      car.driver = 'player';
      state.player.inCar = car.id;
      state.player.inBoat = false;
      // A car that came out of your garage is yours; any other street car is
      // a theft and the cops notice.
      if (wasTraffic || car.missionCar || !car.fromGarage) {
        addWanted(1, 'steal');
        state.stats.carsStolen += 1;
        say(`Stole a ${CAR_TYPES[car.type].name}. The cops noticed.`, 2);
        return EVENT_STEAL;
      }
      say(`In the ${CAR_TYPES[car.type].name}.`, 2);
      return EVENT_PICKUP;
    }
    return 0;
  }

  function doPunch() {
    const p = state.player;
    let events = EVENT_PUNCH;
    for (const ped of state.peds) {
      if (!ped.down && dist(p.x, p.y, ped.x, ped.y) < PLAYER.punchRange + 14) {
        ped.down = true;
        ped.downTimer = 5;
        ped.angle = angleTo(p.x, p.y, ped.x, ped.y);
        ped.x += Math.cos(ped.angle) * 30;
        ped.y += Math.sin(ped.angle) * 30;
        addWanted(1, 'punch');
      }
    }
    for (const car of state.cars) {
      if (car.dead || car.id === state.player.inCar) continue;
      if (dist(p.x, p.y, car.x, car.y) < PLAYER.punchRange + car.length / 2) {
        car.hp -= PLAYER.punchDamage;
        spawnSparks(car.x, car.y, 4);
        if (car.hp <= 0) { car.dead = true; spawnSmoke(car.x, car.y, 8); }
      }
    }
    return events;
  }

  function stepShops(dt, input) {
    const p = state.player;
    const car = playerCar();
    // Safehouse: stand inside three seconds and the heat is gone.
    const sh = poi('safehouse');
    if (!car && dist(p.x, p.y, sh.x, sh.y) < sh.r) {
      p.safehouseTimer += dt;
      if (p.safehouseTimer >= 3 && (state.wanted > 0 || p.health < PLAYER.health)) {
        state.wanted = 0;
        p.health = PLAYER.health;
        p.safehouseTimer = 0;
        saveGame();
        say('Safehouse — wanted cleared, health restored, game saved.', 3);
        return EVENT_PICKUP;
      }
    } else {
      p.safehouseTimer = 0;
    }
    if (!input) return 0;
    if (input.buy) {
      input.buy = false;
      const g = poi('garage');
      if (!car && dist(p.x, p.y, g.x, g.y) < g.r + 40) {
        // Buy the next car you don't own, cheapest first.
        const order = ['taxi', 'truck', 'sports'];
        for (const type of order) {
          if (state.ownedCars.includes(type)) continue;
          if (type === 'sports' && state.rep < ECONOMY.sportsRepNeeded) {
            say(`Sports car needs REP ${ECONOMY.sportsRepNeeded} — finish missions first.`, 3);
            return 0;
          }
          if (state.cash < CAR_TYPES[type].price) {
            say(`Need $${CAR_TYPES[type].price} for the ${CAR_TYPES[type].name}. You have $${state.cash}.`, 3);
            return 0;
          }
          state.cash -= CAR_TYPES[type].price;
          state.ownedCars.push(type);
          state.garageCars.push(type);
          saveGame();
          say(`Bought the ${CAR_TYPES[type].name} for $${CAR_TYPES[type].price}. E at the garage to take it out.`, 3);
          return EVENT_PICKUP;
        }
        say('You own every car the garage sells.', 2);
        return 0;
      }
      const gs = poi('gun-shop');
      if (!car && dist(p.x, p.y, gs.x, gs.y) < gs.r) {
        if (state.cash < ECONOMY.ammoPrice) {
          say(`Ammo is $${ECONOMY.ammoPrice}. You have $${state.cash}.`, 2);
          return 0;
        }
        state.cash -= ECONOMY.ammoPrice;
        state.ammo += ECONOMY.ammoAmount;
        saveGame();
        say(`Bought ${ECONOMY.ammoAmount} rounds. Ammo ${state.ammo}.`, 2);
        return EVENT_PICKUP;
      }
    }
    if (input.enter) {
      // Paint shop: repaint the car you are driving.
      if (car) {
        const ps = poi('paint-shop');
        if (dist(car.x, car.y, ps.x, ps.y) < ps.r) {
          if (state.cash < ECONOMY.paintPrice) {
            say(`A paint job is $${ECONOMY.paintPrice}.`, 2);
            return 0;
          }
          state.cash -= ECONOMY.paintPrice;
          car.color = pick(random, ['#e5534b', '#3fa7d6', '#58b368', '#e8b93c', '#c9a0d8', '#f2efe6']);
          saveGame();
          say('Fresh paint. Looking sharp, Rico.', 2);
          return EVENT_PICKUP;
        }
        // Garage: park the car you are driving.
        const g = poi('garage');
        if (dist(car.x, car.y, g.x, g.y) < g.r) {
          if (!state.garageCars.includes(car.type)) state.garageCars.push(car.type);
          if (!state.ownedCars.includes(car.type)) state.ownedCars.push(car.type);
          exitCar(car);
          car.dead = true;
          saveGame();
          say(`Parked the ${CAR_TYPES[car.type].name} in the garage. It is yours now.`, 3);
          return EVENT_PICKUP;
        }
      }
    }
    return 0;
  }

  function stepCarCollisions(dt) {
    const cars = state.cars;
    for (let a = 0; a < cars.length; a += 1) {
      const ca = cars[a];
      if (ca.dead) continue;
      for (let b = a + 1; b < cars.length; b += 1) {
        const cb = cars[b];
        if (cb.dead) continue;
        const d = dist(ca.x, ca.y, cb.x, cb.y);
        const min = (ca.length + cb.length) / 2 - 6;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const nx = (cb.x - ca.x) / d;
          const ny = (cb.y - ca.y) / d;
          ca.x -= nx * push;
          ca.y -= ny * push;
          cb.x += nx * push;
          cb.y += ny * push;
          const impact = Math.abs(ca.speed - cb.speed);
          if (impact > 180) {
            ca.hp -= 4;
            cb.hp -= 4;
            spawnSparks((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, 5);
            state.shake = Math.max(state.shake, 3);
          }
          // Both lose speed in the impact; a sideways nudge breaks head-on
          // deadlocks so two cars slide past instead of shoving forever.
          ca.speed *= 0.55;
          cb.speed *= 0.55;
          if (impact < 200) {
            const side = (ca.id % 2 === 0 ? 1 : -1) * 5;
            ca.x += -ny * side;
            ca.y += nx * side;
            cb.x += ny * side;
            cb.y += -nx * side;
          }
        }
      }
    }
    // Player car running over pedestrians.
    const car = playerCar();
    if (car && Math.abs(car.speed) > 60) {
      for (const ped of state.peds) {
        if (!ped.down && dist(car.x, car.y, ped.x, ped.y) < car.length / 2 + 8) {
          ped.down = true;
          ped.downTimer = 6;
          addWanted(1, 'runover');
          state.shake = Math.max(state.shake, 4);
        }
      }
    }
  }

  function stepParticles(dt) {
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    for (const s of state.skids) s.life -= dt;
    state.skids = state.skids.filter((s) => s.life > 0);
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 22);
  }

  function stepCamera(dt) {
    const pos = playerPos();
    const tx = clamp(pos.x - 1280 / 2, 0, Math.max(0, WORLD.width - 1280));
    const ty = clamp(pos.y - 720 / 2, 0, Math.max(0, WORLD.height - 720));
    state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 5);
  }

  function step(dt, input, opts) {
    let events = 0;
    const harmless = opts && opts.harmless;
    state.time += dt;
    state.dayTime = (state.dayTime + dt / DAY.cycleSeconds) % 1;
    state.tideTime += dt;
    state.tideLevel = (Math.sin((state.tideTime / TIDE.cycleSeconds) * TAU) + 1) / 2;
    if (input && input.radio) {
      input.radio = false;
      state.radioStation = (state.radioStation + 1) % 3;
    }

    stepTraffic(dt);
    stepPeds(dt);
    stepBullets(dt);
    stepParticles(dt);
    if (!harmless) {
      events |= stepPlayer(dt, input || {});
      events |= stepShops(dt, input || {});
      const policeEvents = stepPolice(dt);
      if (policeEvents & EVENT_BUSTED) {
        events |= EVENT_BUSTED;
        doBusted();
      }
      stepHeli(dt);
      events |= stepMission(dt);
      stepCarCollisions(dt);
      // Player health: hard crashes hurt.
      const car = playerCar();
      if (car && car.hp < 20 && Math.random() < 0.01) {
        state.player.health -= 1;
      }
      if (state.player.health <= 0) {
        state.player.health = PLAYER.health;
        state.wanted = 0;
        const h = poi('hospital');
        state.player.x = h.x;
        state.player.y = h.y + 80;
        state.player.inCar = null;
        state.player.inBoat = false;
        state.player.inHeli = false;
        state.cash = Math.max(0, state.cash - 100);
        say('You woke up at Solmar General. The hospital kept $100.', 3);
        events |= EVENT_WASTED;
      }
    }
    stepCamera(dt);
    return events;
  }

  function doBusted() {
    const lost = Math.min(state.cash, 150);
    state.cash -= lost;
    state.stats.bustedCount += 1;
    state.wanted = 0;
    state.bustTimer = 0;
    const car = playerCar();
    if (car) {
      car.driver = null;
      car.dead = true;
    }
    state.player.inCar = null;
    state.player.inBoat = false;
    state.player.inHeli = false;
    const sh = poi('safehouse');
    state.player.x = sh.x;
    state.player.y = sh.y + 60;
    state.player.health = PLAYER.health;
    saveGame();
    say(`BUSTED — the Solmar PD took $${lost} and dropped you at the safehouse.`, 4);
  }

  reset();

  return {
    state,
    city,
    reset,
    step,
    saveGame,
    loadSave,
    currentMission,
    currentStep,
    missionTarget,
    playerCar,
    playerPos,
    // Test hooks for the autopilot sim: teleport, set the weather and the heat,
    // hand out cash, jump to a mission. The game itself never calls these.
    debug: {
      teleport(x, y) {
        const car = playerCar();
        if (car) { car.x = x; car.y = y; car.speed = 0; }
        else { state.player.x = x; state.player.y = y; }
      },
      setWanted(n) { state.wanted = clamp(n, 0, WANTED.max); state.wantedCleanTimer = 0; },
      setTide(level) {
        state.tideLevel = clamp(level, 0, 1);
        state.tideTime = (Math.asin(clamp(level * 2 - 1, -1, 1)) / TAU) * TIDE.cycleSeconds;
      },
      setDay(t) { state.dayTime = t % 1; },
      giveCash(n) { state.cash += n; },
      setMission(i) {
        state.missionIndex = clamp(i, 0, MISSIONS.length - 1);
        state.missionStep = 0;
        state.collected = [];
        state.checkpointsHit = [];
      },
      clearPolice() {
        for (const car of state.cars) if (car.type === 'cruiser') car.dead = true;
        state.cars = state.cars.filter((c) => !c.dead);
      },
      spawnCar(type, x, y) {
        const car = makeCar(carId++, type, x, y, 0);
        state.cars.push(car);
        return car;
      },
      forceHeli() {
        state.heli.active = true;
        state.heli.hp = 3;
        state.heli.x = state.player.x - 200;
        state.heli.y = state.player.y - 200;
      },
      state() { return state; },
    },
  };
}

export { GANGS };
