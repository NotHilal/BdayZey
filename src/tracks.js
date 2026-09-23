// Music data for the sequencer in sfx.js. Original short loops written in each
// game's style, plus "Happy Birthday" (public domain) for the finale.
//
// Every track: bpm, steps per bar (16 = 16th notes), one chord per bar, voices.
// A voice either plays `notes` (one token per step: a note like 'A4', '-' holds
// the previous note, '.' is a rest, '|' is just a bar line for readability) or
// a `pattern` of chord degrees repeated every bar ('R'/'1' root, 3, 5, 7,
// 8 = octave, 10, 12; '3+5' plays both) at `octave`. Drum voices use k(ick),
// s(nare), h(at), t(om), combinable like 'kh'.
// Voice sound: type (oscillator), vol, attack, release, pluck (decay seconds),
// vib (vibrato), lp (low-pass cutoff).

export const TRACKS = {
  // C418-style: slow, soft and spacious
  minecraft: {
    bpm: 70,
    chords: ['Fmaj7', 'Cmaj7', 'Am7', 'G', 'Fmaj7', 'Em7', 'Dm7', 'Gsus4'],
    voices: [
      { type: 'sine', vol: 0.05, octave: 2, release: 1.2, pattern: 'R - - - - - - - - - - - - - - -' },
      { type: 'triangle', vol: 0.035, octave: 3, pluck: 1.6, pattern: '1 . . 5 . . 8 . . 10 . . 8 . . .' },
      {
        type: 'sine', vol: 0.045, pluck: 2.2, notes:
          '. . . . A5 - - - G5 - - - E5 - - - | . . . . . . . . G5 - - - - - - - | . . . . C6 - - - B5 - - - G5 - - - | A5 - - - - - - - . . . . . . . . |'
        + '. . . . A5 - - - C6 - - - E6 - - - | D6 - - - - - - - B5 - - - G5 - - - | . . . . A5 - - - F5 - - - E5 - - - | D5 - - - - - - - . . . . . . . .',
      },
    ],
  },

  // Mondstadt: pastoral flute over a harp, light percussion
  genshin: {
    bpm: 100,
    chords: ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'],
    voices: [
      { type: 'triangle', vol: 0.06, octave: 2, pluck: 0.5, pattern: 'R . . . . . 5 . R . . . 5 . . .' },
      { type: 'triangle', vol: 0.03, octave: 4, pluck: 0.45, pattern: '1 5 8 10 12 10 8 5 1 5 8 10 12 10 8 5' },
      {
        type: 'sine', vol: 0.055, vib: true, attack: 0.04, release: 0.15, notes:
          'C5 - - - F5 - - - A5 - - - G5 - F5 - | E5 - - - - - - - G5 - - - C5 - - - | D5 - - - F5 - - - A5 - - - C6 - A5 - | Bb5 - - - A5 - - - G5 - - - - - - - |'
        + 'A5 - - - C6 - - - A5 - G5 - F5 - - - | G5 - - - E5 - - - C5 - - - E5 - G5 - | F5 - - - D5 - - - Bb4 - - - D5 - - - | E5 - - - - - - - G5 - - - - - - -',
      },
      { drums: true, vol: 0.7, pattern: 'k . h . . . h . k . h . . . h .' },
    ],
  },

  // Summoner's Rift: brass and war drums in D minor
  lol: {
    bpm: 112,
    chords: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'],
    voices: [
      { type: 'sawtooth', vol: 0.04, octave: 2, lp: 700, pluck: 0.22, pattern: 'R . R . R . R . R . R . R . 8 .' },
      { type: 'square', vol: 0.018, octave: 3, lp: 1800, pluck: 0.3, pattern: '1 . 5 . 8 . 5 . 1 . 5 . 8 . 5 .' },
      {
        type: 'sawtooth', vol: 0.04, lp: 2200, attack: 0.03, release: 0.12, notes:
          'D5 - - - - - A4 - D5 - E5 - F5 - - - | D5 - - - - - - - . . . . . . . . | C5 - - - - - F4 - A4 - C5 - F5 - - - | E5 - - - - - - - . . . . G5 - - - |'
        + 'A5 - - - - - F5 - D5 - - - A5 - - - | Bb5 - - - A5 - - - G5 - - - F5 - - - | G5 - - - - - Bb5 - A5 - G5 - F5 - - - | E5 - - - - - - - C#5 - - - E5 - - -',
      },
      { drums: true, pattern: 't . . . s . . t t . . . s . t .' },
    ],
  },

  // Ascent: driving electronic in E minor
  valorant: {
    bpm: 124,
    chords: ['Em', 'Em', 'C', 'D', 'Em', 'Em', 'C', 'D'],
    voices: [
      { type: 'sawtooth', vol: 0.035, octave: 2, lp: 900, pluck: 0.12, pattern: 'R R 8 R R R 8 R R R 8 R R R 8 R' },
      { type: 'triangle', vol: 0.02, octave: 4, pluck: 0.15, pattern: '1 5 8 5 1 5 8 5 1 5 8 5 1 5 8 5' },
      {
        type: 'square', vol: 0.03, lp: 3000, pluck: 0.25, notes:
          'E5 . G5 . B5 . . . A5 . G5 . E5 . . . | D5 . E5 . . . . . . . . . . . . . | E5 . G5 . C6 . . . B5 . G5 . E5 . . . | F#5 . . . D5 . . . A4 . . . . . . . |'
        + 'E5 . G5 . B5 . . . A5 . G5 . E5 . . . | D5 . E5 . . . . . . . . . . . . . | E5 . G5 . C6 . . . B5 . G5 . E5 . . . | F#5 . A5 . D6 . . . F#5 . . . . . . .',
      },
      { drums: true, pattern: 'kh . h . ks . h . kh . h . ks . h h' },
    ],
  },

  // New Austin at golden hour: whistled melody over a boom-chick guitar
  rdr2: {
    bpm: 84,
    swing: 0.12,
    chords: ['Am', 'Am', 'Dm', 'Am', 'F', 'G', 'Am', 'E'],
    voices: [
      { type: 'triangle', vol: 0.06, octave: 2, pluck: 0.4, pattern: 'R . . . 5 . . . R . . . 5 . . .' },
      { type: 'triangle', vol: 0.028, octave: 3, pluck: 0.18, pattern: '. . 1+3+5 . . . 3+5+8 . . . 1+3+5 . . . 3+5+8 .' },
      {
        type: 'sine', vol: 0.05, vib: true, attack: 0.05, release: 0.2, notes:
          'E5 - - - - - - - A5 - - - - - B5 - | C6 - - - B5 - A5 - E5 - - - - - - - | D5 - - - F5 - - - A5 - - - G5 - F5 - | E5 - - - - - - - - - - - . . . . |'
        + 'C5 - - - F5 - - - A5 - - - C6 - - - | B5 - - - - - A5 - G5 - - - D5 - - - | E5 - - - A5 - - - C6 - B5 - A5 - - - | G#5 - - - - - - - B5 - - - E5 - - -',
      },
      { drums: true, vol: 0.6, pattern: 'k . . h . . h . k . . h . . h .' },
    ],
  },

  // finale: Happy Birthday as a music-box waltz (3/4, 12 steps per bar)
  birthday: {
    bpm: 96,
    steps: 12,
    chords: ['C', 'C', 'G', 'G', 'C', 'C7', 'F', 'G', 'C'],
    voices: [
      { type: 'triangle', vol: 0.05, octave: 2, pluck: 0.6, pattern: 'R . . . . . . . . . . .' },
      { type: 'triangle', vol: 0.025, octave: 3, pluck: 0.3, pattern: '. . . . 3+5+8 . . . 3+5+8 . . .' },
      {
        type: 'sine', vol: 0.06, pluck: 1.1, notes:
          '. . . . . . . . G4 - - G4 | A4 - - - G4 - - - C5 - - - | B4 - - - - - - - G4 - - G4 | A4 - - - G4 - - - D5 - - - | C5 - - - - - - - G4 - - G4 |'
        + 'G5 - - - E5 - - - C5 - - - | B4 - - - A4 - - - F5 - - F5 | E5 - - - C5 - - - D5 - - - | C5 - - - - - - - . . . .',
      },
      { type: 'triangle', vol: 0.02, pluck: 0.9, notes:
          '. . . . . . . . . . . . | C6 . . . . . E6 . . . . . | D6 . . . . . B5 . . . . . | D6 . . . . . F6 . . . . . | E6 . . . . . G6 . . . . . |'
        + 'G6 . . . . . Bb5 . . . . . | A5 . . . . . C6 . . . . . | B5 . . . . . D6 . . . . . | C6 . . . . . . . . . . .' },
    ],
  },
};
