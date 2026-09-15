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
  [220, 261.63, 329.63],
  [174.61, 220, 261.63],
  [261.63, 329.63, 392],
  [196, 246.94, 293.66]
];
for (let cycle = 0; cycle < 1; cycle += 1) {
  chords.forEach((chord, chordIndex) => {
    const start = chordIndex * 4;
    chord.forEach((frequency, noteIndex) => addNote(start, 3.7, frequency, 0.035, 'sine', (noteIndex - 1) * 0.25));
    addNote(start, 3.8, chord[0] / 2, 0.055, 'sine', 0, 0.12);
  });
}

const melody = [
  [0.0, 392], [0.8, 440], [1.6, 523.25], [2.5, 440],
  [4.0, 349.23], [4.8, 392], [5.6, 440], [6.5, 392],
  [8.0, 392], [8.8, 440], [9.6, 587.33], [10.5, 523.25],
  [12.0, 293.66], [12.8, 329.63], [13.6, 392], [14.5, 329.63]
];
melody.forEach(([start, frequency], index) => addNote(start, 0.62, frequency, 0.12, 'triangle', index % 2 ? 0.16 : -0.16, 0.18));

// Pulso grave discreto para que la pista tenga movimiento sin competir con el juego.
for (let start = 0; start < duration; start += 1) {
  const bass = chords[Math.floor(start / 4)][0] / 2;
  addNote(start, 0.35, bass, 0.08, 'soft-square', 0, 0.1);
}

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
