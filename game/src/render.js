// Drawing only: the game state and the current screen in, pixels out. The
// 1280x720 logical viewport is scaled to fit the window and centred on the
// camera; the margin is filled with the backdrop colour. Canvas shapes and
// text only — every asset is drawn, nothing is loaded.
import { BEACH, BLOCK, CAR_TYPES, CITY, FONT, GRID, PALETTE, ROAD, VIEW, WORLD } from './config.js';
import { blockRect, isBeach, roadCenter, waterLineY } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const TAU = Math.PI * 2;

// Daylight: 1 at noon (dayTime 0.5), 0 at midnight (dayTime 0 or 1).
export function daylight(dayTime) {
  return 0.5 - 0.5 * Math.cos(dayTime * TAU);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function rect(x, y, w, h, color) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, TAU);
    context.fill();
  }

  function drawGround(game) {
    const s = game.state;
    // Grass base for the whole world.
    rect(0, 0, WORLD.width, WORLD.height, PALETTE.grass);
    // Beach band and sea.
    rect(0, CITY, WORLD.width, BEACH, PALETTE.sand);
    rect(0, CITY + BEACH, WORLD.width, WORLD.height - CITY - BEACH, PALETTE.waterDeep);
    // The live waterline slides with the tide; waves shimmer on it.
    const wl = waterLineY(s.tideLevel);
    rect(0, wl, WORLD.width, WORLD.height - wl, PALETTE.water);
    context.strokeStyle = 'rgba(255,255,255,0.25)';
    context.lineWidth = 2;
    for (let x = 0; x < WORLD.width; x += 90) {
      const y = wl + 8 + Math.sin(x * 0.02 + s.time * 1.5) * 4;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + 44, y);
      context.stroke();
    }
    // Marina basin water.
    const b = game.city.marinaBasin;
    rect(b.x, b.y, b.w, b.h, PALETTE.water);
  }

  function drawRoads() {
    // Sidewalk slabs: every block gets a pale border, then the road strips.
    for (let row = 0; row < GRID; row += 1) {
      for (let col = 0; col < GRID; col += 1) {
        const r = blockRect(col, row);
        rect(r.x - 6, r.y - 6, r.w + 12, r.h + 12, PALETTE.sidewalk);
        rect(r.x, r.y, r.w, r.h, PALETTE.grassDry);
      }
    }
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i);
      rect(c - ROAD / 2, 0, ROAD, CITY, PALETTE.road);
      rect(0, c - ROAD / 2, CITY, ROAD, PALETTE.road);
    }
    // Centre dashes.
    context.fillStyle = PALETTE.roadLine;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i);
      for (let y = 0; y < CITY; y += 64) context.fillRect(c - 2, y + 8, 4, 30);
      for (let x = 0; x < CITY; x += 64) context.fillRect(x + 8, c - 2, 30, 4);
    }
  }

  function drawGangTurf(game) {
    for (const gang of game.city.gangs) {
      context.globalAlpha = 0.16;
      context.fillStyle = gang.color;
      for (const [col, row] of gang.blocks) {
        const r = blockRect(col, row);
        context.fillRect(r.x, r.y, r.w, r.h);
      }
      context.globalAlpha = 1;
    }
  }

  function drawBuildings(game) {
    for (const b of game.city.buildings) {
      const base = b.kind === 'oldtown' ? PALETTE.oldTown : b.kind === 'market' ? PALETTE.market : PALETTE.building;
      rect(b.x, b.y, b.w, b.h, base);
      rect(b.x + 5, b.y + 5, b.w - 10, b.h - 10, PALETTE.buildingRoof);
      // Windows.
      context.fillStyle = 'rgba(255, 230, 150, 0.55)';
      for (let wx = b.x + 12; wx < b.x + b.w - 12; wx += 22) {
        for (let wy = b.y + 12; wy < b.y + b.h - 12; wy += 22) {
          context.fillRect(wx, wy, 9, 9);
        }
      }
    }
    // Signs: hospital cross, market awning, garage door, safehouse star.
    const pois = game.city.pois;
    text('H', pois.hospital.x, pois.hospital.y, 34, '#ffffff', 'center', 'middle');
    text('FISH', pois['fish-market'].x, pois['fish-market'].y - 8, 18, '#ffffff', 'center', 'middle');
    text('GARAGE', pois.garage.x, pois.garage.y - 8, 16, '#ffffff', 'center', 'middle');
    text('SAFEHOUSE', pois.safehouse.x, pois.safehouse.y - 8, 14, '#ffffff', 'center', 'middle');
    // Helipad circle.
    context.strokeStyle = '#ffffff';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(pois.helipad.x, pois.helipad.y, 34, 0, TAU);
    context.stroke();
    text('H', pois.helipad.x, pois.helipad.y, 28, '#ffffff', 'center', 'middle');
  }

  function drawSkids(game) {
    context.strokeStyle = 'rgba(20, 20, 20, 0.5)';
    context.lineWidth = 5;
    for (const s of game.state.skids) {
      context.globalAlpha = Math.min(1, s.life / 3);
      context.beginPath();
      context.moveTo(s.x - Math.cos(s.angle) * 14, s.y - Math.sin(s.angle) * 14);
      context.lineTo(s.x + Math.cos(s.angle) * 14, s.y + Math.sin(s.angle) * 14);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function drawCar(game, car) {
    const s = game.state;
    if (car.dead) return;
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const spec = CAR_TYPES[car.type];
    if (car.type === 'boat') {
      // Wake.
      context.strokeStyle = 'rgba(255,255,255,0.5)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(-spec.length / 2, -spec.width / 2);
      context.lineTo(-spec.length / 2 - 18 - Math.abs(car.speed) * 0.08, -spec.width / 2 - 8);
      context.moveTo(-spec.length / 2, spec.width / 2);
      context.lineTo(-spec.length / 2 - 18 - Math.abs(car.speed) * 0.08, spec.width / 2 + 8);
      context.stroke();
    }
    if (car.type === 'heli') {
      // Shadow far below, rotor disc above.
      context.fillStyle = 'rgba(0,0,0,0.3)';
      context.beginPath();
      context.ellipse(26, 34, 22, 10, 0, 0, TAU);
      context.fill();
    }
    rect(-spec.length / 2, -spec.width / 2, spec.length, spec.width, car.color);
    rect(-spec.length / 2 + 6, -spec.width / 2 + 4, spec.length - 12, spec.width - 8, 'rgba(0,0,0,0.25)');
    // Windshield.
    rect(spec.length / 2 - 14, -spec.width / 2 + 3, 8, spec.width - 6, '#9fc6d8');
    // Headlights at night.
    if (daylight(s.dayTime) < 0.4) {
      context.fillStyle = 'rgba(255, 244, 180, 0.85)';
      context.beginPath();
      context.arc(spec.length / 2, -spec.width / 2 + 4, 3, 0, TAU);
      context.arc(spec.length / 2, spec.width / 2 - 4, 3, 0, TAU);
      context.fill();
    }
    if (car.type === 'cruiser') {
      const flash = Math.floor(s.time * 6) % 2 === 0 ? '#ff4444' : '#4488ff';
      circle(0, 0, 5, flash);
      text('PD', 0, 2, 10, '#ffffff', 'center', 'middle');
    }
    if (car.type === 'taxi') text('TAXI', 0, 3, 9, '#222222', 'center', 'middle');
    if (car.type === 'heli') {
      context.strokeStyle = '#222';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-spec.length / 2 - 10, 0);
      context.lineTo(spec.length / 2 + 10, 0);
      context.stroke();
      circle(0, 0, 4, '#c94f42');
    }
    context.restore();
    // Smoke from a damaged car.
    if (car.hp < 55) {
      context.globalAlpha = 0.5;
      circle(car.x + (Math.random() - 0.5) * 10, car.y - 8, 6, '#888888');
      context.globalAlpha = 1;
    }
  }

  function drawPeds(game) {
    for (const ped of game.state.peds) {
      if (ped.down) {
        context.save();
        context.translate(ped.x, ped.y);
        context.rotate(ped.angle);
        rect(-10, -4, 20, 8, ped.color);
        context.restore();
        text('x_x', ped.x, ped.y - 12, 12, '#ffffff', 'center', 'middle');
      } else {
        circle(ped.x, ped.y, 9, ped.color);
        circle(ped.x + Math.cos(ped.angle) * 5, ped.y + Math.sin(ped.angle) * 5, 4, '#e8c39a');
        if (ped.state === 'flee') text('!', ped.x, ped.y - 14, 14, '#ffffff', 'center', 'middle');
      }
    }
  }

  function drawPlayer(game) {
    const s = game.state;
    const p = s.player;
    if (p.inCar || p.inHeli) return;
    // Rico: dark jacket, gold chain dot, facing his angle.
    circle(p.x, p.y, 13, '#2b2b3a');
    circle(p.x + Math.cos(p.angle) * 6, p.y + Math.sin(p.angle) * 6, 5, '#e8c39a');
    circle(p.x, p.y, 3, '#e8b93c');
    if (s.ammo > 0) {
      // Aim tick toward the mouse.
      const a = Math.atan2(p.aimY - p.y, p.aimX - p.x);
      context.strokeStyle = 'rgba(255,255,255,0.8)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(p.x + Math.cos(a) * 30, p.y + Math.sin(a) * 30, 7, 0, TAU);
      context.stroke();
    }
  }

  function drawBullets(game) {
    context.strokeStyle = '#ffe9a8';
    context.lineWidth = 3;
    for (const b of game.state.bullets) {
      context.beginPath();
      context.moveTo(b.x - Math.cos(b.angle) * 12, b.y - Math.sin(b.angle) * 12);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  function drawParticles(game) {
    for (const pt of game.state.particles) {
      context.globalAlpha = Math.max(0, pt.life / pt.max);
      circle(pt.x, pt.y, pt.kind === 'spark' ? 2.5 : 7, pt.kind === 'spark' ? '#ffb347' : '#8a8a8a');
    }
    context.globalAlpha = 1;
  }

  function drawMissionMarker(game) {
    const target = game.missionTarget();
    if (!target) return;
    const s = game.state;
    const pulse = 1 + Math.sin(s.time * 4) * 0.15;
    context.strokeStyle = '#ffd34d';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(target.x, target.y, (target.r || 60) * pulse, 0, TAU);
    context.stroke();
    context.fillStyle = '#ffd34d';
    context.beginPath();
    context.moveTo(target.x, target.y - (target.r || 60) - 26);
    context.lineTo(target.x - 10, target.y - (target.r || 60) - 6);
    context.lineTo(target.x + 10, target.y - (target.r || 60) - 6);
    context.closePath();
    context.fill();
    // A beam so the marker reads from far away.
    context.globalAlpha = 0.25;
    rect(target.x - 3, target.y - 320, 6, 320, '#ffd34d');
    context.globalAlpha = 1;
  }

  function drawHeli(game) {
    const s = game.state;
    const h = s.heli;
    if (h.active) {
      // Searchlight cone onto the player.
      const pos = game.playerPos();
      context.save();
      context.globalAlpha = 0.18;
      context.fillStyle = '#fff8c0';
      context.beginPath();
      context.moveTo(h.x, h.y);
      context.lineTo(pos.x - 46, pos.y - 46);
      context.lineTo(pos.x + 46, pos.y + 46);
      context.closePath();
      context.fill();
      context.restore();
      circle(pos.x, pos.y, 40, 'rgba(255, 248, 192, 0.15)');
      drawCar(game, { ...h, type: 'heli', color: '#31435c', length: 58, width: 26, dead: false, hp: h.hp, speed: 0 });
      // A rotor disc and a label so the helicopter reads as one at a glance.
      context.globalAlpha = 0.14;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(h.x, h.y, 34, 0, TAU);
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = 'rgba(255,255,255,0.7)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(h.x, h.y, 34, 0, TAU);
      context.stroke();
      text('HELI', h.x, h.y - 42, 13, '#ffffff', 'center', 'middle');
      text('PD', h.x, h.y - 34, 12, '#ffffff', 'center', 'middle');
    }
    // The parked hospital helicopter.
    if (!s.player.inHeli) {
      context.strokeStyle = 'rgba(255,255,255,0.6)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(s.parkedHeli.x, s.parkedHeli.y, 40, 0, TAU);
      context.stroke();
      drawCar(game, { x: s.parkedHeli.x, y: s.parkedHeli.y, angle: -Math.PI / 2, type: 'heli', color: '#31435c', length: 58, width: 26, dead: false, hp: 100, speed: 0 });
    }
  }

  function drawLighting(game) {
    const s = game.state;
    const light = daylight(s.dayTime);
    // Dusk warmth, then night darkness.
    if (light < 0.85) {
      const dusk = light > 0.45 ? `rgba(255, 120, 40, ${(0.85 - light) * 0.22})` : `rgba(8, 10, 30, ${(0.55 - light) * 0.9})`;
      context.fillStyle = dusk;
      context.fillRect(0, 0, WORLD.width, WORLD.height);
    }
    if (light < 0.4) {
      // Headlight cones from the player's car at night.
      const car = game.playerCar();
      if (car) {
        context.save();
        context.globalAlpha = 0.1;
        context.fillStyle = '#fff4b4';
        context.beginPath();
        context.moveTo(car.x, car.y);
        const a = car.angle;
        context.lineTo(car.x + Math.cos(a - 0.25) * 260, car.y + Math.sin(a - 0.25) * 260);
        context.lineTo(car.x + Math.cos(a + 0.25) * 260, car.y + Math.sin(a + 0.25) * 260);
        context.closePath();
        context.fill();
        context.restore();
      }
    }
  }

  function drawMinimap(game) {
    const s = game.state;
    const MW = 208;
    const MH = 208;
    const MX = VIEW.width - MW - 16;
    const MY = 16;
    const scale = MW / WORLD.width;
    context.save();
    context.fillStyle = PALETTE.hud;
    context.fillRect(MX - 6, MY - 6, MW + 12, MH + 12);
    context.beginPath();
    context.rect(MX, MY, MW, MH);
    context.clip();
    rect(MX, MY, MW, MH, '#2c4a2c');
    // Sea and beach.
    context.fillStyle = PALETTE.water;
    context.fillRect(MX, MY + CITY * scale, MW, (WORLD.height - CITY) * scale);
    context.fillStyle = PALETTE.sand;
    context.fillRect(MX, MY + CITY * scale, MW, BEACH * scale);
    // Roads.
    context.fillStyle = PALETTE.road;
    for (let i = 0; i <= GRID; i += 1) {
      const c = roadCenter(i) * scale;
      context.fillRect(MX + c - 2, MY, 4, CITY * scale);
      context.fillRect(MX, MY + c - 2, CITY * scale, 4);
    }
    // Gang turf.
    for (const gang of game.city.gangs) {
      context.globalAlpha = 0.5;
      context.fillStyle = gang.color;
      for (const [col, row] of gang.blocks) {
        const r = blockRect(col, row);
        context.fillRect(MX + r.x * scale, MY + r.y * scale, r.w * scale, r.h * scale);
      }
      context.globalAlpha = 1;
    }
    // Mission target.
    const target = game.missionTarget();
    if (target) {
      circle(MX + target.x * scale, MY + target.y * scale, 6, '#ffd34d');
    }
    // Police blips, player arrow.
    for (const car of s.cars) {
      if (car.type === 'cruiser' && !car.dead) circle(MX + car.x * scale, MY + car.y * scale, 3.5, '#ff4444');
    }
    if (s.heli.active) circle(MX + s.heli.x * scale, MY + s.heli.y * scale, 4, '#ff8844');
    const pos = game.playerPos();
    context.save();
    context.translate(MX + pos.x * scale, MY + pos.y * scale);
    context.rotate(s.player.inCar && game.playerCar() ? game.playerCar().angle : s.player.angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-6, -5);
    context.lineTo(-6, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    text('SOLMAR', MX + MW / 2, MY + MH + 22, 13, PALETTE.muted, 'center');
  }

  function drawHud(game) {
    const s = game.state;
    const car = game.playerCar();
    // Top-left: cash, health, REP.
    context.fillStyle = PALETTE.hud;
    context.fillRect(14, 14, 250, 86);
    text(`$${s.cash}`, 26, 44, 28, '#7be07b', 'left');
    text(`REP ${s.rep}`, 26, 72, 16, PALETTE.text, 'left');
    text(`AMMO ${s.ammo}`, 150, 72, 16, PALETTE.text, 'left');
    rect(26, 80, 200, 10, '#333');
    rect(26, 80, 200 * Math.max(0, s.player.health / 100), 10, s.player.health > 40 ? '#7be07b' : '#e5534b');
    // Wanted stars, top centre.
    const cx = VIEW.width / 2;
    for (let i = 0; i < 5; i += 1) {
      text('★', cx - 70 + i * 30, 46, 30, i < s.wanted ? '#ffd34d' : 'rgba(255,255,255,0.25)', 'center');
    }
    if (s.wanted > 0) text(`WANTED ${s.wanted}`, cx, 72, 15, '#ffd34d', 'center');
    // Mission tracker, bottom-left.
    const m = game.currentMission();
    const step = game.currentStep();
    context.fillStyle = PALETTE.hud;
    const lines = [`${m.name}  ($${m.reward})`, step.label, s.missionTimer > 0 ? `TIME ${Math.ceil(s.missionTimer)}s` : ''];
    context.fillRect(14, VIEW.height - 96, 420, 82);
    text(lines[0], 26, VIEW.height - 66, 18, '#ffd34d', 'left');
    text(lines[1], 26, VIEW.height - 42, 16, PALETTE.text, 'left');
    if (lines[2]) text(lines[2], 26, VIEW.height - 20, 16, '#e5534b', 'left');
    // Speed, radio and tide, bottom-right.
    const speed = car ? Math.round(Math.abs(car.speed) * 0.18) : 0;
    context.fillStyle = PALETTE.hud;
    context.fillRect(VIEW.width - 264, VIEW.height - 96, 250, 82);
    text(car ? `${speed} km/h` : 'ON FOOT', VIEW.width - 26, VIEW.height - 62, 24, PALETTE.text, 'right');
    text(car ? CAR_TYPES[car.type].name : 'Rico', VIEW.width - 26, VIEW.height - 38, 15, PALETTE.muted, 'right');
    text(`♪ ${game.state.radioStation === 0 ? 'SOLMAR FM' : game.state.radioStation === 1 ? 'TIDE 88' : 'GULL ROCK'}  [R]`, VIEW.width - 26, VIEW.height - 18, 14, PALETTE.accent, 'right');
    // Tide gauge, above the speed box.
    const tideOpen = s.tideLevel < 0.32;
    context.fillStyle = PALETTE.hud;
    context.fillRect(VIEW.width - 264, VIEW.height - 132, 250, 28);
    text('TIDE', VIEW.width - 252, VIEW.height - 112, 14, PALETTE.text, 'left');
    rect(VIEW.width - 200, VIEW.height - 124, 150, 10, '#1d5f7a');
    rect(VIEW.width - 200, VIEW.height - 124, 150 * s.tideLevel, 10, '#3fa7d6');
    text(tideOpen ? 'LOW — sand road open' : 'HIGH', VIEW.width - 44, VIEW.height - 112, 13, tideOpen ? '#7be07b' : PALETTE.muted, 'right');
    // Day/night + heat hint, below the toast so the two never overlap.
    const isNight = daylight(s.dayTime) < 0.35;
    const isNoon = s.dayTime > 0.42 && s.dayTime < 0.58;
    text(isNight ? 'NIGHT — the city sleeps, the fares pay' : isNoon ? 'NOON HEAT — cops are jumpy' : 'SOLMAR', 26, 152, 15, isNoon ? '#ffb347' : PALETTE.muted, 'left');
    // Toast message.
    if (s.messageTimer > 0 && s.message) {
      context.fillStyle = PALETTE.hud;
      const w = Math.min(720, 40 + s.message.length * 9);
      context.fillRect((VIEW.width - w) / 2, 92, w, 34);
      text(s.message, VIEW.width / 2, 116, 17, PALETTE.text, 'center');
    }
    // Context hint.
    const hint = contextHint(game);
    if (hint) {
      context.fillStyle = PALETTE.hud;
      context.fillRect((VIEW.width - 320) / 2, VIEW.height - 150, 320, 30);
      text(hint, VIEW.width / 2, VIEW.height - 129, 15, PALETTE.accent, 'center');
    }
  }

  function contextHint(game) {
    const s = game.state;
    const p = s.player;
    const car = game.playerCar();
    const near = (name) => {
      const poi = game.city.pois[name];
      const pos = game.playerPos();
      return Math.hypot(pos.x - poi.x, pos.y - poi.y) < (poi.r || 80);
    };
    if (!car && !p.inHeli) {
      if (near('helipad')) return 'E — take the hospital helicopter';
      if (near('garage') && s.garageCars.length > 0) return 'E — take a car out of the garage   B — buy a car';
      if (near('garage')) return 'B — buy a car at the garage';
      if (near('gun-shop')) return 'E / B — buy ammo ($100)';
      if (near('marina-boat')) return 'E — board the skiff';
      const nearCar = game.state.cars.find((c) => !c.dead && c.type !== 'cruiser' && c.type !== 'boat' && c.type !== 'heli' && Math.hypot(c.x - p.x, c.y - p.y) < 64);
      if (nearCar) return 'E — get in the car';
    }
    if (car && (near('paint-shop') || near('garage'))) return 'E — paint / park here';
    if (p.inHeli) return 'E — land the helicopter';
    return '';
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const height = 150 + lines.length * 32 + 60;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(10, 12, 18, 0.88)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.accent;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 62, 44, PALETTE.accent, 'center');
    lines.forEach((line, i) => text(line, VIEW.width / 2, y + 116 + i * 32, 20, PALETTE.text, 'center'));
    text(prompt, VIEW.width / 2, y + height - 30, 20, '#ffd34d', 'center');
  }

  function draw(game, screen) {
    const s = game.state;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = s.shake > 0 ? (Math.random() - 0.5) * s.shake : 0;
    const shakeY = s.shake > 0 ? (Math.random() - 0.5) * s.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x - s.camera.x * view.scale + shakeX * view.scale, view.y - s.camera.y * view.scale + shakeY * view.scale);
    drawGround(game);
    drawRoads();
    drawGangTurf(game);
    drawBuildings(game);
    drawSkids(game);
    drawMissionMarker(game);
    for (const car of s.cars) drawCar(game, car);
    drawPeds(game);
    drawPlayer(game);
    drawBullets(game);
    drawParticles(game);
    drawHeli(game);
    drawLighting(game);
    // HUD in screen space.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawPanel('SOLMAR HEAT', [
        'Rico is back in Solmar — a dusk-lit port city of marinas,',
        'fish markets and old-town streets. Steal cars, run ten jobs,',
        'outrun the Solmar PD, and take the crown.',
        'WASD drive / walk · E enter car · F punch · Click shoot',
        'R radio · B buy · P pause · Gold marker is your next job',
      ], 'Press Space or click to start');
      return;
    }
    drawHud(game);
    drawMinimap(game);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits. Your save is safe.', `Cash $${s.cash} · REP ${s.rep} · Mission ${s.missionIndex + 1}/10`], 'Press P to keep playing');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmar PD caught up with Rico.', 'They took their cut and dropped him at the safehouse.'], 'Press Space to get back out there');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Rico woke up at Solmar General.', 'The hospital kept $100 for the trouble.'], 'Press Space to get back out there');
    }
  }

  function screenToWorld(clientX, clientY, camera) {
    const ratio = window.devicePixelRatio || 1;
    return {
      x: (clientX * ratio - view.x) / view.scale + camera.x,
      y: (clientY * ratio - view.y) / view.scale + camera.y,
    };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, screenToWorld };
}
