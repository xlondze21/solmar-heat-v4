// All sound is synthesised with WebAudio: no audio files, no network. An
// engine hum that follows speed, a two-tone siren while the cops are close,
// a gunshot noise burst, pickup blips, and three radio stations that schedule
// their own little bass-and-lead loops. Created lazily on the first user
// gesture, so the page never tries to play before it is allowed to.
import { RADIO } from './config.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let radioTimer = null;
  let radioStep = 0;
  let station = 0;
  let radioOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function blip(freq, seconds, type, volume) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume || 0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  function noiseBurst(seconds, volume) {
    if (!ensure()) return;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(master);
    src.start();
  }

  // One radio step: a bass note plus a lead note from a small pentatonic set,
  // at the station's tempo and waveform. Scheduled ahead so it keeps time.
  const SCALE = [0, 3, 5, 7, 10, 12, 15];
  function radioTick() {
    if (!ctx || !radioOn) return;
    const st = RADIO[station];
    const beat = 60 / st.tempo / 2;
    const now = ctx.currentTime + 0.05;
    const bassNote = st.bass * Math.pow(2, SCALE[radioStep % 3] / 12);
    const leadNote = st.bass * 4 * Math.pow(2, SCALE[(radioStep * 2 + 1) % SCALE.length] / 12);
    for (const [freq, vol, wave] of [[bassNote, 0.12, 'triangle'], [leadNote, 0.05, st.wave]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + beat * 0.9);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + beat);
    }
    radioStep += 1;
  }

  function setRadio(next) {
    station = ((next % RADIO.length) + RADIO.length) % RADIO.length;
    radioStep = 0;
    if (!ensure()) return;
    if (radioTimer) window.clearInterval(radioTimer);
    radioTimer = window.setInterval(radioTick, (60 / RADIO[station].tempo / 2) * 1000);
  }

  return {
    unlock,
    setRadio,
    stationName() {
      return RADIO[station].name;
    },
    setRadioOn(on) {
      radioOn = on;
      if (on) setRadio(station);
      else if (radioTimer) {
        window.clearInterval(radioTimer);
        radioTimer = null;
      }
    },
    engine(speedRatio, inCar) {
      if (!ctx) return;
      engineGain.gain.value = inCar ? 0.05 + speedRatio * 0.06 : 0;
      engineOsc.frequency.value = 45 + speedRatio * 130;
    },
    siren(on, near) {
      if (!ctx) return;
      sirenGain.gain.value = on ? 0.03 + (near ? 0.03 : 0) : 0;
      if (on) sirenOsc.frequency.value = 650 + 180 * Math.sin(ctx.currentTime * 4);
    },
    shot() { noiseBurst(0.16, 0.35); },
    punch() { noiseBurst(0.08, 0.2); },
    pickup() { blip(880, 0.12, 'sine', 0.2); blip(1320, 0.18, 'sine', 0.15); },
    missionDone() { blip(523, 0.15, 'triangle', 0.25); blip(659, 0.15, 'triangle', 0.25); blip(784, 0.3, 'triangle', 0.25); },
    busted() { blip(220, 0.4, 'sawtooth', 0.25); blip(165, 0.6, 'sawtooth', 0.25); },
    crash() { noiseBurst(0.25, 0.3); },
  };
}
