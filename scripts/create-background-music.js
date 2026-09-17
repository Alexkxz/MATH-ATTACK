const fs = require('fs');
const path = require('path');

const sampleRate = 44100;
const duration = 16;
const frames = sampleRate * duration;
const left = new Float32Array(frames);
const right = new Float32Array(frames);
const outputDir = path.join(__dirname, '..', 'assets');
const outputFile = path.join(outputDir, 'math-attack-ambient.wav');

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function waveSample(phase, type) {
  if (type === 'triangle') return 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
  if (type === 'soft-square') return Math.tanh(Math.sin(phase * Math.PI * 2) * 1.4);
  return Math.sin(phase * Math.PI * 2);
}

function addNote(start, length, frequency, volume, type = 'sine', pan = 0, vibrato = 0) {
  const first = Math.max(0, Math.floor(start * sampleRate));
  const last = Math.min(frames, Math.ceil((start + length) * sampleRate));
  const attack = Math.min(0.08, length * 0.18);
  const release = Math.min(0.24, length * 0.3);
  const leftGain = Math.sqrt((1 - pan) * 0.5);
  const rightGain = Math.sqrt((1 + pan) * 0.5);
  for (let index = first; index < last; index += 1) {
    const elapsed = index / sampleRate - start;
    const remaining = start + length - index / sampleRate;
    const envelope = Math.min(1, elapsed / attack, remaining / release);
    const bend = vibrato ? Math.sin(elapsed * 5.3) * vibrato : 0;
    const phase = (elapsed * (frequency + bend)) % 1;
    const sample = waveSample(phase, type) * volume * Math.max(0, envelope);
    left[index] += sample * leftGain;
    right[index] += sample * rightGain;
  }
}

// Pad armónico suave: Am - F - C - G, con una melodía ascendente original.
const chords = [
  [261.63, 329.63, 392],
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [196, 246.94, 293.66]
];
const step = 0.25;
const arpeggio = [0, 1, 2, 1, 0, 1, 2, 1, 2, 1, 0, 1, 2, 1, 0, 1];
chords.forEach((chord, chordIndex) => {
  const start = chordIndex * 4;
  arpeggio.forEach((noteIndex, stepIndex) => addNote(start + stepIndex * step, 0.2, chord[noteIndex], 0.09, 'soft-square', stepIndex % 2 ? 0.12 : -0.12, 0.08));
  for (let beat = 0; beat < 4; beat += 1) {
    addNote(start + beat, 0.32, chord[0] / 2, 0.13, 'square', 0, 0.12);
    addNote(start + beat + 0.5, 0.18, chord[0], 0.045, 'triangle', 0, 0.1);
  }
});

const melody = [
  [0.0, 523.25], [0.5, 659.25], [1.0, 783.99], [1.5, 659.25], [2.0, 523.25], [2.75, 392],
  [4.0, 493.88], [4.5, 587.33], [5.0, 659.25], [5.5, 783.99], [6.0, 659.25], [6.75, 493.88],
  [8.0, 440], [8.5, 523.25], [9.0, 659.25], [9.5, 523.25], [10.0, 440], [10.75, 329.63],
  [12.0, 392], [12.5, 493.88], [13.0, 587.33], [13.5, 659.25], [14.0, 587.33], [14.75, 493.88]
];
melody.forEach(([start, frequency], index) => addNote(start, 0.36, frequency, 0.16, 'triangle', index % 2 ? 0.18 : -0.18, 0.22));

// Pulso grave discreto para que la pista tenga movimiento sin competir con el juego.
for (let start = 0; start < duration; start += 1) addNote(start, 0.12, 82.41, 0.14, 'soft-square', 0, 0.2);

// Entrada y salida cortas para evitar clics al repetir la pista.
for (let index = 0; index < frames; index += 1) {
  const time = index / sampleRate;
  const edge = Math.min(1, time / 0.12, (duration - time) / 0.12);
  left[index] = clamp(left[index] * edge * 1.8);
  right[index] = clamp(right[index] * edge * 1.8);
}

const dataSize = frames * 4;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8);
buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(2, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 4, 28);
buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
for (let index = 0, offset = 44; index < frames; index += 1) {
  buffer.writeInt16LE(Math.round(clamp(left[index]) * 32767), offset); offset += 2;
  buffer.writeInt16LE(Math.round(clamp(right[index]) * 32767), offset); offset += 2;
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputFile, buffer);
console.log(`Pista creada: ${outputFile} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
