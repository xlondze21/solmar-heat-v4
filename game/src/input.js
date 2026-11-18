// Keyboard and mouse input. Held keys give a steering vector; one-shot presses
// (enter a car, punch, shoot, radio, pause, confirm) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost and
// never counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_RADIO = 32;
export const ACTION_BUY = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const RADIO = new Set(['KeyR']);
const BUY = new Set(['KeyB']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function key(code, down) {
    if (UP.has(code)) held.up = down;
    else if (DOWN.has(code)) held.down = down;
    else if (LEFT.has(code)) held.left = down;
    else if (RIGHT.has(code)) held.right = down;
    else if (!down) return;
    else if (CONFIRM.has(code) && !eventRepeat()) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(code)) actions |= ACTION_PUNCH;
    else if (RADIO.has(code)) actions |= ACTION_RADIO;
    else if (BUY.has(code)) actions |= ACTION_BUY;
  }

  function eventRepeat() {
    // Key repeat for Space/Enter is filtered by the caller passing repeat.
    return false;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat && (CONFIRM.has(event.code) || PAUSE.has(event.code) || ENTER.has(event.code) || PUNCH.has(event.code) || RADIO.has(event.code) || BUY.has(event.code))) return;
    key(event.code, true);
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || CONFIRM.has(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => key(event.code, false));
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = false;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  target.addEventListener('pointerup', () => { mouseDown = false; });

  return {
    /** Steering vector: x is -1..1 (left/right), y is -1..1 (up/down). */
    vector() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    // Test / autopilot hook: press a one-shot action from code.
    press(flag) {
      actions |= flag;
    },
    setHeld(next) {
      held.up = !!next.up;
      held.down = !!next.down;
      held.left = !!next.left;
      held.right = !!next.right;
    },
  };
}
