export const BOARD_SIZE = 9;
export const INITIAL_LIFE = 20;
export const MAX_POINTS = 6;
export const SPAWN_ROWS = { p1: [0], p2: [8] };
export const MERGE_MAP = { 1: 2, 2: 3, 3: 4, 4: 5 };

export const UNIT_BASE = {
  0: { name: "King", short: "KING", atk: 0, hp: 2, canMove: true, life: 5, range: 1, cost: 0, color: "#d69e2e", bg: "#2a1f06", border: "#d69e2e" },
  1: { name: "Soldier", short: "SOL", atk: 1, hp: 1, canMove: true, life: 1, range: 1, cost: 1, color: "#a0aec0", bg: "#161a22", border: "#4a5568" },
  6: { name: "Archer", short: "ARC", atk: 1, hp: 1, canMove: true, life: 1, range: 3, cost: 2, color: "#f6ad55", bg: "#2a1a06", border: "#c05621" },
  2: { name: "Knight", short: "KNT", atk: 2, hp: 1, canMove: true, life: 2, range: 1, cost: 3, color: "#68d391", bg: "#0f2018", border: "#2f855a" },
  3: { name: "Cavalier", short: "CAV", atk: 3, hp: 1, canMove: true, life: 2, range: 1, cost: 4, color: "#63b3ed", bg: "#0f1e30", border: "#2b6cb0" },
  4: { name: "General", short: "GEN", atk: 4, hp: 2, canMove: true, life: 3, range: 1, cost: 5, color: "#b794f4", bg: "#1a1030", border: "#6b46c1" },
  5: { name: "Tower", short: "TWR", atk: 5, hp: 3, canMove: false, life: 3, range: 2, cost: 6, color: "#fc8181", bg: "#2a0f0f", border: "#c53030" },
};
