// Solmar Heat — every tuning number, colour and story beat in one place.
// The city is a 12x12 block grid with a beach and sea to the south; the camera
// follows the player across a 1280x720 logical viewport, so no rule here
// depends on the screen size.
export const STEP = 1 / 60;
export const VIEW = { width: 1280, height: 720 };

export const BLOCK = 170;
export const ROAD = 46;
export const GRID = 12;
// 12 blocks + 13 roads across, then a beach strip and open sea to the south.
export const CITY = GRID * BLOCK + (GRID + 1) * ROAD; // 2638
export const BEACH = 130;
export const SEA = 260;
export const WORLD = { width: CITY, height: CITY + BEACH + SEA };

export const SAVE_KEY = 'solmar-heat.save.v4';

export const PLAYER = {
  walkSpeed: 235,
  radius: 13,
  health: 100,
  punchDamage: 34,
  punchRange: 46,
  punchCooldown: 0.45,
  shootCooldown: 0.28,
  bulletSpeed: 780,
  bulletRange: 520,
};

export const CAR_TYPES = {
  sedan:  { name: 'Sedan',  topSpeed: 420, accel: 300, grip: 3.4, length: 46, width: 22, price: 0,    color: '#c94f42' },
  taxi:   { name: 'Taxi',   topSpeed: 400, accel: 280, grip: 3.2, length: 46, width: 22, price: 400,  color: '#e8b93c' },
  truck:  { name: 'Truck',  topSpeed: 330, accel: 210, grip: 2.6, length: 62, width: 26, price: 800,  color: '#7d8a99' },
  sports: { name: 'Sports', topSpeed: 560, accel: 420, grip: 4.4, length: 48, width: 22, price: 1200, color: '#3fa7d6' },
  cruiser:{ name: 'Cruiser',topSpeed: 470, accel: 360, grip: 3.8, length: 48, width: 22, price: 0,    color: '#2b3a4d' },
  boat:   { name: 'Skiff',  topSpeed: 380, accel: 260, grip: 2.2, length: 56, width: 24, price: 0,    color: '#e8e4d8' },
  heli:   { name: 'Heli',   topSpeed: 520, accel: 320, grip: 3.0, length: 58, width: 26, price: 0,    color: '#31435c' },
};

export const WANTED = {
  max: 5,
  decaySeconds: 9,
  bustHoldSeconds: 3,
  bustRange: 46,
  cruiserCap: [0, 1, 2, 3, 4, 5],
  heliAt: 3,
  heliRespawn: 45,
};

export const TIDE = { cycleSeconds: 240, openBelow: 0.32 };
export const DAY = { cycleSeconds: 360, noonHeat: 1.5 };

export const ECONOMY = {
  startCash: 120,
  ammoPrice: 100,
  ammoAmount: 30,
  paintPrice: 50,
  repPerMission: 10,
  sportsRepNeeded: 20,
};

