// Run-wide progress shared by the scene and the UI.
export const run = {
  deaths: 0,
  levelDeaths: 0,
  totalSweets: 0,
  levelSweets: 0,
  elapsed: 0,
  reset() {
    this.deaths = 0; this.levelDeaths = 0; this.totalSweets = 0; this.levelSweets = 0; this.elapsed = 0;
  },
  newWorld() {
    this.levelDeaths = 0; this.levelSweets = 0;
  },
};

export function fmtTime(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), t = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${t}`;
}
