/**
 * Web Audio API synthesized audio alerts for Internal Branch transfers.
 * Zero external audio file dependencies — plays reliably across all modern browsers.
 */

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!window.__appAudioCtx || window.__appAudioCtx.state === 'closed') {
    window.__appAudioCtx = new AudioCtx();
  }
  if (window.__appAudioCtx.state === 'suspended') {
    window.__appAudioCtx.resume().catch(() => {});
  }
  return window.__appAudioCtx;
}

/**
 * Play a bright, 3-tone chime for incoming transfer requests
 * (C5 -> E5 -> G5)
 */
export function playIncomingTransferAlert() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0.001, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.25, now + idx * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.38);
    });
  } catch (err) {
    console.warn('Web Audio alert error:', err);
  }
}

/**
 * Play a double-chime for shipment dispatched notification
 * (G4 -> C5)
 */
export function playDispatchedAlert() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [392.00, 523.25]; // G4, C5
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.15);

      gain.gain.setValueAtTime(0.001, now + idx * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.15);
      osc.stop(now + idx * 0.15 + 0.42);
    });
  } catch (err) {
    console.warn('Web Audio alert error:', err);
  }
}

/**
 * Play a soft completion chime when goods are verified and received
 */
export function playReceivedAlert() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [440.00, 554.37, 659.25]; // A4, C#5, E5
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);

      gain.gain.setValueAtTime(0.001, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.32);
    });
  } catch (err) {
    console.warn('Web Audio alert error:', err);
  }
}

