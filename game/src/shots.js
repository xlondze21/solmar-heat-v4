// The screenshot scenes behind ?shot=cover|drive|mission|chase. Each one stages
// the real game — the same world, the same rules, the same seeded traffic —
// then drives it forward a few seconds with a simple autopilot, so the frame
// is what a short game really looks like and the same seed always gives the
// same frame. The cover shows several systems at once: a police helicopter,
// three wanted stars, the minimap and a mission objective.
import { STEP } from './config.js';
import { SCREEN_PLAY } from './render.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Steer the player's car toward a point; throttle forward.
function driveToward(game, tx, ty) {
  const car = game.playerCar();
  if (!car) return { x: 0, y: 0 };
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(want, car.angle);
  return { x: clamp(diff * 2.4, -1, 1), y: -1 };
}

// Walk the player toward a point.
function walkToward(game, tx, ty) {
  const p = game.state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

function putPlayerInCar(game, car, x, y, angle) {
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  car.driver = 'player';
  game.state.player.inCar = car.id;
  game.state.player.inBoat = false;
  game.state.player.inHeli = false;
}

function runSeconds(game, seconds, inputFn) {
  for (let i = 0; i < seconds / STEP; i += 1) {
    game.step(STEP, inputFn ? inputFn() : {}, {});
  }
}

export function stageShot(name, game) {
  const s = game.state;
  const dbg = game.debug;
  const sports = game.state.cars.find((c) => c.missionCar === 'solmar-crown');
  const sedan = game.state.cars.find((c) => c.type === 'sedan' && !c.missionCar);

  if (name === 'cover') {
    // Golden dusk, three stars, heli overhead, cruisers closing in, and a
    // mission objective on the tracker: the crown job's getaway.
    dbg.setDay(0.62);
    dbg.setMission(0);
    s.missionStep = 2;
    putPlayerInCar(game, sports, 1103, 1103, 0.1);
    sports.speed = 300;
    dbg.setWanted(3);
    dbg.forceHeli();
    const c1 = dbg.spawnCar('cruiser', 880, 1000);
    c1.driver = 'police';
    const c2 = dbg.spawnCar('cruiser', 920, 1200);
    c2.driver = 'police';
    runSeconds(game, 1.2, () => driveToward(game, 2200, 1103));
    // Pin the final frame: the getaway car at speed, the helicopter clearly
    // in frame up and to the right of it, a cruiser closing in behind.
    const pc = game.playerCar();
    if (pc) pc.speed = 380;
    s.heli.x = (pc ? pc.x : 1300) + 190;
    s.heli.y = (pc ? pc.y : 1100) - 150;
    return { screen: SCREEN_PLAY };
  }

  if (name === 'drive') {
    // Bright late morning on the main avenue, in a stolen sedan, traffic
    // flowing around and the first job waiting on the tracker.
    dbg.setDay(0.45);
    dbg.setMission(0);
    putPlayerInCar(game, sedan, 671, 671, 0);
    sedan.speed = 260;
    runSeconds(game, 5, () => driveToward(game, 2000, 671));
    if (sedan.speed < 60) sedan.speed = 260;
    return { screen: SCREEN_PLAY };
  }

  if (name === 'mission') {
    // On foot at the fish market, second job: the crate is waiting and the
    // gold marker is right there.
    dbg.setDay(0.35);
    dbg.setMission(1);
    const market = game.city.pois['fish-market'];
    dbg.teleport(market.x - 200, market.y + 100);
    s.player.angle = Math.atan2(market.y - s.player.y, market.x - s.player.x);
    runSeconds(game, 0.3, () => walkToward(game, market.x, market.y));
    return { screen: SCREEN_PLAY };
  }

  // chase: five stars at night, the whole department after Rico.
  dbg.setDay(0.88);
  dbg.setMission(9);
  putPlayerInCar(game, sports, 1319, 1319, -Math.PI / 2);
  sports.speed = 380;
  dbg.setWanted(5);
  dbg.forceHeli();
  for (const [x, y] of [[1100, 1150], [1500, 1200], [1250, 1550], [1450, 1050]]) {
    const c = dbg.spawnCar('cruiser', x, y);
    c.driver = 'police';
  }
  runSeconds(game, 2.5, () => driveToward(game, 1319, 200));
  // Pin the final frame: the sports car fleeing north at speed, the
  // helicopter in frame above it, cruisers closing in from behind.
  const pc = game.playerCar();
  if (pc) pc.speed = 420;
  s.heli.x = (pc ? pc.x : 1300) + 150;
  s.heli.y = (pc ? pc.y : 800) - 180;
  return { screen: SCREEN_PLAY };
}
