// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, busted and wasted. Sounds are wired to the world's event flags.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|drive|mission|chase
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createGame, EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, EVENT_STEAL, EVENT_WASTED } from './world.js';
import { ACTION_BUY, ACTION_CONFIRM, ACTION_ENTER, ACTION_PAUSE, ACTION_PUNCH, ACTION_RADIO, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function runShot(name) {
  const scene = stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game, scene.screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let radioWasOn = false;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    game.reset();
    audio.unlock();
    audio.setRadioOn(false);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Follow the gold marker — your first job is First Fare.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_BUSTED || screen === SCREEN_WASTED)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function buildInput(actions) {
    const vector = input.vector();
    const mouse = input.mouse();
    const aim = renderer.screenToWorld(mouse.x, mouse.y, game.state.camera);
    return {
      x: vector.x,
      y: vector.y,
      enter: !!(actions & ACTION_ENTER),
      punch: !!(actions & ACTION_PUNCH),
      shoot: mouse.down && screen === SCREEN_PLAY,
      radio: !!(actions & ACTION_RADIO),
      buy: !!(actions & ACTION_BUY),
      aimX: aim.x,
      aimY: aim.y,
    };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // The city lives behind the title: traffic drives, peds stroll.
      game.step(STEP, {}, { harmless: true });
      return;
    }
    const actions = input.takeActions();
    const worldInput = buildInput(actions);
    game.state.player.aimX = worldInput.aimX;
    game.state.player.aimY = worldInput.aimY;
    const events = game.step(STEP, worldInput, {});
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & (EVENT_PICKUP | EVENT_STEAL)) audio.pickup();
    if (events & EVENT_MISSION_DONE) audio.missionDone();
    if (events & EVENT_MISSION_FAIL) audio.busted();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_BUSTED) {
      audio.busted();
      screen = SCREEN_BUSTED;
      announce('Busted. The Solmar PD took their cut.');
    } else if (events & EVENT_WASTED) {
      audio.busted();
      screen = SCREEN_WASTED;
      announce('Wasted. You woke up at Solmar General.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // Sound follows the world: engine by speed, siren by heat, radio in a car.
    const car = game.playerCar();
    const speedRatio = car ? Math.min(1, Math.abs(car.speed) / 560) : 0;
    audio.engine(speedRatio, !!car);
    const nearestCop = game.state.cars.reduce((best, c) => {
      if (c.type !== 'cruiser' || c.dead) return best;
      const d = Math.hypot(c.x - game.state.player.x, c.y - game.state.player.y);
      return Math.min(best, d);
    }, Infinity);
    audio.siren(game.state.wanted > 0, nearestCop < 320);
    const inCar = !!car;
    if (inCar !== radioWasOn) {
      audio.setRadioOn(inCar);
      radioWasOn = inCar;
    }
    if (inCar && game.state.radioStation !== audio._station) {
      audio.setRadio(game.state.radioStation);
      audio._station = game.state.radioStation;
    }
    renderer.draw(game, screen);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