export const MISSIONS = [
  {
    id: 'first-fare', name: 'First Fare', reward: 150,
    brief: 'Rico needs wheels. Grab the yellow taxi by the plaza and take the fare to Old Town.',
    steps: [
      { type: 'goto', label: 'Reach the taxi at Plaza Sol', poi: 'plaza-taxi' },
      { type: 'enterCar', label: 'Get in the taxi', car: 'taxi' },
      { type: 'driveTo', label: 'Drop the fare at Old Town', poi: 'old-town-drop' },
    ],
  },
  {
    id: 'hot-delivery', name: 'Hot Delivery', reward: 250,
    brief: 'A crate of warm goods at the fish market. Pick it up and run it to the marina before it cools.',
    steps: [
      { type: 'goto', label: 'Pick up the crate at the fish market', poi: 'fish-market' },
      { type: 'driveTo', label: 'Deliver to the marina dock', poi: 'marina-dock', timed: 75 },
    ],
  },
  {
    id: 'lose-the-heat', name: 'Lose the Heat', reward: 200,
    brief: 'The cruisers are on you. Break line of sight and stay clean until the stars fade.',
    steps: [
      { type: 'gainWanted', label: 'Get the cops interested (steal a car)', stars: 2 },
      { type: 'loseWanted', label: 'Lose the wanted level', stars: 0 },
    ],
  },
  {
    id: 'turf-pickup', name: 'Turf Pickup', reward: 300,
    brief: 'Three drops hidden in Viper turf on the east side. Grab them all and get out.',
    steps: [
      { type: 'collect', label: 'Collect the drops in Viper turf', poi: 'viper-drops', count: 3 },
    ],
  },
  {
    id: 'gull-run', name: 'The Gull Run', reward: 350,
    brief: 'Take the skiff from the marina, round the red buoy, and bring her home.',
    steps: [
      { type: 'goto', label: 'Board the skiff at the marina', poi: 'marina-boat' },
      { type: 'boatTo', label: 'Round the red buoy', poi: 'buoy' },
      { type: 'boatTo', label: 'Return to the marina dock', poi: 'marina-dock' },
    ],
  },
  {
    id: 'fish-market-heist', name: 'Fish Market Heist', reward: 450,
    brief: 'A refrigerated truck full of the morning catch. Take it and park it in the garage.',
    steps: [
      { type: 'enterCar', label: 'Steal the market truck', car: 'truck', poi: 'market-truck' },
      { type: 'driveTo', label: 'Park the truck in the garage', poi: 'garage' },
    ],
  },
  {
    id: 'tide-runner', name: 'Tide Runner', reward: 400,
    brief: 'Low tide opens the sand road past the rocks. A stranded crate waits at the far end.',
    steps: [
      { type: 'waitTide', label: 'Wait for low tide (watch the gauge)', poi: 'beach-road' },
      { type: 'driveTo', label: 'Reach the stranded crate on the sand', poi: 'beach-crate' },
    ],
  },
  {
    id: 'deco-dash', name: 'Deco Dash', reward: 500,
    brief: 'Four checkpoints across Solmar, ninety seconds. The Gulls are timing you.',
    steps: [
      { type: 'checkpoints', label: 'Hit all four checkpoints', pois: ['deco-1', 'deco-2', 'deco-3', 'deco-4'], timed: 90 },
    ],
  },
  {
    id: 'night-shift', name: 'Night Shift', reward: 550,
    brief: 'Three fares after dark: the plaza, the hospital, the old town gate. No questions asked.',
    steps: [
      { type: 'driveTo', label: 'Fare one: Plaza Sol', poi: 'plaza-taxi', night: true },
      { type: 'driveTo', label: 'Fare two: Hospital gate', poi: 'hospital-gate', night: true },
      { type: 'driveTo', label: 'Fare three: Old Town gate', poi: 'old-town-drop', night: true },
    ],
  },
  {
    id: 'solmar-crown', name: 'Solmar Crown', reward: 1000,
    brief: 'The crown job: lift the blue sports car from the marina showroom, shake a four-star tail, bring it home.',
    steps: [
      { type: 'enterCar', label: 'Lift the blue sports car', car: 'sports', poi: 'showroom-sports' },
      { type: 'gainWanted', label: 'Four stars and counting', stars: 4 },
      { type: 'loseWanted', label: 'Shake the tail', stars: 0 },
      { type: 'driveTo', label: 'Park it at the safehouse', poi: 'safehouse' },
    ],
  },
];

export const RADIO = [
  { name: 'SOLMAR FM', tempo: 96, wave: 'triangle', bass: 55, mood: 'chill' },
  { name: 'TIDE 88', tempo: 132, wave: 'square', bass: 65, mood: 'drive' },
  { name: 'GULL ROCK', tempo: 148, wave: 'sawtooth', bass: 49, mood: 'rock' },
];

export const GANGS = [
  { name: 'Gulls', color: '#e8b93c', blocks: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2]] },
  { name: 'Vipers', color: '#58b368', blocks: [[8, 4], [9, 4], [10, 4], [11, 4], [8, 5], [9, 5], [10, 5], [11, 5], [9, 6], [10, 6]] },
  { name: 'Tide Kings', color: '#3fa7d6', blocks: [[4, 8], [5, 8], [6, 8], [7, 8], [4, 9], [5, 9], [6, 9], [4, 10], [5, 10]] },
];

export const PALETTE = {
  backdrop: '#0b0e14',
  grass: '#3d6b35',
  grassDry: '#5d7a3a',
  sand: '#c9b078',
  water: '#1d5f7a',
  waterDeep: '#144a61',
  road: '#33373f',
  roadLine: '#c9c26a',
  sidewalk: '#6b6f78',
  building: '#8a7f72',
  buildingRoof: '#6e6459',
  oldTown: '#a08a68',
  market: '#7a6a8a',
  text: '#f2efe6',
  muted: '#b9b3a4',
  accent: '#ffb347',
  danger: '#e5534b',
  police: '#2b3a4d',
  hud: 'rgba(10, 12, 18, 0.72)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
