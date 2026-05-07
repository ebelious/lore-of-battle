import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const BOARD = 7;
const MAX_HP = 30;
const MAX_PTS = 6;
// Returns updated unit with ability added — no duplicates, range stacks as rangeBuff
function addAbility(unit, ability) {
  var baseAbils = UNITS[unit.typeId]&&UNITS[unit.typeId].abilities||[];
  var bonusAbils = unit.bonusAbilities||[];
  if(ability==="range"){
    // Range stacks: each extra "range" adds 1 tile of attack distance
    if(baseAbils.includes("range")||bonusAbils.includes("range")){
      return {...unit, rangeBuff:(unit.rangeBuff||0)+1};
    }
    return {...unit, bonusAbilities:[...bonusAbils,"range"]};
  }
  // Non-range abilities: skip if already present
  if(baseAbils.includes(ability)||bonusAbils.includes(ability)) return unit;
  return {...unit, bonusAbilities:[...bonusAbils, ability]};
}
function isKingInEncampment(owner, board) {
  var encampRow = owner==="p1" ? 0 : BOARD-1;
  for (var c=0; c<BOARD; c++) {
    if (board[encampRow][c].some(function(u){return u.typeId===0&&u.owner===owner;})) return true;
  }
  return false;
}
let UID = 1;
const uid = () => `u${UID++}`;

// ─── Unit Definitions ─────────────────────────────────────────────────────────
const UNITS = {
  0: { name:"King",        short:"K",   atk:3, hp:30, cost:0,  movDist:1, movShape:"all",   atkShape:"same",     abilities:["armor"],                      mergeTo:null, life:0  },
  1: { name:"Soldier",     short:"SOL", atk:1, hp:2,  cost:1,  movDist:1, movShape:"all",   atkShape:"same",     abilities:["charge"],                     mergeTo:2,    life:1  },
  2: { name:"Knight",      short:"KNT", atk:2, hp:3,  cost:4,  movDist:1, movShape:"all",   atkShape:"same",     abilities:["armor","fallback"],           mergeTo:3,    life:1  },
  3: { name:"Cavalier",    short:"CAV", atk:4, hp:4,  cost:5,  movDist:2, movShape:"cross", atkShape:"lshape_same",   abilities:["armor","fallback"],           mergeTo:4,    life:1  },
  4: { name:"General",     short:"GEN", atk:5, hp:5,  cost:6,  movDist:2, movShape:"cross", atkShape:"lshape_same", abilities:["armor","charge","fallback"],  mergeTo:null, life:1  },
  5: { name:"Tower",       short:"TWR", atk:4, hp:8,  cost:6,  movDist:0, movShape:"none",  atkShape:"ballista", abilities:["armor","range","pierce","immovable"], mergeTo:null, life:1 },
  6: { name:"Archer",      short:"ARC", atk:1, hp:1,  cost:1,  movDist:1, movShape:"cross", atkShape:"ranged1",  abilities:["range","fallback"],           mergeTo:7,    life:1  },
  7: { name:"Crossbowman", short:"XBW", atk:2, hp:2,  cost:4,  movDist:1, movShape:"cross", atkShape:"ranged1",  abilities:["range","pierce"],             mergeTo:8,    life:1  },
  8: { name:"Ballista",    short:"BAL", atk:3, hp:5,  cost:5,  movDist:1, movShape:"cross", atkShape:"ballista", abilities:["range","pierce"],              mergeTo:5,    life:1  },
};
const UNIT_ICON = {
  0: "♛", // King
  1: "✚", // Soldier
  2: "◈", // Knight
  3: "◀", // Cavalier
  4: "★", // General
  5: "▣", // Tower
  6: "↑", // Archer
  7: "⊕", // Crossbowman
  8: "⊣", // Ballista
};
const LEGENDARY_UNIT_ABILITIES = {
  "Bonebreaker":          ["charge","armor","pierce"],
  "Vault Guardian":       ["immovable","armor","pierce"],
  "Forge Construct":      ["armor","range","pierce"],
  "Wyrm Shard":           ["range","pierce"],
  "Thrainor's Ghost":     ["charge","armor","pierce"],
  "The Deepborn":         ["immovable","pierce","armor"],
  "Nyxara's Shade":       ["range","armor","fallback"],
  "Ash Champion":         ["charge","pierce","armor"],
  "Dragon Siege":         ["range","pierce","immovable"],
  "Obsidian Knight":      ["armor","charge","pierce"],
  "Siege Wyrm":           ["range","pierce","armor"],
  "Borin Ironbreaker":    ["charge","pierce","armor"],
  "Maeve Redveil":        ["charge","armor","fallback"],
  "Stormcrag Chief":      ["range","pierce","armor"],
  "Wandering Chief":      ["range","pierce"],
  "Ailsa's Revenant":     ["pierce","fallback","range"],
  "Iron Widow":           ["immovable","armor","pierce"],
  "Seryth's Shade":       ["range","pierce","fallback"],
  "Maelthas Warden":      ["armor","immovable","pierce"],
  "Engine Fragment":      ["range","pierce","armor"],
  "Lamentation's Voice":  ["range","pierce"],
  "Maelthas":             ["armor","immovable","charge"],
  "Seryth the Whisperer": ["pierce","range","fallback"],
  "Frost Champion":       ["charge","armor","pierce"],
  "Kael Thornwyrd":       ["charge","pierce","fallback"],
  "First Frost Avatar":   ["range","pierce","armor"],
  "Niflhel Shard":        ["range","pierce","armor"],
  "Hrímveig's Echo":      ["charge","armor","pierce"],
  "Eldrin Solhart":       ["range","fallback","charge"],
  "First Frost":          ["range","pierce","armor"],
};
const MERGE_REQ  = { 1:2, 2:3, 3:4, 6:2, 7:3, 8:4 };
const MERGE_COST = { 1:4, 2:4, 3:5, 6:4, 7:4, 8:6 };
const ABILITY_DESC = {
  charge:"No summoning sickness", armor:"Immune to ranged (non-pierce)",
  fallback:"Retreat costs 0pts", range:"Ranged attacker",
  pierce:"Bypasses armor", immovable:"Cannot move or be moved",
  slow:"Cannot retreat", flank:"Can attack and advance via L-shape (not into encampment)",
  stealth:"Cannot be targeted by spells or ranged attacks"
};

function makeUnit(typeId, owner) {
  const def = UNITS[typeId];
  const isNeutral = owner === "neutral";
  const baseHp = isNeutral ? def.hp + 3 : def.hp;
  return {
    id: uid(), typeId, owner,
    hp: baseHp, maxHp: baseHp,
    atkBuff: 0,
    tapped: false,
    moved: false,
    sick: typeId !== 0 && !def.abilities.includes("charge") && owner !== "neutral",
    neutral: owner === "neutral",
    soulboundItem: null,
    items: [],
    bonusAbilities: [],
  };
}

// ─── Movement & Attack helpers ────────────────────────────────────────────────
function isImmovable(unit) {
  return UNITS[unit.typeId].abilities.includes("immovable") ||
    (unit.bonusAbilities||[]).includes("immovable") ||
    (unit.bonusAbilities||[]).includes("immovable_temp");
}

function canMove(unit, fr, fc, tr, tc, blockedTiles) {
  if (unit.tapped || unit.moved || unit.sick) return false;
  if (UNITS[unit.typeId].movDist === 0) return false;
  if (isImmovable(unit)) return false;
  const key = `${tr},${tc}`;
  if (blockedTiles[key]) return false;
  const dr = Math.abs(tr-fr), dc = Math.abs(tc-fc);
  if (dr===0 && dc===0) return false;
  const dist = UNITS[unit.typeId].movDist + (unit.movBuff||0);
  const shape = UNITS[unit.typeId].movShape;
  if (shape === "all")   return Math.max(dr,dc) <= dist;
  if (shape === "cross") return (dr===0||dc===0) && Math.max(dr,dc) <= dist;
  return false;
}

function canAttack(unit, fr, fc, tr, tc) {
  if (unit.sick) return false;
  if (unit.frozenAfterMove) return false;
  const dr = Math.abs(tr-fr), dc = Math.abs(tc-fc);
  const cheby = Math.max(dr,dc);
  // If unit has range from bonusAbilities (spell/item), treat as ranged2 range; rangeBuff adds extra tiles
  const hasRangeBonus = (unit.bonusAbilities||[]).includes("range");
  var rangeBonus = unit.rangeBuff||0;
  if (hasRangeBonus && cheby >= 1 && cheby <= 3+rangeBonus) return true;
  // If unit has flank ability, also allow L-shape attacks
  const hasFlank = (unit.bonusAbilities||[]).includes("flank") || (UNITS[unit.typeId]&&UNITS[unit.typeId].abilities||[]).includes("flank");
  if (hasFlank && ((dr===1&&dc===2)||(dr===2&&dc===1))) return true;
  var rb = unit.rangeBuff||0;
  if (shape === "same")     return cheby === 0;
  if (shape === "adjacent") return cheby <= 1;
  if (shape === "lshape")   return (dr===1&&dc===2)||(dr===2&&dc===1);
  if (shape === "ring2")    return cheby >= 1 && cheby <= 2+rb;
  if (shape === "ranged1")  return cheby <= 1+rb;
  if (shape === "ranged2")  return cheby >= 1 && cheby <= 3+rb;
  if (shape === "ranged3")  return cheby >= 1 && cheby <= 4+rb;
  if (shape === "ballista")  return cheby===1 || (cheby===2 && (dr===0||dc===0)) || (rb>0&&cheby<=2+rb&&(dr===0||dc===0));
  if (shape === "lshape_same") return cheby===0||(dr===1&&dc===2)||(dr===2&&dc===1);
  if (cheby===0) return true;
  return false;
}

function canAttackTower(unit, fr, fc, tr, tc, board) {
  // Any unit can attack a Tower on adjacent tile even if normally restricted to same tile
  if (board && board[tr] && board[tr][tc] && board[tr][tc].some(function(u){return u.typeId===5;})) {
    return Math.max(Math.abs(tr-fr),Math.abs(tc-fc)) <= 1;
  }
  return false;
}

// ─── Simple event cards ───────────────────────────────────────────────────────
// All 5 event decks - 40 unique cards each, no card names shared across decks

const DECK_DWARVEN = [
  // TILE EFFECTS
  {id:"dw01",name:"The Forge Erupts",cycles:3,color:"#c53030",desc:"Star-iron veins crack open — fire sweeps 4 battlefield tiles.",lore:"Thrainor Stoneheart drove Durak'Thul too deep into the Eternal Forge. The star-iron veins shattered. What followed was not magma — it was the forge's rage made liquid.",tileFx:"fire"},
  {id:"dw02",name:"Karak Azar Deep Freeze",cycles:2,color:"#63b3ed",desc:"Obsidian cold seeps up from the deep roads — 4 tiles ice over.",lore:"Below the Eternal Forge lie the Deep Roads, where the cold that predates the world still breathes. When the wards fail, it rises.",tileFx:"ice"},
  {id:"dw03",name:"Azarim Bone-Curse",cycles:3,color:"#9f7aea",desc:"Ancient dragonbone curses soak into the stone — 4 tiles cursed.",lore:"The Elder Wyrms did not merely destroy Karak Azar. They cursed it. The bones they left behind still whisper in a language that unmakes courage.",tileFx:"cursed"},
  {id:"dw04",name:"Thrainor's Blessing",cycles:2,color:"#68d391",desc:"The Forge-King's dying prayer sanctifies the ground — 4 tiles blessed.",lore:"Thrainor's last act was not a command but a prayer. His blood on the stone still carries it — warmth without fire, strength without cruelty.",tileFx:"blessed"},
  // PUSH EVENTS
  {id:"dw05",name:"Cave-In",cycles:1,color:"#c6a55c",desc:"The tunnels collapse — all units driven toward the centre.",lore:"The first warning is silence. Then the deep groan. Then the wall arrives.",push:"center"},
  {id:"dw06",name:"Forge Gale",cycles:1,color:"#e05252",desc:"Superheated air from the Eternal Forge blasts units rightward.",lore:"The Forge breathed once. The hot air that escaped could strip skin from bone at forty paces.",push:"right"},
  {id:"dw07",name:"Undertow",cycles:1,color:"#718096",desc:"A deep road collapse sucks all units leftward.",lore:"The dwarves called it the Undertow — the way the Deep Roads seemed to swallow anything left near a sinkhole.",push:"left"},
  {id:"dw08",name:"Thrainor's Charge",cycles:1,color:"#f6ad55",desc:"The ghost of the Forge-King drives all units forward.",lore:"He was seen once more, they say — just before the ruin. Charging. Always charging. He never learned to retreat.",push:"forward"},
  // BUFFS
  {id:"dw09",name:"Star-Iron Temper",cycles:2,color:"#c6a55c",desc:"The star-iron in the walls strengthens all blades — all units +1 ATK.",lore:"Star-iron takes the heat of the forge differently than common metal. It remembers the star it came from. It wants to burn.",effects:{atkBonus:1}},
  {id:"dw10",name:"Forge-Hardened",cycles:3,color:"#c6a55c",desc:"The forge's heat hardens every unit's resolve — +1 HP to all.",lore:"Azarim dwarves spent their lives next to the forge. Their skin became something between leather and iron. Their pain threshold became something else entirely.",effects:{hpBonus:1}},
  {id:"dw11",name:"Durak'Thul's Echo",cycles:1,color:"#f6e05e",desc:"The hammer's ghost surges — all units +2 ATK this cycle.",lore:"The hammer shattered but it did not die. Sometimes the echo still rings in the stone — and everything near it becomes briefly, terribly stronger.",effects:{atkBonus:2}},
  // DEBUFFS
  {id:"dw12",name:"Ash Blindness",cycles:2,color:"#718096",desc:"Volcanic ash fills the ruins — all ranged attack range capped.",lore:"The ash from the Elder Wyrm attack lasted three weeks. Dwarves navigated by touch. Ranged weapons became useless — you couldn't see far enough to aim.",effects:{fogCap:1}},
  {id:"dw13",name:"Weakened Iron",cycles:2,color:"#9f7aea",desc:"Inferior ore from the rushed dig — all units -1 ATK.",lore:"In the final weeks, Thrainor ordered the miners deeper than the good seams. What they found was brittle iron, cursed by proximity to the dragonborn. The blades bent on impact.",effects:{atkMalus:-1}},
  {id:"dw14",name:"Deep Plague",cycles:2,color:"#9f7aea",desc:"Something ancient in the deep soil spreads — all units -1 ATK.",lore:"The Plague of the Deep Roads had no name in the dwarven tongue. It came from beneath the Eternal Forge and it ate ambition first, then strength.",effects:{atkMalus:-1}},
  // INSTANT
  {id:"dw15",name:"Mithril Seam",cycles:1,color:"#d69e2e",desc:"A mithril vein is struck — both commanders gain +3 pts.",lore:"Every dwarf in Karak Azar heard the sound. The ring of pick on mithril is unmistakeable. It means wealth. It also means the dig goes deeper.",instant(s){s.pts1+=3;s.pts2+=3;}},
  {id:"dw16",name:"Forge Wages",cycles:1,color:"#d69e2e",desc:"The forge's output is distributed — both gain +2 pts.",lore:"The forges paid in gear, in weapons, in armour. The economy of Karak Azar ran on steel — and for a moment, it ran well.",instant(s){s.pts1+=2;s.pts2+=2;}},
  {id:"dw17",name:"War Tax",cycles:1,color:"#744210",desc:"The siege drains all resources — both commanders lose 1 pt.",lore:"When Vyrathrax's kin darkened the sky, the dwarves stripped every treasury to pay for weapons. It was not enough.",instant(s){s.pts1=Math.max(0,s.pts1-1);s.pts2=Math.max(0,s.pts2-1);}},
  {id:"dw18",name:"Tunnel Levy",cycles:1,color:"#d69e2e",desc:"Emergency requisition — both gain +1 pt.",lore:"The deep road toll wasn't technically theft. The Forge-King called it a 'tunnel levy.' The merchants called it other things.",instant(s){s.pts1+=1;s.pts2+=1;}},
  // SPAWNS
  {id:"dw19",name:"Ash-Wraith",cycles:3,color:"#a0aec0",desc:"A wraith born from the burning of Karak Azar drifts onto the field.",lore:"They are what remains when a dwarven warrior burns before he can die. Not a ghost — something angrier. Something that remembers fire.",spawn:{typeId:1,label:"Ash-Wraith"}},
  {id:"dw20",name:"Iron Beard Veteran",cycles:3,color:"#c6a55c",desc:"A surviving Iron Beard warrior emerges from the ruin.",lore:"Some survived by going deeper when the dragons came. They lived in the dark for three years eating fungus and grudges before crawling out.",spawn:{typeId:2,label:"Iron Beard"}},
  {id:"dw21",name:"Runepriests Rise",cycles:3,color:"#9f7aea",desc:"Two Azarim runepriests emerge from the collapsing tunnels.",lore:"The runepriests were the last to flee — they stayed to contain what the miners had woken. Most of them failed. These ones didn't die trying.",spawn:{typeId:1,label:"Runepriest",count:2}},
  {id:"dw22",name:"Stoneborn Cavalry",cycles:3,color:"#f6ad55",desc:"Stoneborn riders on forge-iron mounts charge from the ruins.",lore:"The forge-iron horses were never supposed to move without riders. When the forge broke, they moved anyway. Finding riders was apparently optional.",spawn:{typeId:3,label:"Forge Rider"}},
  {id:"dw23",name:"Azarim War-Champion",cycles:4,color:"#f6e05e",desc:"Bonebreaker, Champion of the Eternal Forge, awakens.",lore:"Bonebreaker earned his name at the Battle of the Third Deep. He broke thirteen dragonborn spines before they took his arm. He used the arm as a club after that.",spawn:{typeId:4,label:"Bonebreaker"}},
  {id:"dw24",name:"The Vault Guardian",cycles:4,color:"#c6a55c",desc:"The Vault Guardian of Karak Azar activates to defend the ruin.",lore:"Thrainor commissioned the Vault Guardian from the finest artificers in the range. It was built to stop anything. It was built too late.",spawn:{typeId:4,label:"Vault Guardian"}},
  {id:"dw25",name:"The Eternal Forge Wakes",cycles:4,color:"#f6e05e",desc:"The Eternal Forge itself sends a construct to the field.",lore:"The forge was never just a furnace. The dwarves who built it knew this. They built it anyway. When it woke, it had opinions.",spawn:{typeId:5,label:"Forge Construct"}},
  // MORE TILE / COMBO EFFECTS
  {id:"dw26",name:"Obsidian Fissure",cycles:2,color:"#c53030",desc:"Obsidian cracks erupt — fire on 4 battlefield tiles.",lore:"The obsidian beneath Karak Azar cracked under dragon heat. The cracks were perfectly straight. The dwarves found this deeply unsettling.",tileFx:"fire"},
  {id:"dw27",name:"Deep Road Frost",cycles:3,color:"#63b3ed",desc:"Cold breath from the deepest roads freezes 4 tiles.",lore:"Below the Forge, below the Deep Roads, below even the name of things, there is cold. Sometimes it rises.",tileFx:"ice"},
  {id:"dw28",name:"Dragon-Bone Curse",cycles:2,color:"#9f7aea",desc:"Scattered dragonbone curses 4 more tiles.",lore:"A dragon's bones do not simply rot. They persist, and they remember what killed them, and they make sure nearby things know about it.",tileFx:"cursed"},
  {id:"dw29",name:"Thrainor's Ground",cycles:2,color:"#68d391",desc:"The Forge-King's last prayer blesses 4 more tiles.",lore:"Everywhere Thrainor fell, the stone remembered him. The dwarves who found his traces reported feeling briefly, inexplicably brave.",tileFx:"blessed"},
  {id:"dw30",name:"Forge Surge",cycles:2,color:"#e05252",desc:"The forge pulses with ancient power — all units +1 ATK.",lore:"The Eternal Forge cycles. When it surges, everything near it sharpens — blades, tempers, grudges.",effects:{atkBonus:1}},
  {id:"dw31",name:"Stonekin Resilience",cycles:2,color:"#68d391",desc:"Dwarven stubbornness hardens all units — +1 HP.",lore:"A dwarven saying: 'Stone doesn't ask to be hit less. It asks to be hit more so it can teach the lesson properly.'",effects:{hpBonus:1}},
  {id:"dw32",name:"Siege of Karak Azar",cycles:1,color:"#b794f4",desc:"The dragon siege shakes the walls — all units driven to centre.",lore:"When the dragons attacked, they did not circle. They dove, straight down, from all sides at once, compressing everything into the centre of the ruin.",push:"center"},
  {id:"dw33",name:"Deep Road Collapse",cycles:1,color:"#c6a55c",desc:"A massive tunnel collapse drives all units rightward.",lore:"The collapse started in Tunnel Seven. By the time it stopped, Tunnels Eight through Fourteen had followed.",push:"right"},
  {id:"dw34",name:"Dragon Tailswipe",cycles:1,color:"#fc8181",desc:"Vyrathrax's tail sweeps everything leftward.",lore:"The tail was three hundred feet long. It swept left. Things that were on the right are now on the left. Things that were in the middle are now in pieces.",push:"left"},
  {id:"dw35",name:"Thrainor's Last Charge",cycles:1,color:"#f6e05e",desc:"The Forge-King charges one final time — all units surge forward.",lore:"He was seen running toward the largest of the Elder Wyrms with a broken hammer and a hundred years of fury. Nobody saw him stop.",push:"forward"},
  {id:"dw36",name:"The Deep Hoard",cycles:1,color:"#d69e2e",desc:"A forgotten deep treasury is breached — both gain +3 pts.",lore:"The Deepest Hoard was an old dwarven legend — a treasury so hidden that even the Forge-Kings forgot where it was. The dragons found it. The battle that followed was about more than territory.",instant(s){s.pts1+=3;s.pts2+=3;}},
  {id:"dw37",name:"Emergency Allocation",cycles:1,color:"#d69e2e",desc:"War resources are redistributed — both gain +2 pts.",lore:"The Elder Assembly voted on resource allocation in the middle of the siege. Dwarves. The vote was nine to eight. In favour of survival. Narrowly.",instant(s){s.pts1+=2;s.pts2+=2;}},
  {id:"dw38",name:"Dragon Tax",cycles:1,color:"#744210",desc:"Vyrathrax demands tribute — both commanders lose 1 pt.",lore:"The first thing Vyrathrax did after breaching the Forge was demand tribute. The dwarves laughed. Vyrathrax did not.",instant(s){s.pts1=Math.max(0,s.pts1-1);s.pts2=Math.max(0,s.pts2-1);}},
  {id:"dw39",name:"Bone Tide",cycles:2,color:"#a0aec0",desc:"Skeletons of fallen dwarves claw up from the deep.",lore:"The dwarves of Karak Azar did not go quietly. They burned, they froze, they were crushed — and then some of them got back up anyway.",spawn:{typeId:1,label:"Forge Skeleton",count:2}},
  {id:"dw40",name:"Elder Wyrm Fragment",cycles:4,color:"#f6e05e",desc:"A shard of living Elder Wyrm consciousness stalks the field.",lore:"When Vyrathrax died, his consciousness didn't. It broke into pieces. The pieces wander. The pieces are still angry.",spawn:{typeId:5,label:"Wyrm Shard"}},
];

const DECK_DRAGON = [
  // TILE EFFECTS
  {id:"dr01",name:"Crimson Cataclysm",cycles:3,color:"#c53030",desc:"Vyrathrax's breath scorches 4 tiles to living flame.",lore:"The Crimson Cataclysm was not fire. Fire goes out. What Vyrathrax breathed was older than fire — it was the memory of the sun before it cooled.",tileFx:"fire"},
  {id:"dr02",name:"Korthulak's Storm",cycles:3,color:"#63b3ed",desc:"The Storm Dragon's breath glazes 4 tiles with killing frost.",lore:"Korthulak did not breathe frost — he breathed storm made solid. Lightning that froze on impact. Thunder that left ice where it struck.",tileFx:"ice"},
  {id:"dr03",name:"Sylvara's Venom",cycles:3,color:"#9f7aea",desc:"The Shadowqueen's corruption seeps into 4 tiles.",lore:"Sylvara the Shadowqueen did not attack with fire like her siblings. She poisoned the ground beneath her targets. They won every fight except the one that mattered.",tileFx:"cursed"},
  {id:"dr04",name:"Nyxara's Grace",cycles:2,color:"#68d391",desc:"The Silent Dragon marks 4 tiles with her ancient power.",lore:"Nyxara never spoke. Her kills were not announced. But where she walked, the ground remembered her in the language of power — and passed it on.",tileFx:"blessed"},
  // PUSH EVENTS
  {id:"dr05",name:"Worldburner's Wingbeat",cycles:1,color:"#fc8181",desc:"Vyrathrax beats his wings — all units hurled to centre.",lore:"At full wingspan, Vyrathrax measured nine hundred feet tip to tip. When he beat his wings in the ruins, the air pressure alone collapsed towers.",push:"center"},
  {id:"dr06",name:"Ember Gale",cycles:1,color:"#f6ad55",desc:"A wave of embers from the Crimson Cataclysm sweeps units right.",lore:"The embers from the Fury lasted three days. They drifted west on the prevailing winds, setting fire to things that hadn't been involved in the original conflict.",push:"right"},
  {id:"dr07",name:"Shadowqueen's Pull",cycles:1,color:"#9f7aea",desc:"Sylvara's shadow manipulation drags all units leftward.",lore:"Sylvara could reach into a shadow and pull. She pulled armies, rivers, once the entire population of a city, all leftward, all into her territory.",push:"left"},
  {id:"dr08",name:"Oath of Ash Charge",cycles:1,color:"#e05252",desc:"The Oath of Ash drives every creature forward — unstoppable.",lore:"When Vyrathrax declared the Oath of Ash, every dragon felt it as a compulsion. Forward. Always forward. Until the debt was paid.",push:"forward"},
  // BUFFS
  {id:"dr09",name:"Draconic Fury",cycles:2,color:"#e05252",desc:"The rage of the Firstborn fills all combatants — +1 ATK.",lore:"The Fury was not just Vyrathrax's rage. It spread like fire. Every creature on the battlefield felt it — the burning need to destroy.",effects:{atkBonus:1}},
  {id:"dr10",name:"Dragonheart Surge",cycles:3,color:"#68d391",desc:"Power from the stolen Dragonhearts bleeds into units — +1 HP.",lore:"The Dragonhearts were not jewels. They were organs — the physical seat of a dragon's power. Even removed, they pulsed with enough force to strengthen anything nearby.",effects:{hpBonus:1}},
  {id:"dr11",name:"Firstborn's Wrath",cycles:1,color:"#c53030",desc:"Vyrathrax's ancient fury surges through all — +2 ATK.",lore:"The Firstborn were older than the world. Their anger was proportionally ancient. When it peaked, it made the air shake.",effects:{atkBonus:2}},
  // DEBUFFS
  {id:"dr12",name:"Dragon's Smoke",cycles:2,color:"#718096",desc:"Thick dragon smoke obscures all vision — ranged range capped.",lore:"The smoke from a dragon is not ordinary smoke. It is rendered visibility — the physical absence of the ability to see. Archers have called it the most terrifying thing in any battle.",effects:{fogCap:1}},
  {id:"dr13",name:"Venom Breath",cycles:2,color:"#9f7aea",desc:"Sylvara's venom weakens resolve — all units -1 ATK.",lore:"The venom did not kill immediately. First it removed the will to fight — a gentle sapping of purpose that left warriors standing in the middle of battles, confused about why they were holding swords.",effects:{atkMalus:-1}},
  // INSTANT
  {id:"dr14",name:"Dragon Hoard",cycles:1,color:"#d69e2e",desc:"A fragment of the legendary hoard is uncovered — both gain +3 pts.",lore:"The hoard of Vyrathrax contained the wealth of seventeen civilisations. Finding a fragment of it was like finding the ocean by accident.",instant(s){s.pts1+=3;s.pts2+=3;}},
  {id:"dr15",name:"Plunder of Karak Azar",cycles:1,color:"#d69e2e",desc:"War spoils are divided — both gain +2 pts.",lore:"After the Fury, both sides claimed Karak Azar's forge-wealth. The dragons took the star-iron. The dwarves took the honour of dying near it.",instant(s){s.pts1+=2;s.pts2+=2;}},
  {id:"dr16",name:"Tribute Demand",cycles:1,color:"#744210",desc:"The Firstborn demand tribute from all — both lose 1 pt.",lore:"'Tribute' is a dragon word that means 'I want your things and will kill you if you disagree.' The grammar is surprisingly direct.",instant(s){s.pts1=Math.max(0,s.pts1-1);s.pts2=Math.max(0,s.pts2-1);}},
  {id:"dr17",name:"Ember Gift",cycles:1,color:"#f6ad55",desc:"A dragon's blessing in ember form — both gain +1 pt.",lore:"The Ember Gift was the only benevolent thing the dragons were recorded doing — brief, puzzling, probably tactical.",instant(s){s.pts1+=1;s.pts2+=1;}},
  // SPAWNS
  {id:"dr18",name:"Dragon Thrall",cycles:3,color:"#a0aec0",desc:"A warrior broken by Sylvara's venom serves the field.",lore:"The thralls didn't die. They just stopped being themselves. Sylvara found this more economical than corpses.",spawn:{typeId:1,label:"Venom Thrall"}},
  {id:"dr19",name:"Wyvern Rider",cycles:3,color:"#f6ad55",desc:"A wyvern-mounted skirmisher descends from the Fury.",lore:"The wyvern riders fought for both sides. The wyverns did not particularly care who won. They just wanted the fighting to continue.",spawn:{typeId:3,label:"Wyvern Rider"}},
  {id:"dr20",name:"Ember Guard",cycles:3,color:"#fc8181",desc:"Two Ember Guards from the Dragon Citadel land.",lore:"The Ember Guards were dwarves who chose dragonservice over defeat. They are not forgiven by either side. They don't ask to be.",spawn:{typeId:1,label:"Ember Guard",count:2}},
  {id:"dr21",name:"Storm Cavalry",cycles:3,color:"#63b3ed",desc:"Korthulak's storm cavalry materialises.",lore:"The storm cavalry were not riding horses. They were riding storms that had been convinced, through violence and negotiation, to take a vaguely horse-shaped form.",spawn:{typeId:3,label:"Storm Rider"}},
  {id:"dr22",name:"Nyxara's Shade",cycles:4,color:"#9f7aea",desc:"A piece of Nyxara's consciousness takes the field.",lore:"Nyxara the Silent divided her attention the way lesser beings divided their time. A shard of her focus was, by itself, more dangerous than most complete beings.",spawn:{typeId:4,label:"Nyxara's Shade"}},
  {id:"dr23",name:"Vyrathrax's Champion",cycles:4,color:"#f6e05e",desc:"The Worldburner's chosen obliterates all in its path.",lore:"Vyrathrax did not name his champions. He selected them by survival. The one who remained after the others burned was his champion. Naming was inefficient.",spawn:{typeId:4,label:"Ash Champion"}},
  {id:"dr24",name:"Living Siege",cycles:4,color:"#c53030",desc:"A living dragon-construct takes the field.",lore:"The dragons built siege weapons only once, during the Siege of Aeltharion. They built them out of bone and spite. The weapons were technically alive and deeply unhappy about it.",spawn:{typeId:5,label:"Dragon Siege"}},
  // MORE VARIED
  {id:"dr25",name:"Second Flame",cycles:2,color:"#c53030",desc:"Vyrathrax breathes again — 4 more tiles catch living fire.",lore:"The First Flame was the declaration. The Second Flame was the punctuation. No one in Karak Azar needed the sentence explained to them.",tileFx:"fire"},
  {id:"dr26",name:"Korthulak Arrives",cycles:3,color:"#63b3ed",desc:"The Storm Dragon's arrival flash-freezes 4 tiles.",lore:"Korthulak always arrived at altitude. He fell like a frozen thunderbolt. The ice came first — then the sound — then nothing.",tileFx:"ice"},
  {id:"dr27",name:"Shadowqueen Walks",cycles:2,color:"#9f7aea",desc:"Sylvara's footsteps corrupt 4 more tiles.",lore:"She walked slowly. She had never needed to hurry. Everything she needed simply ended up being in her path eventually.",tileFx:"cursed"},
  {id:"dr28",name:"Warmth of the Lost",cycles:2,color:"#68d391",desc:"Memories of the pre-Fury world bless 4 tiles.",lore:"Before the dragons came there was a spring on this ground. Nothing remembers it except the ground itself. The blessing is a memory of warmth — not warmth itself.",tileFx:"blessed"},
  {id:"dr29",name:"Fury Intensifies",cycles:2,color:"#e05252",desc:"The Oath of Ash burns brighter — all units +1 ATK.",lore:"The Fury peaked on the sixth day. Historians call it the Apex. The people who survived call it 'the bit we don't talk about.'",effects:{atkBonus:1}},
  {id:"dr30",name:"Dragonfire Resilience",cycles:2,color:"#68d391",desc:"Dragonfire-hardened warriors gain endurance — +1 HP.",lore:"Those who survived proximity to the Crimson Cataclysm found themselves changed. Harder. Less flammable. Prone to strange dreams involving enormous teeth.",effects:{hpBonus:1}},
  {id:"dr31",name:"Obsidian Wing",cycles:1,color:"#b794f4",desc:"Vyrathrax's wing sweep drives all to centre.",lore:"The wingspan swept right through the middle of the battlefield and kept going. Those who survived being in the middle were more confused than hurt. Briefly.",push:"center"},
  {id:"dr32",name:"Ash Drift",cycles:1,color:"#718096",desc:"Post-Fury ash drifts all units rightward.",lore:"Three days after the Fury, the ash was still falling. It drifted. Everything it touched became briefly, heavily grey.",push:"right"},
  {id:"dr33",name:"Shadow Current",cycles:1,color:"#9f7aea",desc:"Sylvara's shadow-current pulls all units left.",lore:"The Shadow Current was Sylvara's oldest technique — a pull of darkness that moved armies the way a river moves dead leaves. Silently. Completely.",push:"left"},
  {id:"dr34",name:"Dragonfire Surge Forward",cycles:1,color:"#fc8181",desc:"Dragonfire channels forward — all units advance.",lore:"The fire moved forward. Everything near fire moves the same direction fire does, eventually.",push:"forward"},
  {id:"dr35",name:"Ancient Debt",cycles:1,color:"#d69e2e",desc:"Unpaid dragon tribute comes due — both gain +3 pts.",lore:"Dragons don't forget debts. The interest alone, after a century, was substantial. Payment was made. Largely in fear, but payment nonetheless.",instant(s){s.pts1+=3;s.pts2+=3;}},
  {id:"dr36",name:"War Dividend",cycles:1,color:"#d69e2e",desc:"Seven days of war pay — both gain +2 pts.",lore:"The Fury lasted seven days. On day eight, the accountants emerged. Nobody had asked for accountants but here they were, tallying.",instant(s){s.pts1+=2;s.pts2+=2;}},
  {id:"dr37",name:"Worldburner's Toll",cycles:1,color:"#744210",desc:"Vyrathrax claims his tithe — both lose 1 pt.",lore:"Every battle that occurred within three thousand miles of Vyrathrax was, technically, his battle. He charged accordingly.",instant(s){s.pts1=Math.max(0,s.pts1-1);s.pts2=Math.max(0,s.pts2-1);}},
  {id:"dr38",name:"Dragonkin Host",cycles:2,color:"#fc8181",desc:"Two dragonkin warriors descend from the Fury.",lore:"Dragonkin were not dragons. They were what happened when dragons interacted too closely with the natural world for too long. Nobody asked the natural world how it felt about this.",spawn:{typeId:1,label:"Dragonkin",count:2}},
  {id:"dr39",name:"The Obsidian Knight",cycles:4,color:"#f6e05e",desc:"A legendary obsidian-armoured knight serves the Firstborn.",lore:"The Obsidian Knight was not a dragon. It was a human warrior who had served Vyrathrax so long that Vyrathrax's fire had changed them. They had stopped being flammable. They had started being fire.",spawn:{typeId:4,label:"Obsidian Knight"}},
  {id:"dr40",name:"The Siege Wyrm",cycles:4,color:"#c53030",desc:"A siege-class wyrm descends to the battlefield.",lore:"The siege wyrms were not the Firstborn. They were the Firstborn's weapons — creatures bred specifically for destroying fortifications. They had no name because nobody expected them to need one.",spawn:{typeId:5,label:"Siege Wyrm"}},
];

const DECK_CLANS = [
  // TILE EFFECTS
  {id:"cl01",name:"Heather Burns",cycles:3,color:"#c53030",desc:"Highland heather catches fire — 4 tiles blaze.",lore:"The heather burns every century on the Stormcrag Highlands. The Clans built their war calendars around it. The fires always started at the boundary between Redveil and Blackthorn territory. This has never been coincidental.",tileFx:"fire"},
  {id:"cl02",name:"Widow's Frost",cycles:3,color:"#63b3ed",desc:"Cold from Widow's Tor descends — 4 tiles freeze.",lore:"After Ailsa Redveil leapt from Widow's Tor, the temperature on the mountain dropped by ten degrees and never recovered. The Tor remembers what it saw.",tileFx:"ice"},
  {id:"cl03",name:"Blood-Oath Curse",cycles:3,color:"#9f7aea",desc:"A broken blood-oath poisons 4 tiles.",lore:"A Clan blood-oath survives the death of the maker. It becomes something untethered — a promise that has nowhere to go and a great deal of anger about the situation.",tileFx:"cursed"},
  {id:"cl04",name:"Ailsa's Blessing",cycles:2,color:"#68d391",desc:"The ghost of Ailsa Redveil graces 4 tiles.",lore:"Ailsa's ghost does not haunt Widow's Tor. She moves. She has been seen on all three Clan territories — always at crossroads, always pointing toward the path that costs less blood.",tileFx:"blessed"},
  // PUSH
  {id:"cl05",name:"Stormbreaker Falls",cycles:1,color:"#b794f4",desc:"The great stone Stormbreaker shatters — all units pushed to centre.",lore:"The Stormbreaker was the ancient standing stone at the centre of Highland territory. When Borin Thunderfist broke it with a single hammer blow, the shockwave was felt in three valleys.",push:"center"},
  {id:"cl06",name:"Highland Gale",cycles:1,color:"#68d391",desc:"Storm winds scour the Highlands — all units swept rightward.",lore:"The Stormcrag gales have no preference. They pick up everything and carry it rightward — toward the coast, toward the sea, toward whatever is on the right of the map.",push:"right"},
  {id:"cl07",name:"Crag Undertow",cycles:1,color:"#718096",desc:"A crag-gorge wind reversal — all units pulled leftward.",lore:"The gorge between Black Tor and Red Crag creates a reversal wind that the Clans learned to use in battle centuries ago. Everything eventually ends up on the left side of the gorge.",push:"left"},
  {id:"cl08",name:"Thunderfist Charge",cycles:1,color:"#e05252",desc:"Clan Thunderfist's charge drives all units forward.",lore:"Clan Thunderfist did not believe in tactics. They believed in being in front of the other side before the other side could think about where they wanted to be.",push:"forward"},
  // BUFFS / DEBUFFS
  {id:"cl09",name:"War Drums of Redveil",cycles:2,color:"#e05252",desc:"Redveil war drums beat — all units +1 ATK.",lore:"The Redveil drums were made from the hides of the first enemies they defeated. The drums remembered. When they played, everyone in earshot remembered too.",effects:{atkBonus:1}},
  {id:"cl10",name:"Stoneborn Endurance",cycles:3,color:"#68d391",desc:"Highland blood runs thick — all units gain +1 HP.",lore:"Stoneborn dwarves bred for the Highlands over two thousand years. The result was something shorter and broader and considerably harder to kill than either founding stock.",effects:{hpBonus:1}},
  {id:"cl11",name:"Blood-Oath Fury",cycles:1,color:"#c53030",desc:"A blood-oath is sworn — all units surge with +2 ATK.",lore:"The blood-oath doubles the strength of the swearer. It also doubles the cost of breaking it. The Clans considered this a reasonable trade. Every time.",effects:{atkBonus:2}},
  {id:"cl12",name:"Crag Mist",cycles:2,color:"#718096",desc:"Highland mist descends — all ranged range is capped.",lore:"The crag mist doesn't just obscure vision. It insulates sound, smell, and most things that make ranged combat possible. The Highlanders learned to fight blind before they learned to read.",effects:{fogCap:1}},
  {id:"cl13",name:"Clan Grudge",cycles:2,color:"#9f7aea",desc:"Old feuds resurface — all units fight at -1 ATK.",lore:"A Clan grudge doesn't reduce hatred. It focuses it inward. Warriors too busy hating everyone around them fight at a disadvantage — except against the specific person who started the grudge.",effects:{atkMalus:-1}},
  // INSTANT
  {id:"cl14",name:"Cattle Raid",cycles:1,color:"#d69e2e",desc:"A successful raid! Both commanders gain +3 pts.",lore:"The Clans measured wealth in cattle for four centuries after the original settlements. The raids were not theft — they were wealth redistribution with added screaming.",instant(s){s.pts1+=3;s.pts2+=3;}},
  {id:"cl15",name:"Highland Trade Fair",cycles:1,color:"#d69e2e",desc:"A rare moment of peace — both gain +2 pts.",lore:"The Highland Trade Fair happened twice a year in neutral ground. Everyone came armed. Nobody drew weapons. The economy of the Stormcrags was built on this thin tradition of restraint.",instant(s){s.pts1+=2;s.pts2+=2;}},
  {id:"cl16",name:"Winter Tithe",cycles:1,color:"#744210",desc:"The brutal winter demands resources — both lose 1 pt.",lore:"The Highland winter took as much as any enemy. The Clans built their keeps with twice the storage they thought they'd need and still sometimes ran short.",instant(s){s.pts1=Math.max(0,s.pts1-1);s.pts2=Math.max(0,s.pts2-1);}},
  {id:"cl17",name:"Clan Tribute",cycles:1,color:"#d69e2e",desc:"A lesser clan pays tribute — both gain +1 pt.",lore:"The smaller clans paid tribute to whichever of the three major clans was currently winning. This was pragmatic. The major clans called it cowardice. The smaller clans called it survival.",instant(s){s.pts1+=1;s.pts2+=1;}},
  // SPAWNS
  {id:"cl18",name:"Woad Raider",cycles:3,color:"#a0aec0",desc:"A Blackthorn woad-painted raider joins the fighting.",lore:"Clan Blackthorn painted themselves blue before battle. They said the woad made them invisible to the enemy's fear. The enemy respectfully disagreed.",spawn:{typeId:1,label:"Woad Raider"}},
  {id:"cl19",name:"Redveil Archer",cycles:3,color:"#fc8181",desc:"A Clan Redveil archer takes the high ground.",lore:"Redveil archers trained from age five. They could hit a running target at three hundred paces. They could hit a standing target at five hundred. They considered this a failure.",spawn:{typeId:6,label:"Redveil Archer"}},
  {id:"cl20",name:"Crag Scouts",cycles:3,color:"#718096",desc:"Two Crag Scouts from the neutral territories arrive.",lore:"The Crag Scouts served no clan. They served the Highlands — a concept abstract enough that all three clans resented them equally.",spawn:{typeId:1,label:"Crag Scout",count:2}},
  {id:"cl21",name:"Thunderfist Cavalry",cycles:3,color:"#f6ad55",desc:"Clan Thunderfist riders charge the field.",lore:"Thunderfist horses were bred on highland grain and fed on grudges. They were the meanest horses in the known world and took enormous personal satisfaction in trampling things.",spawn:{typeId:3,label:"Thunderfist Rider"}},
  {id:"cl22",name:"Borin Ironbreaker",cycles:4,color:"#f6e05e",desc:"Borin Ironbreaker, who split Stormbreaker with one blow, takes the field.",lore:"Borin Ironbreaker split the Stormbreaker standing stone to end the Siege of Black Crag. He said it was easy. Nobody believed him. Everyone who watched it still had nightmares.",spawn:{typeId:4,label:"Borin Ironbreaker"}},
  {id:"cl23",name:"Maeve Redveil",cycles:4,color:"#fc8181",desc:"Maeve Redveil, the War-Queen who ended three feuds, rides to battle.",lore:"Maeve Redveil ended three feuds by killing everyone involved in all of them simultaneously. The Highlands called this a diplomatic solution. Historians are divided.",spawn:{typeId:4,label:"Maeve Redveil"}},
  {id:"cl24",name:"The Stormcrag Chieftain",cycles:4,color:"#f6e05e",desc:"The legendary Stormcrag Chieftain rides to claim the field.",lore:"The Chieftain held all three clans in check by being more frightening than all of them combined. They did this through force of personality alone. Nobody tested whether there was anything else.",spawn:{typeId:5,label:"Stormcrag Chief"}},
  // MORE VARIETY
  {id:"cl25",name:"Second Burning",cycles:2,color:"#c53030",desc:"The heather burns again — 4 more tiles aflame.",lore:"The second heather fire of the season was always worse. The first one was expected. The second one was personal.",tileFx:"fire"},
  {id:"cl26",name:"The Long Frost",cycles:3,color:"#63b3ed",desc:"A second wave of Widow's cold — 4 more tiles freeze.",lore:"The Long Frost came after the battle, not before. The Clans interpreted this as the landscape mourning. The landscape had no comment.",tileFx:"ice"},
  {id:"cl27",name:"Ailsa's Curse",cycles:2,color:"#9f7aea",desc:"Ailsa's grief bleeds into 4 more tiles.",lore:"Ailsa did not curse anyone when she jumped. She simply left. But grief of that size leaves marks — on stone, on memory, on ground.",tileFx:"cursed"},
  {id:"cl28",name:"Sacred Ground",cycles:2,color:"#68d391",desc:"Ancient clan burial grounds bless 4 tiles.",lore:"Every clan fought over the burial grounds. Not to desecrate them — to be buried there. To be remembered. The fighting was, in some ways, its own form of memorial.",tileFx:"blessed"},
  {id:"cl29",name:"Rallying Pipes",cycles:2,color:"#4299e1",desc:"Highland pipes rally all warriors — +1 ATK.",lore:"The highland pipes carry further than any horn. The Redveil pipers were trained to play while running. Nobody asked them to stop. Nobody would have dared.",effects:{atkBonus:1}},
  {id:"cl30",name:"Highland Spring",cycles:2,color:"#68d391",desc:"Spring thaw revitalises the clans — +1 HP.",lore:"The Highland spring lasted approximately three weeks. The clans used all of it to recover from winter, prepare for summer, and celebrate the narrow window when nobody was dying of anything seasonal.",effects:{hpBonus:1}},
  {id:"cl31",name:"Berserker Oath",cycles:1,color:"#c53030",desc:"A berserker oath sworn at dawn — +2 ATK this cycle.",lore:"The berserker oath was sworn before sunrise so the swearer couldn't see clearly who they were swearing to fight. This was considered optimal. Precision reduced effectiveness.",effects:{atkBonus:2}},
  {id:"cl32",name:"Tor Quake",cycles:1,color:"#b794f4",desc:"Widow's Tor trembles — all units compressed inward.",lore:"The Tor shook three times in recorded history — each time, something significant had ended on its slopes. The ground remembered in the only way ground knows how.",push:"center"},
  {id:"cl33",name:"Western Gale",cycles:1,color:"#68d391",desc:"The western gale drives all units right.",lore:"The westerlies off the sea hit the Stormcrags twice a year with enough force to strip skin. Everything loose went right. Everything attached was questioned about its intentions.",push:"right"},
  {id:"cl34",name:"Redveil Retreat",cycles:1,color:"#fc8181",desc:"Clan Redveil's tactical retreat — all units pulled left.",lore:"Clan Redveil retreating was not cowardice. It was patience. They went left. They always went left. Then they came back from a direction nobody expected.",push:"left"},
  {id:"cl35",name:"Blackthorn Advance",cycles:1,color:"#a0aec0",desc:"Clan Blackthorn's advance — all units surge forward.",lore:"Clan Blackthorn's advance strategy was simple: move forward until something stops you. If nothing stops you, keep moving. If something stops you, make it not stop you.",push:"forward"},
  {id:"cl36",name:"War Spoils",cycles:1,color:"#d69e2e",desc:"Battle spoils divided after the fight — both gain +3 pts.",lore:"The Clans' spoils system was meticulous. One third to the fighters. One third to the clan. One third to the next fight. It was inefficient and nobody touched it.",instant(s){s.pts1+=3;s.pts2+=3;}},
  {id:"cl37",name:"Treaty Payment",cycles:1,color:"#d69e2e",desc:"A peace treaty's compensation — both gain +2 pts.",lore:"Every Highland treaty ended with a payment. Not reparations — investment. In the next war. The treaty writers were deeply practical.",instant(s){s.pts1+=2;s.pts2+=2;}},
  {id:"cl38",name:"Siege Costs",cycles:1,color:"#744210",desc:"Extended siege drains the clans — both lose 1 pt.",lore:"Nobody in the Stormcrags had ever calculated the cost of a siege. They did once, in the third year of the Black Crag siege. The number they got made several people sit down and not speak for some time.",instant(s){s.pts1=Math.max(0,s.pts1-1);s.pts2=Math.max(0,s.pts2-1);}},
  {id:"cl39",name:"Crossbow Company",cycles:3,color:"#f6ad55",desc:"A Redveil crossbow company deploys.",lore:"The Redveil crossbow company were technically mercenaries. They worked exclusively for Redveil. They charged twice what anyone else charged. They were worth it.",spawn:{typeId:7,label:"Redveil Crossbow"}},
  {id:"cl40",name:"The Wandering Chieftain",cycles:4,color:"#f6e05e",desc:"An exiled Highland Chieftain returns with legendary authority.",lore:"The exile lasted twelve years. When the Wandering Chieftain came back, nobody challenged their return. The first person to try had been left-handed. Nobody mentioned this.",spawn:{typeId:5,label:"Wandering Chief"}},
];

const DECK_CRYPT = [
  // TILE EFFECTS
  {id:"cr01",name:"Soul-Fire",cycles:3,color:"#c53030",desc:"The Synod's soul-fire erupts through 4 tiles.",lore:"Soul-fire is not fire. It feeds on the vital force of the living, not on material fuel. It cannot be smothered. It can only be survived — briefly.",tileFx:"fire"},
  {id:"cr02",name:"Desolation's Cradle",cycles:3,color:"#63b3ed",desc:"Cold from the Desolation's Cradle seeps through 4 tiles.",lore:"The Desolation's Cradle is the name the Synod gave to the room at the centre of Vaelorath where they performed the Ascension ritual. It has been cold since the Night of the Ninth Betrayal. Some warmth never returns.",tileFx:"ice"},
  {id:"cr03",name:"Synod Curse",cycles:3,color:"#9f7aea",desc:"The Veiled Synod's curse poisons 4 tiles.",lore:"Nine immortal tyrants, each cursing as they died. The curses did not die with them. They settled into the stones of Vaelorath like sediment — persistent, particular, deeply annoyed.",tileFx:"cursed"},
  {id:"cr04",name:"Lirael's Echo",cycles:2,color:"#68d391",desc:"The stolen soul of Lirael briefly blesses 4 tiles.",lore:"Lirael was the first soul the Synod consumed. Her blessing escaped through the cracks when the Engine shattered. It found the field. It helps, briefly, before exhausting itself.",tileFx:"blessed"},
  // PUSH
  {id:"cr05",name:"Sepulcher Implosion",cycles:1,color:"#9f7aea",desc:"The Necropolis implodes inward — all units crushed to centre.",lore:"The Necropolis of Vaelorath was ripped from the sky and brought down in a controlled implosion. The implosion was less controlled than advertised.",push:"center"},
  {id:"cr06",name:"Maelthas's Sweep",cycles:1,color:"#9f7aea",desc:"The Emperor-King's scepter Lamentation sweeps units right.",lore:"Lamentation was nine feet long and made of weeping black diamond. When Maelthas swept it, the air itself moved right in sympathy.",push:"right"},
  {id:"cr07",name:"Deathless Tide",cycles:1,color:"#a0aec0",desc:"The Deathless surge pulls all units leftward.",lore:"The Deathless did not move in lines. They moved in tides — without volition, without formation, in the direction of the greatest concentration of living things. Always leftward from the entrance to Vaelorath.",push:"left"},
  {id:"cr08",name:"Engine Hunger",cycles:1,color:"#c53030",desc:"The Engine of Ascension's hunger drives all units forward.",lore:"The Engine still runs. Its purpose — to consume and ascend — still drives it. Anything in its field of influence finds itself moving toward the Engine's core. Forward. Always forward.",push:"forward"},
  // BUFFS / DEBUFFS
  {id:"cr09",name:"Harvested Vitality",cycles:2,color:"#e05252",desc:"The Engine's stolen life-force strengthens all combatants — +1 ATK.",lore:"The Engine of Ascension worked by stealing vitality. When it ran, everything near the Crypt was inexplicably stronger. The strength tasted of someone else.",effects:{atkBonus:1}},
  {id:"cr10",name:"Necrotic Resilience",cycles:3,color:"#68d391",desc:"The Crypt's death energies grant twisted endurance — +1 HP.",lore:"You cannot kill what is already dead. More precisely — you cannot kill what has been touched by enough death to understand it. The Crypt's influence made things harder to end.",effects:{hpBonus:1}},
  {id:"cr11",name:"The Engine Screams",cycles:1,color:"#c53030",desc:"The Engine peaks — all units +2 ATK from pure dread.",lore:"The Engine screamed once, on the Night of the Ninth Betrayal, when it shattered. The sound was recorded in the marrow of everyone present. Those who survived moved faster afterward.",effects:{atkBonus:2}},
  {id:"cr12",name:"Ninth Betrayal's Shadow",cycles:2,color:"#9f7aea",desc:"Seryth's betrayal weakens all — -1 ATK.",lore:"Seryth the Whisperer betrayed the Synod to destroy the Engine. The betrayal worked but the shadow it cast weakened everything nearby — including Seryth's own side.",effects:{atkMalus:-1}},
  {id:"cr13",name:"Obsidian Dark",cycles:2,color:"#718096",desc:"Total darkness from the Crypt's depths — ranged range capped.",lore:"The deep rooms of Vaelorath have been dark since the Synod sealed the sunlight out. Not dim — absent. The kind of dark that makes people forget what their hands look like.",effects:{fogCap:1}},
  // INSTANT
  {id:"cr14",name:"Soul Extraction",cycles:1,color:"#d69e2e",desc:"The Engine extracts resource from the conflict — both gain +3 pts.",lore:"The Engine did not know what it was doing. It simply extracted and stored. The stored material came out in the form of power. Both sides felt it. Neither asked where it came from.",instant(s){s.pts1+=3;s.pts2+=3;}},
  {id:"cr15",name:"Synod's Memory",cycles:1,color:"#d69e2e",desc:"The Synod's hoarded wealth bleeds out — both gain +2 pts.",lore:"Nine immortal tyrants accumulate significant wealth over nine centuries. When the Synod fell, the wealth went somewhere. Nobody has fully accounted for where.",instant(s){s.pts1+=2;s.pts2+=2;}},
  {id:"cr16",name:"Eternal Hunger",cycles:1,color:"#744210",desc:"The Engine demands — both lose 1 pt.",lore:"The Engine of Ascension was never satisfied. Not even at the moment of Ascension, had it ever reached that. It simply demanded more.",instant(s){s.pts1=Math.max(0,s.pts1-1);s.pts2=Math.max(0,s.pts2-1);}},
  {id:"cr17",name:"Stolen Moment",cycles:1,color:"#d69e2e",desc:"A moment of clarity in the Crypt — both gain +1 pt.",lore:"The Crypt had one room that the Synod never touched. A small room with a window. In the brief periods between catastrophes, it was the only place in Vaelorath where you could breathe without tasting death.",instant(s){s.pts1+=1;s.pts2+=1;}},
  // SPAWNS
  {id:"cr18",name:"Risen Dead",cycles:3,color:"#a0aec0",desc:"Two of the Crypt's permanent dead rise.",lore:"Some of the dead in Vaelorath never stopped moving. They weren't animated — they simply refused to acknowledge that the distinction between living and dead applied to them.",spawn:{typeId:1,label:"Risen Dead",count:2}},
  {id:"cr19",name:"Silent Keeper",cycles:3,color:"#718096",desc:"A stone abomination from the Crypt's outer chambers stalks the field.",lore:"The Silent Keepers were built by the Synod to maintain the outer chambers without disturbing the rituals. They were given no voice because the Synod found voices irritating. They have strong opinions about this.",spawn:{typeId:2,label:"Silent Keeper"}},
  {id:"cr20",name:"Thrall Champion",cycles:3,color:"#9f7aea",desc:"The Synod's most powerful thrall takes the field.",lore:"The Synod produced thralls in series. This one was the seventh attempt at a champion — the first six had killed themselves in increasingly creative ways rather than continue serving. This one was made of sterner stuff.",spawn:{typeId:3,label:"Thrall Champion"}},
  {id:"cr21",name:"Ashbound Wraith",cycles:3,color:"#a0aec0",desc:"A wraith of compacted ash and will drifts from the Crypt.",lore:"The Ashbound Wraiths were all that remained of warriors who died in the Crypt without enough will to truly die. The will wasn't enough to save them. It was enough to refuse release.",spawn:{typeId:2,label:"Ashbound Wraith"}},
  {id:"cr22",name:"Seryth's Shade",cycles:4,color:"#f6e05e",desc:"The Whisperer's shade escapes the Engine.",lore:"Seryth destroyed the Engine of Ascension from the inside. The shade that escaped carried the plan, the satisfaction, and the approximately three seconds of triumph before the Engine took the rest.",spawn:{typeId:4,label:"Seryth's Shade"}},
  {id:"cr23",name:"Maelthas's Warden",cycles:4,color:"#9f7aea",desc:"Emperor-King Maelthas sends his personal Warden.",lore:"Maelthas sat on the Throne of Unending Silence for nine hundred years. His Wardens stood beside him for all of it. They have had time to develop an opinion about visitors.",spawn:{typeId:4,label:"Maelthas Warden"}},
  {id:"cr24",name:"Engine Fragment",cycles:4,color:"#c53030",desc:"A fragment of the Engine of Ascension takes physical form.",lore:"The Engine shattered but did not disperse. The fragments retained purpose — the old purpose, the only purpose the Engine ever had. Consume. Ascend. Consume. Ascend.",spawn:{typeId:5,label:"Engine Fragment"}},
  // MORE VARIETY
  {id:"cr25",name:"Second Burn",cycles:2,color:"#c53030",desc:"Soul-fire spreads through 4 more tiles.",lore:"The soul-fire did not need fuel. It needed witnesses.",tileFx:"fire"},
  {id:"cr26",name:"Cradle's Reach",cycles:3,color:"#63b3ed",desc:"Desolation's Cradle extends its cold to 4 more tiles.",lore:"The cold that consumed the Ascension chamber eventually consumed the adjacent chambers, and the chambers beyond those, and the chambers beyond those.",tileFx:"ice"},
  {id:"cr27",name:"Synod's Last Curse",cycles:2,color:"#9f7aea",desc:"The Ninth Tyrant's dying curse soaks into 4 more tiles.",lore:"The Ninth Tyrant cursed the Engine, the room, the air, the stone, the concept of betrayal, and anyone who might consider similar actions in future. It was thorough work for a dying person.",tileFx:"cursed"},
  {id:"cr28",name:"Lirael's Hope",cycles:2,color:"#68d391",desc:"More of Lirael's soul escapes to bless 4 tiles.",lore:"Lirael was consumed first but she was not fully consumed. Pieces escaped. They are still escaping, even now — small blessings on random ground, in places where hope is needed.",tileFx:"blessed"},
  {id:"cr29",name:"Engine Surge",cycles:2,color:"#e05252",desc:"The Engine's power pulses — all units +1 ATK.",lore:"The Engine surged unpredictably. When it did, everything in Vaelorath became briefly, uncomfortably more powerful.",effects:{atkBonus:1}},
  {id:"cr30",name:"Death Endurance",cycles:2,color:"#68d391",desc:"Death proximity hardens all units — +1 HP.",lore:"After enough time in the Crypt, the concept of being killable becomes abstract. Things near the Crypt become difficult to end — not immortal, but genuinely inconvenienced by attempts at killing.",effects:{hpBonus:1}},
  {id:"cr31",name:"Unending Scream",cycles:1,color:"#c53030",desc:"The Engine's destruction-scream echoes — all units +2 ATK.",lore:"The scream was technically a frequency — a sound that only living beings could hear, that the Engine emitted when it failed. It made everyone nearby want to fight. It was very effective.",effects:{atkBonus:2}},
  {id:"cr32",name:"Mountain Crack",cycles:1,color:"#b794f4",desc:"Vaelorath tears itself apart — all units driven inward.",lore:"The Necropolis was not built to last indefinitely. The Synod planned for it to last until they ascended, at which point lasting would become somebody else's problem.",push:"center"},
  {id:"cr33",name:"Crypt Current",cycles:1,color:"#9f7aea",desc:"A soul-current sweeps through — all units dragged right.",lore:"The soul-current moved clockwise in Vaelorath. Counterclockwise in the outer chambers. In the field, it moved right. The souls had preferences.",push:"right"},
  {id:"cr34",name:"Deathless Drift",cycles:1,color:"#a0aec0",desc:"The Deathless shift leftward without volition.",lore:"The Deathless drifted. They did not choose to go left. They did not choose anything. They drifted leftward the way smoke drifts toward windows — purposelessly, entirely.",push:"left"},
  {id:"cr35",name:"Ascension Pull",cycles:1,color:"#c53030",desc:"The Engine's ascension impulse drives all forward.",lore:"Even broken, the Engine's drive toward ascension infected everything nearby. Forward. Always forward. Into the machine. Into the purpose.",push:"forward"},
  {id:"cr36",name:"Harvested Millennia",cycles:1,color:"#d69e2e",desc:"Nine centuries of harvested power releases — both gain +3 pts.",lore:"Nine hundred years of soul-harvesting produced a quantity of stored power that, released all at once, was enough to change local geography. Both sides caught some of it.",instant(s){s.pts1+=3;s.pts2+=3;}},
  {id:"cr37",name:"Synod's Tithe",cycles:1,color:"#d69e2e",desc:"A fraction of the Synod's hoards — both gain +2 pts.",lore:"The Synod had nine centuries of accumulated tribute. Finding any of it was accidental. What was found was still substantial.",instant(s){s.pts1+=2;s.pts2+=2;}},
  {id:"cr38",name:"Eternal Debt",cycles:1,color:"#744210",desc:"The Engine's debt falls on all — both lose 1 pt.",lore:"The Engine of Ascension was promised things that were never delivered. The debt accumulated. It was paid in other currencies.",instant(s){s.pts1=Math.max(0,s.pts1-1);s.pts2=Math.max(0,s.pts2-1);}},
  {id:"cr39",name:"Bone Cavalry",cycles:3,color:"#a0aec0",desc:"Skeletal cavalry from the Crypt's deep stables.",lore:"The horses died in the outer stables when the cold came. They rose with everything else. They are still horses. Sort of.",spawn:{typeId:3,label:"Bone Cavalry"}},
  {id:"cr40",name:"Lamentation's Voice",cycles:4,color:"#f6e05e",desc:"Maelthas's scepter Lamentation takes its own form on the field.",lore:"Lamentation wept. Constantly. The black diamond wept black tears and they never dried. When it woke without Maelthas's hand on it, the weeping became louder. It had apparently been holding back.",spawn:{typeId:5,label:"Lamentation's Voice"}},
];

const DECK_LAMENT = [
  // TILE EFFECTS
  {id:"hl01",name:"Black Ice Veins",cycles:3,color:"#63b3ed",desc:"Black ice from the Veins of Ymir's Corpse spreads — 4 tiles freeze.",lore:"The Veins of Ymir's Corpse were the oldest ice in the world — the frozen remains of the first giant slain by the gods. The ice remembered. It was not passive.",tileFx:"ice"},
  {id:"hl02",name:"Hrímveig's Blood",cycles:3,color:"#9f7aea",desc:"Pale blue crystals from Hrímveig's wounds corrupt 4 tiles.",lore:"Her blood froze into crystals before it reached the ground. The crystals spread the curse in the only language blood speaks — proliferation, contact, permanence.",tileFx:"cursed"},
  {id:"hl03",name:"Throne of Absolute Zero",cycles:2,color:"#e05252",desc:"The cold at the edge of existence scorches 4 tiles with killing frost-fire.",lore:"At the Throne of Absolute Zero, the cold was so extreme it had come around the other side to burning. The black spire radiated something that was both and neither.",tileFx:"fire"},
  {id:"hl04",name:"Eldrin's Last Warmth",cycles:2,color:"#68d391",desc:"The fire-mage's dying warmth blesses 4 tiles.",lore:"Eldrin Solhart burned himself out in the Siege of Aeltharion. Not in battle — in hope. He gave every fragment of warmth he had to the ground beneath the city. It still radiates, in small ways, centuries later.",tileFx:"blessed"},
  // PUSH
  {id:"hl05",name:"Hrímvindr Gale",cycles:1,color:"#63b3ed",desc:"The Black Frost Winds blast all units to the centre.",lore:"The Hrímvindr were Hrímveig's personal winds — summoned from the spine of the world. When they blew, armies became statues and statues became dust and dust blew to the centre.",push:"center"},
  {id:"hl06",name:"Frostwrought Tide",cycles:1,color:"#a0aec0",desc:"The Frostwrought Host's tide carries all units rightward.",lore:"The Frostwrought Host moved like a tide. Not like soldiers. They had no formation. They had direction — and direction, at sufficient volume, is its own kind of formation.",push:"right"},
  {id:"hl07",name:"First Frost's Pull",cycles:1,color:"#9f7aea",desc:"The primordial hunger pulls all units leftward.",lore:"The First Frost did not move. It pulled. Everything eventually went leftward — toward the cold, toward the silence, toward the end of light.",push:"left"},
  {id:"hl08",name:"Kael's Advance",cycles:1,color:"#f6ad55",desc:"Kael Thornwyrd's burning advance drives all forward.",lore:"Kael advanced through the Glacier of Shattered Vows by moving at a speed that the cold could not match. The ice melted in front of her. She never slowed. She never looked back.",push:"forward"},
  // BUFFS / DEBUFFS
  {id:"hl09",name:"Niflhel Resonance",cycles:2,color:"#63b3ed",desc:"The Spear of Final Winter resonates — all units +1 ATK.",lore:"Niflhel's resonance could be felt miles from its wielder. It sharpened everything — blades, instincts, the cold edge of intent. Everything moved faster near it.",effects:{atkBonus:1}},
  {id:"hl10",name:"Glacier Endurance",cycles:3,color:"#68d391",desc:"Hrímveig's iron-frost skin hardens all — +1 HP.",lore:"Hrímveig's skin was polished frost over living iron. In her vicinity, that quality bled into everything nearby — harder, colder, less inclined to yield.",effects:{hpBonus:1}},
  {id:"hl11",name:"Frostwrought Fury",cycles:1,color:"#63b3ed",desc:"The Host's ancient rage surges — all units +2 ATK.",lore:"The Frostwrought Host had been fighting since before the world had names. Their fury was not hot — it was cold, compressed, ancient, and virtually inexhaustible.",effects:{atkBonus:2}},
  {id:"hl12",name:"Mirrored Ice Halls",cycles:2,color:"#718096",desc:"Corridors of mirrored ice obscure all — ranged range capped.",lore:"The Glacier's mirrored corridors showed intruders their own frozen corpses — not metaphorically, but literally. The corpses waved. Aiming at anything else proved difficult.",effects:{fogCap:1}},
  {id:"hl13",name:"Siege of Aeltharion",cycles:2,color:"#9f7aea",desc:"The siege's grinding attrition weakens all — -1 ATK.",lore:"The Siege of Aeltharion lasted seven days. On day five, both sides were too tired to be afraid of each other. On day six, they were too tired to fight well. On day seven, something unexpected happened.",effects:{atkMalus:-1}},
  // INSTANT
  {id:"hl14",name:"Shards of Niflhel",cycles:1,color:"#d69e2e",desc:"Power from the broken spear radiates — both gain +3 pts.",lore:"When Niflhel shattered, it released power that had been accumulating since before the world had temperature. Both sides of whatever conflict was nearest felt it.",instant(s){s.pts1+=3;s.pts2+=3;}},
  {id:"hl15",name:"Glacier Spoils",cycles:1,color:"#d69e2e",desc:"Treasures preserved in the ice — both gain +2 pts.",lore:"The glacier preserves everything it consumes. Occasionally, when it shifts, something valuable surfaces — weapons, armour, the remains of seven previous expeditions. All useful.",instant(s){s.pts1+=2;s.pts2+=2;}},
  {id:"hl16",name:"The Long Night",cycles:1,color:"#744210",desc:"The Long Night Without End costs all — both lose 1 pt.",lore:"The Long Night was not a metaphor. The sun went away. For ninety-three days, the world was dark. Resources ran out in the first forty.",instant(s){s.pts1=Math.max(0,s.pts1-1);s.pts2=Math.max(0,s.pts2-1);}},
  {id:"hl17",name:"Warming Ember",cycles:1,color:"#f6ad55",desc:"Kael's burning blade leaves warmth behind — both gain +1 pt.",lore:"Kael's blade was forged from Eldrin Solhart's melted crown. It burned with a specific warmth — the warmth of someone who had chosen hope over practicality and not entirely regretted it.",instant(s){s.pts1+=1;s.pts2+=1;}},
  // SPAWNS
  {id:"hl18",name:"Frost Wraith",cycles:3,color:"#a0aec0",desc:"A frost wraith from the Frostwrought Host drifts in.",lore:"The frost wraiths did not fight. They moved through the Frostwrought Host like currents — cooling everything they touched to a temperature where movement became difficult and then impossible.",spawn:{typeId:1,label:"Frost Wraith"}},
  {id:"hl19",name:"Ice Jotnar",cycles:3,color:"#63b3ed",desc:"A towering ice jotnar strides from the glacier.",lore:"The ice jotnar were not made from ice. They were made from old winter — from the winter that existed before the concept of seasons. They did not like the distinction being made.",spawn:{typeId:2,label:"Ice Jotnar"}},
  {id:"hl20",name:"Wendigo Pack",cycles:3,color:"#718096",desc:"Two wendigo from the deep glacier emerge.",lore:"The wendigo were something that had survived the First Frost by becoming part of it. They were hunger and cold in approximate human shape. The approximation was generous.",spawn:{typeId:1,label:"Wendigo",count:2}},
  {id:"hl21",name:"Glacial Cavalry",cycles:3,color:"#63b3ed",desc:"Riders of ice thunder across the field.",lore:"The glacial cavalry were not riding horses. The horses had frozen. They were riding the memory of movement — the impression of horses left in the ice when the originals had stopped.",spawn:{typeId:3,label:"Glacial Rider"}},
  {id:"hl22",name:"Frostwrought Champion",cycles:4,color:"#63b3ed",desc:"A monstrous Frostwrought champion stalks the field.",lore:"The Frostwrought Host's champions were selected by Hrímveig personally — by walking through the army and not stopping at anything less than what she wanted. Most were still standing when she stopped.",spawn:{typeId:4,label:"Frost Champion"}},
  {id:"hl23",name:"Kael Thornwyrd",cycles:4,color:"#f6e05e",desc:"The warrior-queen Kael Thornwyrd descends from the Glacier.",lore:"Kael came to the Lament looking for power to save her people. She found Hrímveig weeping frozen tears the size of shields and offered her something different. Neither of them survived the choice completely intact.",spawn:{typeId:4,label:"Kael Thornwyrd"}},
  {id:"hl24",name:"Avatar of First Frost",cycles:4,color:"#9f7aea",desc:"A living blizzard takes the form of the First Frost.",lore:"The First Frost was broken into lesser winters — but 'lesser' is relative. Any one of its fragments, given form, was still a primordial hunger given physical expression. The cold had opinions.",spawn:{typeId:5,label:"First Frost Avatar"}},
  // MORE VARIETY
  {id:"hl25",name:"Eternal Winter Extends",cycles:3,color:"#63b3ed",desc:"The Long Night reaches further — 4 more tiles freeze.",lore:"The Long Night did not end cleanly. It thinned, gradually, over months, the way darkness thins before dawn. But some of the ice it made never thawed.",tileFx:"ice"},
  {id:"hl26",name:"Cursed Crystals Spread",cycles:2,color:"#9f7aea",desc:"More of Hrímveig's blood crystallises — 4 more tiles cursed.",lore:"Every place Hrímveig's blood touched became a crossroads between cursed and sacred. Mostly cursed. The ground was confused about how to handle it.",tileFx:"cursed"},
  {id:"hl27",name:"Throne Fire",cycles:2,color:"#e05252",desc:"The Throne's impossible cold-fire spreads to 4 more tiles.",lore:"The Throne of Absolute Zero burned without fuel, froze without cold, and destroyed without contact. It was the paradox that the First Frost had been building toward since before warmth existed.",tileFx:"fire"},
  {id:"hl28",name:"Solhart's Memory",cycles:2,color:"#68d391",desc:"Eldrin's warmth resurfaces on 4 more tiles.",lore:"Eldrin Solhart is remembered everywhere his warmth reached. The world's memory of warmth is partially his memory — something given voluntarily, in a siege, at great cost.",tileFx:"blessed"},
  {id:"hl29",name:"Spear Resonance",cycles:2,color:"#63b3ed",desc:"Niflhel resonates again — all units +1 ATK.",lore:"The broken spear still resonates. The shards remember their purpose. They make everything nearby remember what it is for.",effects:{atkBonus:1}},
  {id:"hl30",name:"Iron Frost Skin",cycles:2,color:"#68d391",desc:"The cold hardens all — +1 HP.",lore:"Long enough near Hrímveig, and the skin changes. Not into frost — into something between frost and iron that asks less of whoever's wearing it and gives more in return.",effects:{hpBonus:1}},
  {id:"hl31",name:"Seven Red Winters",cycles:1,color:"#fc8181",desc:"The northern lights bleed red — all units +2 ATK.",lore:"Every seven winters, the northern lights go red. The local wildlife goes quiet. The ice gets louder. Everyone who has read about Hrímveig leaves the area. Everyone who hasn't stays and is surprised.",effects:{atkBonus:2}},
  {id:"hl32",name:"Rime Wall Collapse",cycles:1,color:"#b794f4",desc:"The rime walls compress — all units pressed inward.",lore:"The glacier's internal walls moved. Not dramatically. Not violently. Just steadily, toward the centre, with the patience of something that had been moving for a hundred years and saw no reason to hurry.",push:"center"},
  {id:"hl33",name:"Frostwrought Rush",cycles:1,color:"#a0aec0",desc:"The Frostwrought surge rightward.",lore:"The Frostwrought Host moved when Hrímveig moved. She moved right. They moved right. Three hundred miles of it, in three days, without food or sleep or apparent effort.",push:"right"},
  {id:"hl34",name:"Niflhel Pulls",cycles:1,color:"#63b3ed",desc:"The Spear of Final Winter draws all things leftward.",lore:"Niflhel pulled the world toward itself the way winter pulls warmth — inexorably, without preference for what it took. Everything moved left in its presence.",push:"left"},
  {id:"hl35",name:"Kael's Charge",cycles:1,color:"#f6ad55",desc:"Kael charges through the Lament — all units surge forward.",lore:"Kael never retreated. Not once in the Glacier. Not when the frost wraiths came. Not when the corridors showed her own frozen corpse. She kept going forward until she found what she was looking for.",push:"forward"},
  {id:"hl36",name:"Lament's Treasure",cycles:1,color:"#d69e2e",desc:"Ancient frozen wealth surfaces — both gain +3 pts.",lore:"The glacier preserves everything. Entire cities, when Hrímveig was at full power. Cities have significant treasury deposits. Occasionally one surfaces in the spring thaw.",instant(s){s.pts1+=3;s.pts2+=3;}},
  {id:"hl37",name:"Two Voices",cycles:1,color:"#d69e2e",desc:"The duet beneath the ice briefly harmonises — both gain +2 pts.",lore:"Some nights, the two voices singing beneath the ice almost harmonise. In those moments, something that might be hope surfaces in anyone nearby. It passes. But it was there.",instant(s){s.pts1+=2;s.pts2+=2;}},
  {id:"hl38",name:"The First Frost's Debt",cycles:1,color:"#744210",desc:"The primordial cold demands — both lose 1 pt.",lore:"The First Frost predated the concept of exchange. But it learned. It learned that things taken from the living could be demanded, and that the demand carried the threat of what it had always been.",instant(s){s.pts1=Math.max(0,s.pts1-1);s.pts2=Math.max(0,s.pts2-1);}},
  {id:"hl39",name:"Niflhel Fragment",cycles:4,color:"#f6e05e",desc:"A shard of the Spear of Final Winter rises.",lore:"The shards of Niflhel were scattered across the Glacier of Shattered Vows when Hrímveig drove it into herself. Each shard retained purpose. The purpose was the end of things.",spawn:{typeId:5,label:"Niflhel Shard"}},
  {id:"hl40",name:"Broken Daughter",cycles:4,color:"#9f7aea",desc:"Hrímveig's consciousness briefly manifests on the field.",lore:"She does not fully wake. A fragment surfaces — enough to move, enough to remember Niflhel and Eldrin and the choice she made at the Throne of Absolute Zero. It is enough to be dangerous.",spawn:{typeId:4,label:"Hrímveig's Echo"}},
];

const THEME_DECKS = [
  {id:"dwarven",name:"Quest of the Dwarven Ruins",color:"#c6a55c",events:DECK_DWARVEN,lore:"Long ago the dwarves of the Ironspike Range carved out Karak Azar — the Eternal Forge. Their king Thrainor Stoneheart wielded Durak\'Thul, forged from a fallen star. Delving too deep, they shattered the seals keeping the Elder Wyrms asleep.\n\nIn a single cataclysmic night, the dragons descended. Thrainor fell. The hammer shattered. Karak Azar became a ruin haunted by ash-wraiths.\n\nTo this day those who enter rarely return."},
  {id:"dragon",name:"Dragon's Fury",color:"#fc8181",events:DECK_DRAGON,lore:"Chief among the Firstborn was Vyrathrax the Worldburner, whose breath was the Crimson Cataclysm — flame that melted adamantine. When dwarves stole the sacred Dragonhearts, Vyrathrax declared the Oath of Ash.\n\n\'What was taken from the Firstborn shall be repaid in fire until the debt is burned from the world.\'\n\nThe Fury lasted seven days and seven nights."},
  {id:"clans",name:"Clans of the Highlands",color:"#68d391",events:DECK_CLANS,lore:"Above the shattered Ironspikes lie the Stormcrag Highlands. Exiled dwarves and highland folk forged the fierce Clans — Thunderfist, Redveil, Blackthorn — warring for Territory, Love, and Revenge.\n\nAilsa Redveil slew her own brother with a dagger hidden in her braid — then threw herself from Widow\'s Tor.\n\nHer death ended one war. And started the cycle that continues today."},
  {id:"crypt",name:"Eternal Crypt",color:"#9f7aea",events:DECK_CRYPT,lore:"The Necropolis of Vaelorath was ripped from the sky by the Veiled Synod — nine tyrants who devoured souls. At its heart, Emperor-King Maelthas clutches Lamentation, a scepter of weeping black diamond.\n\nOn the Night of the Ninth Betrayal, the Engine of Ascension shattered. But it still hungers.\n\nThe Crypt is not a ruin. It is a tomb that refuses to stay dead."},
  {id:"lament",name:"Hrimveig\'s Lament",color:"#63b3ed",events:DECK_LAMENT,lore:"Before warmth had a name, the First Frost stirred. From its glacial heart it wrought Hrimveig — born from black ice with a spear carved from her father\'s spine.\n\nFor centuries she buried worlds. Then she met Eldrin Solhart, a fire-mage who fought her with impossible kindness. His burning palm broke something in her.\n\nShe slumbers now, impaled on her broken spear. Two voices sing beneath the ice. One cold. One warm. Neither free."},
];


function tileName(r, c) {
  return String.fromCharCode(65+c) + String(BOARD - r);
}

const LOOT_COMMON = [
  {w:35, name:"Iron Shard",       color:"#a0aec0", desc:"+1 ATK",                        flavor:"A jagged splinter still thirsting for blood.",                                        apply:function(u){return {...u,atkBuff:(u.atkBuff||0)+1};}},
  {w:22, name:"Stone Shield",     color:"#a0aec0", desc:"+1 HP, Armor",                  flavor:"Hammered from ancient walls. Arrows bounce off it.",                                 apply:function(u){var n={...u,hp:u.hp+1,maxHp:u.maxHp+1};n=addAbility(n,"armor");return n;}},
  {w:18, name:"Scout Boots",      color:"#63b3ed", desc:"+1 Movement",                   flavor:"Made for runners who cross three moors before breakfast.",                           apply:function(u){return {...u,movBuff:(u.movBuff||0)+1};}},
  {w:10, name:"Etched Blade",     color:"#63b3ed", desc:"+2 ATK, Pierce",                flavor:"The edge ignores plate as if it were cloth.",                                       apply:function(u){var n={...u,atkBuff:(u.atkBuff||0)+2};n=addAbility(n,"pierce");return n;}},
  {w:5,  name:"Star Fragment",    color:"#f6e05e", desc:"+3 ATK, +2 HP",                 flavor:"A fragment of something ancient. Carrying it feels like a debt.",                   legendaryAbility:"Once per turn: give the item's holder a free ranged attack with pierce.",    apply:function(u){return {...u,atkBuff:(u.atkBuff||0)+3,hp:u.hp+2,maxHp:u.maxHp+2};}},
  {w:4,  name:"Durak'Thul Shard", color:"#f6e05e", desc:"+3 ATK, +1 HP, Pierce",         flavor:"A fragment of the hammer that forged a star. It still rings when you grip it.",     legendaryAbility:"Once per turn: tap 2 enemy units.",                                         apply:function(u){var n={...u,atkBuff:(u.atkBuff||0)+3,hp:u.hp+1,maxHp:u.maxHp+1};n=addAbility(n,"pierce");return n;}},
  {w:3,  name:"Ashbound Relic",   color:"#f6e05e", desc:"+2 ATK, +2 HP, Armor",          flavor:"Pulled from the bones of Karak Azar. Whatever it protects, it remembers.",          legendaryAbility:"Once per turn: summon a soldier to an adjacent tile to the item's holder.",apply:function(u){var n={...u,atkBuff:(u.atkBuff||0)+2,hp:u.hp+2,maxHp:u.maxHp+2};n=addAbility(n,"armor");return n;}},
  {w:3,  name:"Locket of Thaw",   color:"#f6e05e", desc:"+2 ATK, +3 HP",                 flavor:"An iron vial containing warmth that should not exist. It hums faintly.",             legendaryAbility:"Once per turn: give a tile a blessing.",                                    apply:function(u){return {...u,atkBuff:(u.atkBuff||0)+2,hp:u.hp+3,maxHp:u.maxHp+3};}},
];
const LOOT_ELITE = [
  {w:30, name:"Warden Plate",       color:"#63b3ed", desc:"+2 HP, Armor, +1 MOV",          flavor:"Full plate with articulated joints. Strike and move.",                              apply:function(u){var n={...u,hp:u.hp+2,maxHp:u.maxHp+2,movBuff:(u.movBuff||0)+1};n=addAbility(n,"armor");return n;}},
  {w:24, name:"Piercing Fang",      color:"#63b3ed", desc:"+3 ATK, Pierce",                 flavor:"Still crackles when gripped tight.",                                               apply:function(u){var n={...u,atkBuff:(u.atkBuff||0)+3};n=addAbility(n,"pierce");return n;}},
  {w:18, name:"Ranger Mantle",      color:"#9f7aea", desc:"+2 ATK, Range, Fallback",        flavor:"Strike from afar. Retreat for free.",                                              apply:function(u){var n={...u,atkBuff:(u.atkBuff||0)+2};n=addAbility(n,"range");n=addAbility(n,"fallback");return n;}},
  {w:8,  name:"Warchief Crown",     color:"#f6e05e", desc:"+4 ATK, +2 HP, Pierce",          flavor:"Only the greatest have worn this. Most of them are dead.",                         legendaryAbility:"Once per turn: give the item holder's controller a free spell.",            apply:function(u){var n={...u,atkBuff:(u.atkBuff||0)+4,hp:u.hp+2,maxHp:u.maxHp+2};n=addAbility(n,"pierce");return n;}},
  {w:5,  name:"Legendary Spear",    color:"#f6e05e", desc:"+4 ATK, +3 HP, Range, Pierce",   flavor:"Broken and reforged. You hear ancient winds when you grip it.",                    legendaryAbility:"Once per turn: Leap to another tile and attack a unit while not taking damage.", apply:function(u){var n={...u,atkBuff:(u.atkBuff||0)+4,hp:u.hp+3,maxHp:u.maxHp+3};n=addAbility(n,"range");n=addAbility(n,"pierce");return n;}},
  {w:4,  name:"Niflhel Shard",      color:"#f6e05e", desc:"+4 ATK, +2 HP, Pierce",          flavor:"A sliver of the Spear of Final Winter. It whispers of endings.",                   legendaryAbility:"Once per turn: make a frozen tile that lasts 2 cycles.",                   apply:function(u){var n={...u,atkBuff:(u.atkBuff||0)+4,hp:u.hp+2,maxHp:u.maxHp+2};n=addAbility(n,"pierce");return n;}},
  {w:4,  name:"Obsidian Gauntlet",  color:"#f6e05e", desc:"+3 ATK, +3 HP, Armor, Pierce",   flavor:"Forged in Vyrathrax's fire until it was no longer merely armour.",                 legendaryAbility:"Give the item's holder the ability to attack 2 times each turn.",           apply:function(u){var n={...u,atkBuff:(u.atkBuff||0)+3,hp:u.hp+3,maxHp:u.maxHp+3};n=addAbility(n,"armor");n=addAbility(n,"pierce");return n;}},
  {w:3,  name:"Lamentation's Tear", color:"#f6e05e", desc:"+3 ATK, +4 HP, Armor",           flavor:"A single tear of weeping black diamond, hardened into something unbreakable.",      legendaryAbility:"Once per turn: make a blockable tile that lasts 2 cycles.",                apply:function(u){var n={...u,atkBuff:(u.atkBuff||0)+3,hp:u.hp+4,maxHp:u.maxHp+4};n=addAbility(n,"armor");return n;}},
  {w:4,  name:"Stormbreaker Hilt",  color:"#f6e05e", desc:"+4 ATK, +2 HP, +1 MOV",          flavor:"All that remains of the stone Borin split. It still hums with the impact.",        legendaryAbility:"Once per turn: move 2 units 1 tile away from their present tile.",          apply:function(u){return {...u,atkBuff:(u.atkBuff||0)+4,hp:u.hp+2,maxHp:u.maxHp+2,movBuff:(u.movBuff||0)+1};}},
];

function rollLoot(typeId) {
  var elite = typeId===4||typeId===5||typeId===7||typeId===8;
  var table = elite ? LOOT_ELITE : LOOT_COMMON;
  var total = table.reduce(function(s,e){return s+e.w;},0);
  var r = Math.random()*total;
  for (var i=0;i<table.length;i++){r-=table[i].w;if(r<=0)return table[i];}
  return table[table.length-1];
}

function grantItem(unit, item) {
  var updated = item.apply({...unit});
  var newItem = {name:item.name,desc:item.desc,flavor:item.flavor,color:item.color};
  updated.items = [...(unit.items||[]),newItem];
  return updated;
}

const TILE_CSS = `
@keyframes pulse-fire{0%,100%{box-shadow:inset 0 0 0 #e05252}50%{box-shadow:inset 0 0 14px #e05252cc}}
@keyframes pulse-ice{0%,100%{box-shadow:inset 0 0 0 #63b3ed}50%{box-shadow:inset 0 0 14px #63b3edcc}}
@keyframes pulse-cursed{0%,100%{box-shadow:inset 0 0 0 #9f7aea}50%{box-shadow:inset 0 0 14px #9f7aeacc}}
@keyframes pulse-blessed{0%,100%{box-shadow:inset 0 0 0 #68d391}50%{box-shadow:inset 0 0 14px #68d391cc}}
@keyframes pulse-legendary{0%,100%{box-shadow:0 0 0px #d69e2e,0 0 0px #d69e2e44}50%{box-shadow:0 0 8px #d69e2e,0 0 16px #d69e2e66}}
.tile-fire{animation:pulse-fire 2.2s ease-in-out infinite}
.tile-ice{animation:pulse-ice 2.5s ease-in-out infinite}
.tile-cursed{animation:pulse-cursed 2.8s ease-in-out infinite}
.tile-blessed{animation:pulse-blessed 2.4s ease-in-out infinite}
.unit-legendary{animation:pulse-legendary 2s ease-in-out infinite}
`;

function InjectCSS() { return React.createElement('style',{dangerouslySetInnerHTML:{__html:TILE_CSS}}); }

function clampPos(x,y,w,h,avoidCentre) {
  var vw=typeof window!=="undefined"?window.innerWidth:1200;
  var vh=typeof window!=="undefined"?window.innerHeight:800;
  var left=Math.min(x+14,vw-w-8);
  var top=Math.max(8,Math.min(y-10,vh-h-8));
  if(avoidCentre){
    // If tooltip would overlap the modal popup zone (centre ~30% of screen), push it to a corner
    var cx=vw/2, cy=vh/2;
    var overlapX=left<cx+200&&left+w>cx-200;
    var overlapY=top<cy+250&&top+h>cy-250;
    if(overlapX&&overlapY){
      // Push to top-left or top-right corner away from cursor
      left=x>vw/2?8:vw-w-8;
      top=8;
    }
  }
  return {left:left,top:top};
}

function TileTip({tip,popup}) {
  var info={fire:{icon:"🔥",color:"#fc8181",label:"Fire",effects:["1 dmg on entry","1 dmg each event cycle"]},ice:{icon:"❄",color:"#63b3ed",label:"Ice",effects:["Frozen after moving — cannot attack"]},cursed:{icon:"☠",color:"#9f7aea",label:"Cursed",effects:["-1 ATK while standing here"]},blessed:{icon:"✦",color:"#68d391",label:"Blessed",effects:["+1 ATK while standing here"]}};
  var ti=info[tip.type];
  if(!ti)return null;
  var pos=clampPos(tip.x,tip.y,210,150,popup);
  return (
    <div style={{position:"fixed",left:pos.left,top:pos.top,zIndex:250,pointerEvents:"none",background:"#0a0c14",border:"1px solid "+ti.color+"66",borderTop:"2px solid "+ti.color,borderRadius:4,padding:"10px 13px",minWidth:180,fontFamily:"Courier New,monospace"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{fontSize:18}}>{ti.icon}</span>
        <div><div style={{fontSize:13,fontWeight:"bold",color:ti.color}}>{ti.label}</div><div style={{fontSize:9,color:"#4a5568"}}>{tip.turnsLeft} CYCLE{tip.turnsLeft!==1?"S":""} LEFT</div></div>
      </div>
      {ti.effects.map(function(ef,i){return <div key={i} style={{fontSize:11,color:"#c8d0e0",marginBottom:3,paddingLeft:6,borderLeft:"2px solid "+ti.color+"66"}}>{ef}</div>;})}
    </div>
  );
}

function UnitTip({u,x,y,board,tileEffects,evFx,popup}) {
  var def=UNITS[u.typeId];
  if(!def)return null;
  var pos=clampPos(x,y,270,400,popup);
  var oc=u.owner==="p1"?"#4299e1":u.owner==="p2"?"#fc8181":"#a07040";
  var tileKey=null;
  for(var tr=0;tr<BOARD&&!tileKey;tr++)for(var tc=0;tc<BOARD&&!tileKey;tc++){if(board[tr][tc].some(function(x2){return x2.id===u.id;}))tileKey=tr+","+tc;}
  var ute=tileKey?tileEffects[tileKey]:null;
  var tileBuff=ute&&ute.type==="blessed"?1:ute&&ute.type==="cursed"?-1:0;
  var itemBuff=u.atkBuff||0;
  var evBuff=(evFx.atkBonus||0)+(evFx.atkMalus||0);
  var encampBonus=tileKey&&((u.owner==="p1"&&tileKey.split(",")[0]==="0")||(u.owner==="p2"&&tileKey.split(",")[0]==="6"))?1:0;
  var totalBuff=itemBuff+evBuff+tileBuff+encampBonus;
  var currentAtk=Math.max(0,def.atk+totalBuff);
  var allAbils=(def.abilities||[]).concat((u.bonusAbilities||[]).map(function(a){return a+"*";}));
  return (
    <div style={{position:"fixed",left:pos.left,top:pos.top,zIndex:200,pointerEvents:"none",background:"#0a0c14",border:"1px solid "+oc+"55",borderTop:"2px solid "+oc,borderRadius:4,padding:"10px 13px",minWidth:230,maxWidth:270,fontFamily:"Courier New,monospace"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:14,fontWeight:"bold",color:oc}}>{def.name}</span>
        <span style={{fontSize:9,color:u.tapped?"#fc8181":"#68d391"}}>{u.tapped?"TAPPED":"READY"}</span>
      </div>
      <div style={{display:"flex",gap:10,fontSize:12,marginBottom:4}}>
        <span>ATK <b style={{color:currentAtk<def.atk?"#fc8181":currentAtk>def.atk?"#68d391":"#c8d0e0"}}>{currentAtk}</b>{totalBuff!==0&&<span style={{fontSize:9,color:totalBuff>0?"#68d391":"#fc8181"}}> ({totalBuff>0?"+":""}{totalBuff})</span>}</span>
        <span>HP <b style={{color:u.hp<u.maxHp?"#fc8181":"#68d391"}}>{u.hp}/{u.maxHp}</b></span>
        <span style={{color:"#718096"}}>MOV {def.movDist+(u.movBuff||0)}{(u.movBuff||0)>0&&<span style={{fontSize:9,color:"#68d391"}}> (+{u.movBuff})</span>}</span>
      </div>
      {(evFx.atkBonus||evFx.atkMalus||evFx.hpBonus||tileBuff!==0)&&(
        <div style={{background:"#0d1520",border:"1px solid #1e3050",borderRadius:3,padding:"4px 8px",marginBottom:4,fontSize:10}}>
          <div style={{fontSize:8,color:"#4a5568",letterSpacing:2,marginBottom:2}}>ACTIVE EFFECTS</div>
          {evFx.atkBonus>0&&<div style={{color:"#68d391"}}>⚡ Event: +{evFx.atkBonus} ATK</div>}
          {evFx.atkMalus<0&&<div style={{color:"#fc8181"}}>⚡ Event: {evFx.atkMalus} ATK</div>}
          {evFx.hpBonus>0&&<div style={{color:"#68d391"}}>⚡ Event: +{evFx.hpBonus} HP</div>}
          {tileBuff>0&&<div style={{color:"#68d391"}}>Tile: +1 ATK (blessed)</div>}
          {encampBonus>0&&<div style={{color:"#4299e1",fontWeight:"bold",background:"#0a1020",borderRadius:2,padding:"2px 5px",marginTop:2}}>🏰 ENCAMPMENT BONUS ACTIVE — +1 ATK, +1 HP</div>}
          {tileBuff<0&&<div style={{color:"#9f7aea"}}>Tile: -1 ATK (cursed)</div>}
          {ute&&ute.type==="fire"&&<div style={{color:"#fc8181"}}>Tile: fire — 1 dmg/cycle</div>}
          {ute&&ute.type==="ice"&&<div style={{color:"#63b3ed"}}>Tile: ice — frozen after move</div>}
        </div>
      )}
      {u.spellFx&&u.spellFx.length>0&&(
        <div style={{background:"#120820",border:"1px solid #b794f433",borderRadius:3,padding:"4px 8px",marginBottom:4,fontSize:10}}>
          <div style={{fontSize:8,color:"#b794f488",letterSpacing:2,marginBottom:2}}>✦ SPELL EFFECTS</div>
          {u.spellFx.map(function(fx,i){return <div key={i} style={{color:"#b794f4"}}>✦ {fx}</div>;})}
        </div>
      )}
      {allAbils.length>0&&<div style={{marginBottom:5}}>{allAbils.map(function(a,i){var base=a.replace("*","");var isBonus=a.slice(-1)==="*";return <div key={i} style={{fontSize:9,color:isBonus?"#f6e05e":"#b794f4",background:isBonus?"#1a1500":"#1a1030",borderRadius:2,padding:"2px 5px",marginBottom:2}}>{isBonus?"★ ":""}<b>{base.toUpperCase()}</b></div>;})}</div>}
      {u.sick&&<div style={{fontSize:10,color:"#ed8936",marginBottom:3}}>Summoning sickness</div>}
      {u.items&&u.items.length>0&&<div style={{borderTop:"1px solid #1e2535",paddingTop:4,marginTop:4}}>
        <div style={{fontSize:8,color:"#f6e05e88",letterSpacing:2,marginBottom:2}}>ITEMS</div>
        {u.items.map(function(it,i){return <div key={i} style={{fontSize:9,color:it.color||"#f6e05e",marginBottom:1}}>★ {it.name} — {it.desc}</div>;})}
      </div>}
      {u.neutral&&<div style={{borderTop:"1px solid #1e2535",paddingTop:5,marginTop:4}}>
        <div style={{fontSize:8,color:"#f6e05e88",letterSpacing:2,marginBottom:3}}>DROPS ON DEFEAT</div>
        {LOOT_COMMON.map(function(e,i){return <div key={i} style={{display:"flex",alignItems:"center",gap:5,marginBottom:2,background:"#0d0f1a",borderRadius:2,padding:"2px 5px",borderLeft:"2px solid "+(e.color||"#d69e2e")}}><span style={{fontSize:10,fontWeight:"bold",color:"#f6e05e",minWidth:26}}>{Math.round(e.w/LOOT_COMMON.reduce(function(s,x){return s+x.w;},0)*100)}%</span><div><div style={{fontSize:9,color:e.color||"#d69e2e",fontWeight:"bold"}}>{e.name}</div><div style={{fontSize:8,color:"#4a5568"}}>{e.desc}</div></div></div>;})}
      </div>}
    </div>
  );
}

function BtnTip({typeId,x,y}) {
  var def=UNITS[typeId];
  if(!def)return null;
  // Position to the left of cursor to avoid overlapping unit tooltip
  var vw=typeof window!=="undefined"?window.innerWidth:1200;
  var vh=typeof window!=="undefined"?window.innerHeight:800;
  var pos={left:Math.max(4,x-244),top:Math.max(8,Math.min(y-10,vh-220))};
  return (
    <div style={{position:"fixed",left:pos.left,top:pos.top,zIndex:200,pointerEvents:"none",background:"#0a0c14",border:"1px solid #2a3550",borderTop:"2px solid #4299e1",borderRadius:4,padding:"10px 13px",minWidth:200,fontFamily:"Courier New,monospace"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:14,fontWeight:"bold",color:"#c8d0e0"}}>{def.name}</span>
        <span style={{fontSize:10,color:"#d69e2e"}}>{def.cost}pt</span>
      </div>
      <div style={{display:"flex",gap:10,fontSize:11,color:"#718096",marginBottom:6}}>
        <span>ATK <b style={{color:"#c8d0e0"}}>{def.atk}</b></span>
        <span>HP <b style={{color:"#68d391"}}>{def.hp}</b></span>
        <span>MOV <b style={{color:"#c8d0e0"}}>{def.movDist}</b></span>
      </div>
      {MERGE_REQ[typeId]&&<div style={{background:"#0f1820",border:"1px solid #9f7aea44",borderRadius:3,padding:"4px 7px",marginBottom:5,fontSize:10}}>
        <span style={{color:"#9f7aea"}}>⬡ Merge: </span>
        <span style={{color:"#c8d0e0"}}>{MERGE_REQ[typeId]}x {def.name}</span>
        <span style={{color:"#4a5568"}}> → </span>
        <span style={{color:"#d69e2e"}}>{UNITS[def.mergeTo]&&UNITS[def.mergeTo].name}</span>
        <span style={{color:"#fb923c"}}> ({MERGE_COST[typeId]}pt)</span>
      </div>}
      {def.abilities&&def.abilities.length>0&&<div style={{marginBottom:5}}>{def.abilities.map(function(a,i){return <div key={i} style={{fontSize:9,color:"#b794f4",background:"#1a1030",borderRadius:2,padding:"2px 5px",marginBottom:2}}><b>{a.toUpperCase()}</b></div>;})}</div>}
    </div>
  );
}

function shuffled(arr) {
  var a = arr.slice();
  for (var i=a.length-1;i>0;i--) { var j=Math.floor(Math.random()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; }
  return a;
}

function initBoard() {
  var b = [];
  for(var i=0;i<BOARD;i++){b.push([]);for(var j=0;j<BOARD;j++)b[i].push([]);}
  b[0][3].push(makeUnit(0,'p1'));
  b[6][3].push(makeUnit(0,'p2'));
  return b;
}

function cloneBoard(b) { return b.map(function(row){return row.map(function(cell){return cell.map(function(u){return {...u};});});}); }

const ALL_LEGENDARY_UNITS = (function(){
  var all=[...DECK_DWARVEN,...DECK_DRAGON,...DECK_CLANS,...DECK_CRYPT,...DECK_LAMENT];
  var seen={};
  return all.filter(function(e){
    if(!e.spawn||e.cycles!==4)return false;
    var key=e.spawn.label;
    if(seen[key])return false;
    seen[key]=true;
    return true;
  });
})();
const ALL_LEGENDARY_ITEMS=[...LOOT_COMMON,...LOOT_ELITE].filter(function(e){return !!e.legendaryAbility;});
// rarity: "common" (max 4 copies, cost 1-2), "uncommon" (max 2 copies, cost 2-3), "rare" (max 1 copy, cost 3-5)
const ALL_SPELLS=[
  {id:"warcry",      name:"War Cry",         rarity:"common",  cost:1, target:"own",   color:"#fb923c", desc:"Target friendly unit gains +2 ATK this turn."},
  {id:"battlesong",  name:"Battle Song",     rarity:"common",  cost:2, target:"own",   color:"#fb923c", desc:"Target friendly unit gains +1 ATK permanently."},
  {id:"sharpen",     name:"Sharpen",         rarity:"common",  cost:1, target:"own",   color:"#fb923c", desc:"Target friendly unit gains +1 ATK this turn."},
  {id:"furyblow",    name:"Fury Blow",       rarity:"common",  cost:2, target:"own",   color:"#e05252", desc:"Target friendly unit attacks twice this turn."},
  {id:"mend",        name:"Mend",            rarity:"common",  cost:1, target:"own",   color:"#68d391", desc:"Restore 2 HP to a friendly unit."},
  {id:"fortify",     name:"Fortify",         rarity:"common",  cost:2, target:"own",   color:"#68d391", desc:"Target friendly unit gains +2 max HP and heals 2."},
  {id:"ironhide",    name:"Iron Hide",       rarity:"common",  cost:1, target:"own",   color:"#a0aec0", desc:"Target friendly unit gains +1 HP."},
  {id:"blaze",       name:"Blaze Arrow",     rarity:"common",  cost:2, target:"enemy", color:"#f87171", desc:"Deal 2 damage to a target enemy unit."},
  {id:"weaken",      name:"Weaken",          rarity:"common",  cost:1, target:"enemy", color:"#9f7aea", desc:"Target enemy unit loses 1 ATK this turn."},
  {id:"slowfoot",    name:"Slow Foot",       rarity:"common",  cost:1, target:"enemy", color:"#718096", desc:"Target enemy unit cannot move this turn."},
  {id:"fumble",      name:"Fumble",          rarity:"common",  cost:2, target:"enemy", color:"#9f7aea", desc:"Target enemy unit loses 2 ATK this turn."},
  {id:"exhaust",     name:"Exhaust",         rarity:"common",  cost:1, target:"enemy", color:"#718096", desc:"Tap a target enemy unit — it cannot act this turn."},
  {id:"rally",       name:"Rally",           rarity:"common",  cost:2, target:"own",   color:"#4ade80", desc:"Untap a friendly unit — it may act again this turn."},
  {id:"brushfire",   name:"Brush Fire",      rarity:"common",  cost:2, target:"tile",  color:"#e05252", desc:"Set a target tile on fire for 2 cycles."},
  {id:"bless",       name:"Bless Ground",    rarity:"common",  cost:1, target:"tile",  color:"#68d391", desc:"Bless a target tile for 2 cycles."},
  {id:"frostpatch",  name:"Frost Patch",     rarity:"common",  cost:2, target:"tile",  color:"#63b3ed", desc:"Freeze a target tile for 2 cycles."},
  {id:"haste",       name:"Haste",           rarity:"common",  cost:1, target:"own",   color:"#63b3ed", desc:"Target friendly unit gains +1 movement this turn."},
  {id:"retreat",     name:"Forced Retreat",  rarity:"common",  cost:2, target:"enemy", color:"#718096", desc:"Push a target enemy unit 1 tile directly backward."},
  {id:"shield",      name:"Shield Wall",     rarity:"common",  cost:2, target:"own",   color:"#63b3ed", desc:"Shield a friendly unit — negates the next hit it takes."},
  {id:"guardup",     name:"Guard Up",        rarity:"common",  cost:1, target:"own",   color:"#a0aec0", desc:"Target friendly unit gains Armor this turn."},
  {id:"warcry2",     name:"War Howl",        rarity:"uncommon",cost:3, target:"own",   color:"#fb923c", desc:"All friendly units on the board gain +1 ATK this turn."},
  {id:"bloodrite",   name:"Blood Rite",      rarity:"uncommon",cost:2, target:"own",   color:"#c53030", desc:"Sacrifice 3 HP from a friendly unit to give it +4 ATK this turn."},
  {id:"berserker",   name:"Berserker",       rarity:"uncommon",cost:3, target:"own",   color:"#e05252", desc:"Target friendly unit gains +3 ATK but loses Armor this turn."},
  {id:"snipe",       name:"Snipe",           rarity:"uncommon",cost:2, target:"enemy", color:"#f87171", desc:"Deal 3 damage to a target enemy unit, ignoring Armor."},
  {id:"regenerate",  name:"Regenerate",      rarity:"uncommon",cost:3, target:"own",   color:"#68d391", desc:"Fully restore a friendly unit's HP."},
  {id:"lifedrain",   name:"Life Drain",      rarity:"uncommon",cost:2, target:"enemy", color:"#9f7aea", desc:"Deal 2 damage to an enemy and heal a friendly unit 2 HP."},
  {id:"massexhaust", name:"Mass Exhaust",    rarity:"uncommon",cost:3, target:"enemy", color:"#718096", desc:"Tap all enemy units on one target tile."},
  {id:"inspire",     name:"Inspire",         rarity:"uncommon",cost:2, target:"own",   color:"#4ade80", desc:"Untap all friendly units on one target tile."},
  {id:"teleport",    name:"Teleport",        rarity:"uncommon",cost:3, target:"own",   color:"#b794f4", desc:"Move a friendly unit to any unoccupied tile on the board."},
  {id:"shove",       name:"Shove",           rarity:"uncommon",cost:2, target:"enemy", color:"#718096", desc:"Push a target enemy unit 2 tiles in any direction."},
  {id:"rootstrike",  name:"Root Strike",     rarity:"uncommon",cost:2, target:"enemy", color:"#9f7aea", desc:"Target enemy unit becomes Immovable for 1 turn."},
  {id:"marksman",    name:"Marksman",        rarity:"uncommon",cost:2, target:"own",   color:"#f6e05e", desc:"Target friendly unit gains Range this turn."},
  {id:"blindshot",   name:"Blind Shot",      rarity:"uncommon",cost:3, target:"enemy", color:"#718096", desc:"Remove Range from target enemy unit this turn."},
  {id:"inferno",     name:"Inferno",         rarity:"uncommon",cost:3, target:"tile",  color:"#c53030", desc:"Set 2 adjacent tiles on fire for 3 cycles."},
  {id:"blizzard",    name:"Blizzard",        rarity:"uncommon",cost:3, target:"tile",  color:"#63b3ed", desc:"Freeze 2 adjacent tiles for 3 cycles."},
  {id:"hexground",   name:"Hex Ground",      rarity:"uncommon",cost:2, target:"tile",  color:"#9f7aea", desc:"Curse a target tile for 3 cycles."},
  {id:"clearground", name:"Clear Ground",    rarity:"uncommon",cost:2, target:"tile",  color:"#68d391", desc:"Remove any tile effect from a target tile."},
  {id:"stonewarden", name:"Stone Warden",    rarity:"uncommon",cost:3, target:"own",   color:"#a0aec0", desc:"Target friendly unit gains Armor and +2 HP."},
  {id:"piercearmor", name:"Pierce Armor",    rarity:"uncommon",cost:2, target:"own",   color:"#63b3ed", desc:"Target friendly unit gains Pierce this turn."},
  {id:"deathstrike", name:"Death Strike",    rarity:"rare",    cost:4, target:"enemy", color:"#c084fc", desc:"Destroy a target enemy unit outright, regardless of HP."},
  {id:"warlordscall",name:"Warlord's Call",  rarity:"rare",    cost:5, target:"own",   color:"#d69e2e", desc:"All friendly units gain +2 ATK and untap this turn."},
  {id:"onslaught",   name:"Onslaught",       rarity:"rare",    cost:4, target:"own",   color:"#e05252", desc:"Target friendly unit attacks 3 times this turn."},
  {id:"venomstrike", name:"Venom Strike",    rarity:"rare",    cost:3, target:"enemy", color:"#9f7aea", desc:"Deal 4 damage to a target enemy unit and reduce its ATK by 2."},
  {id:"resurrection",name:"Resurrection",   rarity:"rare",    cost:5, target:"own",   color:"#f6e05e", desc:"Return a destroyed friendly unit to an adjacent tile at full HP."},
  {id:"bloodpact",   name:"Blood Pact",      rarity:"rare",    cost:4, target:"own",   color:"#c53030", desc:"Halve a friendly unit's HP to double its ATK permanently."},
  {id:"dominion",    name:"Dominion",        rarity:"rare",    cost:4, target:"enemy", color:"#9f7aea", desc:"Take control of a target enemy unit for 1 turn."},
  {id:"paralyze",    name:"Paralyze",        rarity:"rare",    cost:6, target:"enemy", color:"#718096", desc:"Tap all enemy units on the board for 1 cycle."},
  {id:"massrally",   name:"Mass Rally",      rarity:"rare",    cost:4, target:"own",   color:"#4ade80", desc:"Untap all friendly units on the board."},
  {id:"voidstep",    name:"Void Step",       rarity:"rare",    cost:3, target:"own",   color:"#b794f4", desc:"Target friendly unit leaps to any tile and attacks without counter damage."},
  {id:"armageddon",  name:"Armageddon",      rarity:"rare",    cost:5, target:"tile",  color:"#c53030", desc:"Set all tiles in a 2-tile radius on fire for 3 cycles."},
  {id:"deepfreeze",  name:"Deep Freeze",     rarity:"rare",    cost:4, target:"tile",  color:"#63b3ed", desc:"Freeze all tiles in a 2-tile radius for 3 cycles."},
  {id:"sanctify",    name:"Sanctify",        rarity:"rare",    cost:4, target:"tile",  color:"#68d391", desc:"Bless all tiles in a 2-tile radius for 3 cycles."},
  {id:"blight",      name:"Blight",          rarity:"rare",    cost:4, target:"tile",  color:"#9f7aea", desc:"Curse all tiles in a 2-tile radius for 3 cycles."},
  {id:"eagleeye",    name:"Eagle Eye",       rarity:"rare",    cost:3, target:"own",   color:"#f6e05e", desc:"Target friendly unit gains Range and Pierce permanently."},
  {id:"blindfield",  name:"Blind Field",     rarity:"rare",    cost:4, target:"enemy", color:"#718096", desc:"All enemy ranged units lose Range for 2 turns."},
  {id:"calltroops",  name:"Call to Arms",    rarity:"rare",    cost:4, target:"own",   color:"#d69e2e", desc:"Summon 2 Soldiers to your back row for free."},
  {id:"phantom",     name:"Phantom Guard",   rarity:"rare",    cost:3, target:"own",   color:"#b794f4", desc:"Summon a 1 HP Soldier that absorbs the next hit on an adjacent friendly unit."},
  {id:"fortresswall",name:"Fortress Wall",   rarity:"rare",    cost:5, target:"own",   color:"#a0aec0", desc:"All friendly units gain Armor, +2 HP, and Shield this turn."},
  {id:"nullfield",   name:"Null Field",      rarity:"rare",    cost:4, target:"tile",  color:"#718096", desc:"Remove and block all tile effects in a 2-tile area for 3 cycles."},
  {id:"stormcall",   name:"Storm Call",      rarity:"rare",    cost:4, target:"tile",  color:"#63b3ed", desc:"Call a lightning strike — all units on target tile take 2 damage."},
  // ── SUMMON spells ─────────────────────────────────────────────────────────
  {id:"conscript",   name:"Conscript",       rarity:"common",  cost:2, target:"own",   color:"#68d391", tag:"summon", desc:"Summon 1 Soldier adjacent to a target friendly unit."},
  {id:"bfsurge",     name:"Battlefield Surge",rarity:"common", cost:1, target:"tile",  color:"#68d391", tag:"summon", desc:"Summon 1 Soldier on any empty battlefield tile."},
  {id:"dblenlist",   name:"Double Enlist",   rarity:"uncommon",cost:3, target:"own",   color:"#68d391", tag:"summon", desc:"Summon 2 Soldiers to your back row."},
  {id:"flankguard",  name:"Flank Guard",     rarity:"uncommon",cost:2, target:"own",   color:"#9f7aea", tag:"summon", desc:"Summon 1 Archer adjacent to a target friendly unit."},
  {id:"knightsvow",  name:"Knight's Vow",    rarity:"uncommon",cost:3, target:"own",   color:"#63b3ed", tag:"summon", desc:"Summon 1 Knight to your back row."},
  {id:"xbwcompany",  name:"Crossbow Company",rarity:"rare",    cost:4, target:"own",   color:"#9f7aea", tag:"summon", desc:"Summon 2 Crossbowmen to your back row."},
  {id:"ironlegion",  name:"Iron Legion",     rarity:"rare",    cost:5, target:"tile",  color:"#a0aec0", tag:"summon", desc:"Fill a target tile with up to 4 Soldiers."},
  {id:"advanceguard",name:"Advance Guard",   rarity:"rare",    cost:4, target:"own",   color:"#4ade80", tag:"summon", desc:"Summon 1 Soldier to each of 3 front-row tiles."},
  {id:"stormlines",  name:"Storm the Lines", rarity:"rare",    cost:4, target:"enemy", color:"#e05252", tag:"summon", desc:"Summon 2 Soldiers adjacent to a target enemy unit."},
  {id:"warengine",   name:"War Engine",      rarity:"rare",    cost:5, target:"tile",  color:"#d69e2e", tag:"summon", desc:"Summon a Cavalier to a target battlefield tile."},
  {id:"grantflank",  name:"Flanking Strike",  rarity:"uncommon",cost:3, target:"own",   color:"#d69e2e", desc:"Grant a friendly unit the Flank ability — it can attack and advance via L-shape."},
  {id:"shadowveil",  name:"Shadow Veil",      rarity:"rare",    cost:4, target:"own",   color:"#b794f4", desc:"Grant a friendly unit Stealth — it cannot be targeted by spells or ranged attacks."},
];
const SPELL_MAX_COPIES={common:4,uncommon:2,rare:1};
function makeRandomSpellBook() {
  var book=[];
  var counts={};
  var pool=shuffled(ALL_SPELLS.slice());
  for(var i=0;i<pool.length&&book.length<20;i++){
    var s=pool[i];
    var cur=counts[s.id]||0;
    var max=SPELL_MAX_COPIES[s.rarity]||1;
    if(cur<max){counts[s.id]=cur+1;book.push({...s});}
  }
  return book;
}
function loadAllSpellBooks(){try{var v=localStorage.getItem("spellbooks_v2");return v?JSON.parse(v):{};}catch(e){return {};}}
function saveAllSpellBooks(all){try{localStorage.setItem("spellbooks_v2",JSON.stringify(all));}catch(e){}}
function loadSavedSpellBook(){
  // Try new format first, fall back to legacy
  var all=loadAllSpellBooks();
  var keys=Object.keys(all);
  if(keys.length>0)return all[keys[0]];
  try{var v=localStorage.getItem("spellbook");return v?JSON.parse(v):null;}catch(e){return null;}
}
function saveSpellBook(book){
  // Legacy save kept for compatibility
  try{localStorage.setItem("spellbook",JSON.stringify(book));}catch(e){}
}
const REF_ABILITY_DESC={
  charge:   {color:"#f6ad55",desc:"No summoning sickness — can act the turn it is summoned."},
  armor:    {color:"#63b3ed",desc:"Immune to ranged attacks that do not have Pierce."},
  fallback: {color:"#68d391",desc:"Retreat costs 0 points instead of the normal 2."},
  range:    {color:"#9f7aea",desc:"Ranged attacker — does not take counter-damage from melee units."},
  pierce:   {color:"#fc8181",desc:"Bypasses Armor ability on the target."},
  immovable:{color:"#718096",desc:"Cannot move or be moved by any effect."},
  slow:     {color:"#e05252",desc:"Cannot retreat from the battlefield."},
  flank:    {color:"#d69e2e",desc:"Can attack and advance via L-shape — blocked from targeting units in their encampment."},
  stealth:  {color:"#b794f4",desc:"Cannot be targeted by spells or ranged attacks."},
};

function ReferencePanel() {
  var [tab,setTab]=React.useState("abilities");
  var [search,setSearch]=React.useState("");
  var q=search.trim().toLowerCase();
  var tabs=["abilities","leg. units","leg. items","spells"];
  var tabKeys=["abilities","legunits","legitems","spells"];
  function matchAbil(k,v){return !q||k.toLowerCase().includes(q)||v.desc.toLowerCase().includes(q);}
  function matchUnit(e){return !q||e.spawn.label.toLowerCase().includes(q)||e.name.toLowerCase().includes(q)||e.lore.toLowerCase().includes(q);}
  function matchItem(e){return !q||e.name.toLowerCase().includes(q)||e.desc.toLowerCase().includes(q)||(e.legendaryAbility&&e.legendaryAbility.toLowerCase().includes(q));}
  function matchSpell(e){return !q||e.name.toLowerCase().includes(q)||e.desc.toLowerCase().includes(q);}
  return (
    <div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0,gap:4}}>
      <div style={{color:"#4a5568",letterSpacing:3,fontSize:10,fontWeight:"bold",borderBottom:"1px solid #1e2535",paddingBottom:4,flexShrink:0}}>REFERENCE</div>
      <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="search..." style={{background:"#0a0c14",border:"1px solid #2a3550",color:"#c8d0e0",borderRadius:3,padding:"4px 7px",fontFamily:"Courier New,monospace",fontSize:10,outline:"none",width:"100%",boxSizing:"border-box",flexShrink:0}}/>
      <div style={{display:"flex",gap:2,flexShrink:0}}>
        {tabs.map(function(t,i){var k=tabKeys[i];return <button key={k} onClick={function(){setTab(k);}} style={{flex:1,background:tab===k?"#1e2535":"#0a0c14",border:"1px solid "+(tab===k?"#4a5568":"#1e2535"),color:tab===k?"#c8d0e0":"#4a5568",borderRadius:2,padding:"3px 0",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:7,letterSpacing:1}}>{t.toUpperCase()}</button>;})}
      </div>
      <div style={{overflowY:"auto",flex:1,minHeight:0,display:"flex",flexDirection:"column",gap:4}}>
        {tab==="abilities"&&Object.entries(REF_ABILITY_DESC).filter(function(e){return matchAbil(e[0],e[1]);}).map(function(e){var k=e[0],v=e[1];return(
          <div key={k} style={{background:"#0d0f1a",borderRadius:3,padding:"5px 7px",borderLeft:"3px solid "+v.color}}>
            <div style={{fontSize:9,fontWeight:"bold",color:v.color,letterSpacing:1,marginBottom:2}}>{k.toUpperCase()}</div>
            <div style={{fontSize:9,color:"#8892a4",lineHeight:1.5}}>{v.desc}</div>
          </div>
        );})}
        {tab==="legunits"&&ALL_LEGENDARY_UNITS.filter(matchUnit).map(function(e){var unitDef=UNITS[e.spawn.typeId];return(
          <div key={e.id} style={{background:"#0d0f1a",borderRadius:3,padding:"5px 7px",borderLeft:"3px solid "+(e.color||"#f6e05e")}}>
            <div style={{fontSize:9,fontWeight:"bold",color:e.color||"#f6e05e",marginBottom:1}}>{e.spawn.label}</div>
            <div style={{fontSize:8,color:"#718096",marginBottom:2}}>via: {e.name} · {unitDef?unitDef.name:""} — ATK {unitDef?unitDef.atk:""} HP {unitDef?unitDef.hp:""}</div>
            <div style={{fontSize:8,color:"#6b7280",lineHeight:1.5,fontStyle:"italic"}}>{e.lore.slice(0,120)}{e.lore.length>120?"…":""}</div>
          </div>
        );})}
        {tab==="legitems"&&ALL_LEGENDARY_ITEMS.filter(matchItem).map(function(e,i){return(
          <div key={i} style={{background:"#0d0f1a",borderRadius:3,padding:"5px 7px",borderLeft:"3px solid "+(e.color||"#f6e05e")}}>
            <div style={{fontSize:9,fontWeight:"bold",color:e.color||"#f6e05e",marginBottom:1}}>{e.name}</div>
            <div style={{fontSize:8,color:"#a0adb8",marginBottom:3}}>{e.desc}</div>
            <div style={{fontSize:8,color:"#f6ad55",background:"#1a0e00",borderRadius:2,padding:"2px 5px",borderLeft:"2px solid #f6ad5566"}}>⚡ {e.legendaryAbility}</div>
            <div style={{fontSize:8,color:"#4a5568",marginTop:2,fontStyle:"italic"}}>{e.flavor}</div>
          </div>
        );})}
        {tab==="spells"&&ALL_SPELLS.filter(matchSpell).map(function(e,i){var rcol={common:"#a0aec0",uncommon:"#63b3ed",rare:"#f6e05e"}[e.rarity]||"#718096";return(
          <div key={i} style={{background:"#0d0f1a",borderRadius:3,padding:"5px 7px",borderLeft:"3px solid "+e.color}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
              <div style={{fontSize:9,fontWeight:"bold",color:e.color}}>{e.name}</div>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                <span style={{fontSize:7,color:rcol}}>{e.rarity}</span>
                <span style={{fontSize:8,color:"#9f7aea"}}>{e.cost}pt</span>
                <span style={{fontSize:7,color:"#4a5568"}}>max {SPELL_MAX_COPIES[e.rarity]}</span>
              </div>
            </div>
            <div style={{fontSize:8,color:"#718096",marginBottom:1,display:"flex",gap:4,alignItems:"center"}}>
              <span style={{color:e.tag==="summon"?"#4ade80":e.target==="tile"?"#f6ad55":"#68d391",background:e.tag==="summon"?"#4ade8018":e.target==="tile"?"#f6ad5518":"#68d39118",borderRadius:2,padding:"1px 4px",border:"1px solid "+(e.tag==="summon"?"#4ade8044":e.target==="tile"?"#f6ad5544":"#68d39144"),fontSize:7}}>{e.tag==="summon"?"summon":e.target==="tile"?"tile":"unit"}</span>
              <span>{e.target}</span>
            </div>
            <div style={{fontSize:9,color:"#8892a4",lineHeight:1.5}}>{e.desc}</div>
          </div>
        );})}
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [vsMode, setVsMode] = useState("cpu");
  const [p1First, setP1First] = useState(true);
  const [chosenDeck, setChosenDeck] = useState(THEME_DECKS[0]);
  const [chosenSpellBook, setChosenSpellBook] = useState(function(){return loadSavedSpellBook()||makeRandomSpellBook();});
  const [onlineConn, setOnlineConn] = useState(null);
  const [myOnlineRole, setMyOnlineRole] = useState("p1");
  const [onlineDeck, setOnlineDeck] = useState(null);
  const lobbyChat = useLobbyChat();

  function handleOnlineReady(conn, role, deck, p1First) {
    setOnlineConn(conn);
    setMyOnlineRole(role);
    setOnlineDeck(deck||THEME_DECKS[0]);
    setP1First(p1First!=null ? p1First : role==="p1");
    setVsMode("online");
    setScreen("game");
  }

  if (screen === "menu")      return <Menu onStart={function(mode){setVsMode(mode);setScreen("deck");}} onSpellBook={function(){setScreen("spellbook");}} onOnline={function(){setScreen("online");}} />;
  if (screen === "online")    return <OnlineLobby onReady={handleOnlineReady} onBack={function(){setScreen("menu");}} lobbyChat={lobbyChat} />;
  if (screen === "spellbook") return <SpellBookSelect current={chosenSpellBook} onConfirm={function(b){setChosenSpellBook(b);saveSpellBook(b);setScreen("menu");}} onBack={function(){setScreen("menu");}} />;
  if (screen === "deck")      return <DeckSelect onConfirm={function(d){setChosenDeck(d);setScreen("dice");}} onBack={function(){setScreen("menu");}} />;
  if (screen === "dice")      return <DiceScreen vsMode={vsMode} onDone={function(p1f){setP1First(p1f);setScreen("game");}} />;
  if (screen === "game")      return <Game vsMode={vsMode} p1First={p1First} chosenDeck={vsMode==="online"?onlineDeck:chosenDeck} chosenSpellBook={chosenSpellBook} onlineConn={vsMode==="online"?onlineConn:null} myOnlineRole={vsMode==="online"?myOnlineRole:null} lobbyChat={vsMode==="online"?lobbyChat:null} onMenu={function(){if(onlineConn){try{onlineConn.close();}catch(e){}setOnlineConn(null);}setScreen("menu");}} />;
  return null;
}

// ─── Online Lobby ─────────────────────────────────────────────────────────────
function OnlineLobby({ onReady, onBack, lobbyChat }) {
  var [status, setStatus] = React.useState("idle"); // idle | loading | hosting | joining | dice | connected | error
  var [roomCode, setRoomCode] = React.useState("");
  var [joinCode, setJoinCode] = React.useState("");
  var [errorMsg, setErrorMsg] = React.useState("");
  var [deckChoice, setDeckChoice] = React.useState(THEME_DECKS[0]);
  var [oppDeckId, setOppDeckId] = React.useState(null);
  var [resolvedDeckId, setResolvedDeckId] = React.useState(null);
  var [myRoll, setMyRoll] = React.useState(null);
  var [oppRoll, setOppRoll] = React.useState(null);
  var [isHost, setIsHost] = React.useState(false);
  var [rolling, setRolling] = React.useState(false);
  var peerRef = React.useRef(null);
  var connRef = React.useRef(null);
  var myRollRef = React.useRef(null);
  var oppRollRef = React.useRef(null);
  var readyRef = React.useRef(false);
  var deckChoiceRef = React.useRef(THEME_DECKS[0]);
  // Keep deckChoiceRef in sync
  React.useEffect(function(){deckChoiceRef.current=deckChoice;},[deckChoice]);

  React.useEffect(function(){
    return function(){
      if(readyRef.current)return; // game started — don't destroy the live connection
      if(connRef.current){try{connRef.current.close();}catch(e){}}
      if(peerRef.current){try{peerRef.current.destroy();}catch(e){}}
    };
  },[]);

  function loadPeerJS(cb){
    if(window.Peer){cb();return;}
    var s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.2/peerjs.min.js";
    s.onload=cb;
    s.onerror=function(){setStatus("error");setErrorMsg("Failed to load PeerJS library. Check your connection.");};
    document.head.appendChild(s);
  }

  function sendDeckChoice(conn){
    try{conn.send({type:"DECK_CHOICE",deckId:deckChoiceRef.current.id});}catch(e){}
  }

  function attachConnHandlers(conn, hostSide, deckId){
    conn.on("data",function(msg){
      if(!msg)return;
      if(msg.type==="DECK_CHOICE"){
        setOppDeckId(msg.deckId);
      }
      if(msg.type==="DICE_ROLL"){
        oppRollRef.current=msg.roll;
        setOppRoll(msg.roll);
        checkBothRolled(hostSide, deckId);
      }
      if(msg.type==="GAME_START"){
        // Only process once joiner has rolled (myRollRef set by doRoll)
        if(!hostSide && myRollRef.current==null){
          // Store it and retry after a short poll until rolled
          var pending=msg;
          var t=setInterval(function(){
            if(myRollRef.current!=null){
              clearInterval(t);
              var deck=THEME_DECKS.find(function(d){return d.id===pending.deckId;})||THEME_DECKS[0];
              setStatus("connected");
              readyRef.current=true;
              setTimeout(function(){onReady(conn,"p2",deck,pending.p1First);},400);
            }
          },100);
          return;
        }
        if(!hostSide){
          var deck=THEME_DECKS.find(function(d){return d.id===msg.deckId;})||THEME_DECKS[0];
          setStatus("connected");
          readyRef.current=true;
          setTimeout(function(){onReady(conn,"p2",deck,msg.p1First);},400);
        }
      }
    });
    conn.on("error",function(e){setStatus("error");setErrorMsg("Connection error: "+e.message);});
    conn.on("close",function(){if(status!=="connected")setStatus("error"),setErrorMsg("Opponent disconnected.");});
  }

  function checkBothRolled(hostSide, deckId){
    var mine=myRollRef.current;
    var opp=oppRollRef.current;
    if(mine==null||opp==null)return;
    // reroll ties automatically
    if(mine===opp){
      var newMine=Math.ceil(Math.random()*6);
      myRollRef.current=newMine;
      setMyRoll(newMine);
      setOppRoll(null);
      oppRollRef.current=null;
      connRef.current.send({type:"DICE_ROLL",roll:newMine});
      return;
    }
    // host decides p1First and resolves deck conflict, then sends GAME_START
    if(hostSide){
      var p1First=mine>opp; // host (p1 role) goes first if they rolled higher
      // Deck resolution: if decks differ, higher roller's deck wins
      var finalDeckId=deckId;
      setOppDeckId(function(oppId){
        if(oppId&&oppId!==deckId){finalDeckId=p1First?deckId:oppId;}
        return oppId;
      });
      // Use a short timeout to let oppDeckId state settle before sending
      setTimeout(function(){
        setOppDeckId(function(oppId){
          if(oppId&&oppId!==deckId){finalDeckId=p1First?deckId:oppId;}
          connRef.current.send({type:"GAME_START",deckId:finalDeckId,p1First:p1First});
          setResolvedDeckId(finalDeckId);
          setStatus("connected");
          var deck=THEME_DECKS.find(function(d){return d.id===finalDeckId;})||THEME_DECKS[0];
          readyRef.current=true;
          setTimeout(function(){onReady(connRef.current,"p1",deck,p1First);},400);
          return oppId;
        });
      },150);
    }
    // guest waits for GAME_START from host
  }

  function doRoll(){
    if(rolling||myRoll!=null)return;
    setRolling(true);
    var roll=Math.ceil(Math.random()*6);
    myRollRef.current=roll;
    setMyRoll(roll);
    connRef.current.send({type:"DICE_ROLL",roll:roll});
    checkBothRolled(isHost, isHost?deckChoiceRef.current.id:null);
    setRolling(false);
  }

  function hostGame(){
    setStatus("loading");
    loadPeerJS(function(){
      try{
        var peer=new window.Peer(undefined,{debug:0});
        peerRef.current=peer;
        peer.on("open",function(){
          setRoomCode(peer.id);
          setStatus("hosting");
          peer.on("connection",function(conn){
            connRef.current=conn;
            setIsHost(true);
            conn.on("open",function(){
              setMyRoll(null);setOppRoll(null);myRollRef.current=null;oppRollRef.current=null;
              setOppDeckId(null);setResolvedDeckId(null);
              sendDeckChoice(conn);
              setStatus("dice");
            });
            attachConnHandlers(conn,true,deckChoiceRef.current.id);
          });
        });
        peer.on("error",function(e){setStatus("error");setErrorMsg("Peer error: "+e.message);});
      }catch(e){setStatus("error");setErrorMsg("Error: "+e.message);}
    });
  }

  function joinGame(){
    if(!joinCode.trim()){setErrorMsg("Enter a room code.");return;}
    setStatus("loading");
    loadPeerJS(function(){
      try{
        var peer=new window.Peer(undefined,{debug:0});
        peerRef.current=peer;
        peer.on("open",function(){
          var conn=peer.connect(joinCode.trim(),{reliable:true});
          connRef.current=conn;
          setIsHost(false);
          conn.on("open",function(){
            setMyRoll(null);setOppRoll(null);myRollRef.current=null;oppRollRef.current=null;
            setOppDeckId(null);setResolvedDeckId(null);
            sendDeckChoice(conn);
            setStatus("dice");
          });
          attachConnHandlers(conn,false,null);
        });
        peer.on("error",function(e){setStatus("error");setErrorMsg("Peer error: "+e.message);});
      }catch(e){setStatus("error");setErrorMsg("Error: "+e.message);}
    });
  }

  var fullRoomCode = peerRef.current&&peerRef.current.id ? peerRef.current.id : "";
  var faces = ["","⚀","⚁","⚂","⚃","⚄","⚅"];
  var oppDeck = oppDeckId ? THEME_DECKS.find(function(d){return d.id===oppDeckId;}) : null;
  var decksSame = oppDeckId && oppDeckId===deckChoice.id;
  var decksDiffer = oppDeckId && oppDeckId!==deckChoice.id;

  return (
    <div style={{minHeight:"100vh",background:"#0d0b08",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"Courier New,monospace",color:"#c8a96e",padding:20,position:"relative"}}>
      <button onClick={onBack} style={{position:"absolute",top:16,left:16,background:"none",border:"1px solid #2a1e08",color:"#4a5568",borderRadius:3,padding:"5px 12px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9,letterSpacing:2}}>← BACK</button>
      <div style={{fontSize:9,color:"#4a3810",letterSpacing:5}}>⚡ ONLINE MULTIPLAYER</div>
      <div style={{fontSize:11,color:"#718096",textAlign:"center",maxWidth:400}}>Play peer-to-peer. No account needed.<br/>Share your room code with your opponent.</div>

      {status==="idle"&&<div style={{display:"flex",flexDirection:"column",gap:12,width:"100%",maxWidth:380}}>
        <div style={{background:"#0d0f1a",border:"1px solid #1e2535",borderRadius:4,padding:"12px 16px"}}>
          <div style={{fontSize:9,color:"#4a5568",letterSpacing:3,marginBottom:8}}>CHOOSE BATTLE DECK</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {THEME_DECKS.map(function(d){return(
              <button key={d.id} onClick={function(){setDeckChoice(d);}} style={{background:deckChoice.id===d.id?d.color+"18":"#0a0c14",border:"1px solid "+(deckChoice.id===d.id?d.color+"55":"#1e2535"),borderLeft:"3px solid "+d.color,color:deckChoice.id===d.id?d.color:"#718096",borderRadius:3,padding:"8px 12px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:10,letterSpacing:1,textAlign:"left"}}>{d.name}</button>
            );})}
          </div>
        </div>
        <button onClick={hostGame} style={{background:"#060e10",border:"1px solid #0e3040",borderLeft:"3px solid #4299e1",color:"#4299e1",borderRadius:3,padding:"14px 20px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:12,letterSpacing:3,textAlign:"left"}}>
          ⊕ CREATE ROOM
        </button>
        <div style={{background:"#0d0f1a",border:"1px solid #1e2535",borderRadius:4,padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:9,color:"#4a5568",letterSpacing:3}}>JOIN A ROOM</div>
          <input value={joinCode} onChange={function(e){setJoinCode(e.target.value);setErrorMsg("");}} placeholder="Paste room code here..." style={{background:"#0a0c14",border:"1px solid #2a3550",color:"#c8d0e0",borderRadius:3,padding:"6px 10px",fontFamily:"Courier New,monospace",fontSize:11,outline:"none",width:"100%",boxSizing:"border-box"}}/>
          <button onClick={joinGame} disabled={!joinCode.trim()} style={{background:joinCode.trim()?"#063010":"#0a0c14",border:"1px solid "+(joinCode.trim()?"#68d39155":"#1e2535"),color:joinCode.trim()?"#68d391":"#2a3550",borderRadius:3,padding:"10px",cursor:joinCode.trim()?"pointer":"not-allowed",fontFamily:"Courier New,monospace",fontSize:11,letterSpacing:2}}>CONNECT →</button>
        </div>
        {errorMsg&&<div style={{color:"#fc8181",fontSize:10,textAlign:"center",padding:"6px 10px",background:"#1a0808",borderRadius:3,border:"1px solid #c5303033"}}>{errorMsg}</div>}
        <LobbyChatPanel lobbyChat={lobbyChat} myRoomCode={fullRoomCode}/>
      </div>}

      {status==="loading"&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
        <div style={{fontSize:28,color:"#4299e1"}}>⟳</div>
        <div style={{fontSize:12,color:"#718096",letterSpacing:2}}>CONNECTING...</div>
      </div>}

      {status==="hosting"&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,width:"100%",maxWidth:400}}>
        <div style={{fontSize:11,color:"#4299e1",letterSpacing:3}}>ROOM CREATED — WAITING FOR OPPONENT</div>
        <div style={{background:"#060e10",border:"2px solid #4299e1",borderRadius:6,padding:"16px 24px",textAlign:"center"}}>
          <div style={{fontSize:10,color:"#4a5568",letterSpacing:3,marginBottom:6}}>YOUR ROOM CODE</div>
          <div style={{fontSize:13,color:"#4299e1",wordBreak:"break-all",lineHeight:1.6,fontWeight:"bold",letterSpacing:1,marginBottom:8}}>{fullRoomCode||"Generating..."}</div>
          {fullRoomCode&&<button onClick={function(){navigator.clipboard&&navigator.clipboard.writeText(fullRoomCode);}} style={{background:"#4299e122",border:"1px solid #4299e144",color:"#4299e1",borderRadius:3,padding:"5px 14px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9,letterSpacing:2}}>COPY CODE</button>}
        </div>
        <div style={{fontSize:10,color:"#4a5568",textAlign:"center"}}>Share the code above with your opponent.<br/>They paste it into "Join a Room".</div>
        <LobbyChatPanel lobbyChat={lobbyChat} myRoomCode={fullRoomCode}/>
        <button onClick={function(){if(peerRef.current){try{peerRef.current.destroy();}catch(e){}}setStatus("idle");setRoomCode("");}} style={{background:"none",border:"1px solid #c5303044",color:"#c53030",borderRadius:3,padding:"6px 16px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9,letterSpacing:2}}>CANCEL</button>
      </div>}

      {status==="dice"&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,width:"100%",maxWidth:440}}>
        {/* Deck banner */}
        <div style={{width:"100%",background:"#0d0f1a",border:"1px solid #1e2535",borderRadius:4,padding:"12px 16px"}}>
          <div style={{fontSize:9,color:"#4a5568",letterSpacing:3,marginBottom:10,textAlign:"center"}}>BATTLE DECK SELECTION</div>
          <div style={{display:"flex",gap:8,justifyContent:"center",alignItems:"stretch"}}>
            <div style={{flex:1,background:deckChoice.color+"18",border:"1px solid "+(deckChoice.color+"55"),borderLeft:"3px solid "+deckChoice.color,borderRadius:3,padding:"8px 10px"}}>
              <div style={{fontSize:8,color:"#4a5568",letterSpacing:2,marginBottom:3}}>YOU</div>
              <div style={{fontSize:10,fontWeight:"bold",color:deckChoice.color}}>{deckChoice.name}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",fontSize:12,color:"#2a3550"}}>VS</div>
            <div style={{flex:1,background:oppDeck?oppDeck.color+"18":"#0a0c14",border:"1px solid "+(oppDeck?oppDeck.color+"55":"#1e2535"),borderLeft:"3px solid "+(oppDeck?oppDeck.color:"#2a3550"),borderRadius:3,padding:"8px 10px"}}>
              <div style={{fontSize:8,color:"#4a5568",letterSpacing:2,marginBottom:3}}>OPPONENT</div>
              <div style={{fontSize:10,fontWeight:"bold",color:oppDeck?oppDeck.color:"#2a3550"}}>{oppDeck?oppDeck.name:"Waiting..."}</div>
            </div>
          </div>
          {decksSame&&<div style={{marginTop:8,fontSize:9,color:"#68d391",textAlign:"center",letterSpacing:1}}>✓ Both chose the same deck</div>}
          {decksDiffer&&!resolvedDeckId&&<div style={{marginTop:8,fontSize:9,color:"#d69e2e",textAlign:"center",letterSpacing:1}}>⚔ Decks differ — higher roll decides</div>}
          {resolvedDeckId&&<div style={{marginTop:8,fontSize:9,color:"#f6e05e",textAlign:"center",letterSpacing:1}}>★ Playing: {(THEME_DECKS.find(function(d){return d.id===resolvedDeckId;})||deckChoice).name}</div>}
        </div>
        {/* Dice roll */}
        <div style={{fontSize:9,color:"#4a3810",letterSpacing:5}}>⚔ WHO STRIKES FIRST ⚔</div>
        <div style={{display:"flex",gap:48,alignItems:"center"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:10,color:"#4299e1",letterSpacing:3,marginBottom:10}}>YOU</div>
            <div style={{fontSize:72,color:myRoll?"#4299e1":"#2a1e08"}}>{myRoll?faces[myRoll]:"⚀"}</div>
            {myRoll&&<div style={{fontSize:22,fontWeight:"bold",color:"#4299e1",marginTop:6}}>{myRoll}</div>}
          </div>
          <div style={{fontSize:18,color:"#2a1e08"}}>VS</div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:10,color:"#fc8181",letterSpacing:3,marginBottom:10}}>OPPONENT</div>
            <div style={{fontSize:72,color:oppRoll?"#fc8181":"#2a1e08"}}>{oppRoll?faces[oppRoll]:"⚀"}</div>
            {oppRoll&&<div style={{fontSize:22,fontWeight:"bold",color:"#fc8181",marginTop:6}}>{oppRoll}</div>}
          </div>
        </div>
        {!myRoll&&<button onClick={doRoll} style={{background:"#1a1208",border:"1px solid #d69e2e44",color:"#d69e2e",borderRadius:3,padding:"11px 40px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:11,letterSpacing:3}}>⚄ ROLL THE DICE</button>}
        {myRoll&&!oppRoll&&<div style={{fontSize:11,color:"#718096",letterSpacing:2}}>WAITING FOR OPPONENT TO ROLL...</div>}
        {myRoll&&oppRoll&&myRoll===oppRoll&&<div style={{fontSize:11,color:"#d69e2e",letterSpacing:2}}>TIE — ROLLING AGAIN...</div>}
      </div>}

      {status==="connected"&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
        <div style={{fontSize:28,color:"#68d391"}}>✓</div>
        <div style={{fontSize:12,color:"#68d391",letterSpacing:2}}>CONNECTED — STARTING GAME...</div>
      </div>}

      {status==="error"&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,maxWidth:380}}>
        <div style={{color:"#fc8181",fontSize:12,textAlign:"center",padding:"10px 16px",background:"#1a0808",borderRadius:4,border:"1px solid #c5303044"}}>{errorMsg}</div>
        <button onClick={function(){setStatus("idle");setErrorMsg("");}} style={{background:"none",border:"1px solid #4299e144",color:"#4299e1",borderRadius:3,padding:"7px 18px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:10,letterSpacing:2}}>TRY AGAIN</button>
      </div>}
    </div>
  );
}


// ─── Lobby Chat ───────────────────────────────────────────────────────────────
// MQTT state is hoisted to App so the connection persists across screen changes

var _lobbyChatSingleton = null; // module-level singleton so App re-renders don't recreate it

function useLobbyChat() {
  var [chatState, setChatState] = React.useState(function(){
    return _lobbyChatSingleton || {connState:"idle",name:"",nameInput:localStorage.getItem("lobbyName")||"",players:[],messages:[],dmTarget:""};
  });
  var stateRef = React.useRef(chatState);
  stateRef.current = chatState;

  var clientRef = React.useRef(null);
  var myIdRef = React.useRef(null);
  var playersRef = React.useRef({});
  var presenceTimerRef = React.useRef(null);
  var sentIdsRef = React.useRef(new Set());

  var TOPIC_CHAT = "lore-of-battle/lobby/chat";
  var TOPIC_PRESENCE = "lore-of-battle/lobby/presence";

  function patchState(patch){ setChatState(function(prev){var next={...prev,...patch};_lobbyChatSingleton=next;return next;}); }

  function loadMqtt(cb){
    if(window.mqtt){cb();return;}
    var s=document.createElement("script");
    s.src="https://unpkg.com/mqtt@5.3.4/dist/mqtt.min.js";
    s.onload=function(){setTimeout(cb,50);};
    s.onerror=function(){patchState({connState:"error"});};
    document.head.appendChild(s);
  }

  function joinLobby(n){
    if(!n||!n.trim())return;
    n=n.trim();
    localStorage.setItem("lobbyName",n);
    myIdRef.current="p_"+Math.random().toString(36).slice(2,8);
    patchState({connState:"connecting",name:n});

    loadMqtt(function(){
      var mqttLib=window.mqtt;
      if(!mqttLib||typeof mqttLib.connect!=="function"){patchState({connState:"error"});return;}
      // Try EMQX public broker (reliable WSS, no cert issues)
      var brokers=["wss://broker.emqx.io:8084/mqtt","wss://broker.hivemq.com:8884/mqtt"];
      var bi=0;
      function tryBroker(){
        if(bi>=brokers.length){patchState({connState:"error"});return;}
        var url=brokers[bi++];
        try{
          if(clientRef.current){try{clientRef.current.end(true);}catch(e){}}
          var client=mqttLib.connect(url,{
            clientId:"lob_"+Math.random().toString(36).slice(2,10),
            reconnectPeriod:0,
            connectTimeout:6000,
            keepalive:25,
          });
          clientRef.current=client;
          var didConnect=false;
          var timeout=setTimeout(function(){if(!didConnect){client.end(true);tryBroker();}},7000);
          client.on("connect",function(){
            didConnect=true;clearTimeout(timeout);
            patchState({connState:"connected"});
            client.subscribe(TOPIC_CHAT);
            client.subscribe(TOPIC_PRESENCE);
            publishPresence(client,n,true);
            clearInterval(presenceTimerRef.current);
            presenceTimerRef.current=setInterval(function(){
              publishPresence(client,stateRef.current.name,true);
              var now=Date.now();
              var active={};
              Object.entries(playersRef.current).forEach(function(e){if(now-e[1].ts<25000)active[e[0]]=e[1];});
              playersRef.current=active;
              patchState({players:Object.values(active)});
            },8000);
          });
          client.on("message",function(topic,payload){
            try{
              var msg=JSON.parse(payload.toString());
              if(topic===TOPIC_PRESENCE){
                if(msg.id===myIdRef.current)return;
                if(msg.online){
                  playersRef.current[msg.id]={name:msg.name,ts:Date.now()};
                  patchState({players:Object.values(playersRef.current)});
                  if(clientRef.current)publishPresence(clientRef.current,stateRef.current.name,true);
                } else {
                  delete playersRef.current[msg.id];
                  patchState({players:Object.values(playersRef.current)});
                }
              }
              if(topic===TOPIC_CHAT){
                if(msg.to&&msg.to!==stateRef.current.name&&msg.from!==stateRef.current.name)return;
                if(msg._id&&sentIdsRef.current.has(msg._id))return;
                patchState({messages:[...stateRef.current.messages.slice(-49),msg]});
              }
            }catch(e){}
          });
          client.on("error",function(){});
          client.on("close",function(){if(didConnect){patchState({connState:"idle"});}});
        }catch(e){tryBroker();}
      }
      tryBroker();
    });
  }

  function leaveLobby(){
    clearInterval(presenceTimerRef.current);
    if(clientRef.current){
      try{publishPresence(clientRef.current,stateRef.current.name,false);}catch(e){}
      try{clientRef.current.end(true);}catch(e){}
      clientRef.current=null;
    }
    playersRef.current={};
    _lobbyChatSingleton=null;
    patchState({connState:"idle",name:"",players:[],messages:[],dmTarget:""});
  }

  function publishPresence(client,n,online){
    try{client.publish(TOPIC_PRESENCE,JSON.stringify({id:myIdRef.current,name:n,online:online}),{qos:0,retain:false});}catch(e){}
  }

  function sendMsg(text,dmTarget){
    if(!text||!clientRef.current)return;
    var msgId=Math.random().toString(36).slice(2);
    var msg={_id:msgId,from:stateRef.current.name,to:dmTarget||null,text:text,ts:Date.now()};
    sentIdsRef.current.add(msgId);
    try{clientRef.current.publish(TOPIC_CHAT,JSON.stringify(msg));}catch(e){}
    patchState({messages:[...stateRef.current.messages.slice(-49),msg]});
  }

  function sendCode(myRoomCode,dmTarget){
    if(!myRoomCode||!clientRef.current)return;
    var msgId=Math.random().toString(36).slice(2);
    var msg={_id:msgId,from:stateRef.current.name,to:dmTarget||null,text:"🎮 Room code: "+myRoomCode,ts:Date.now(),isCode:true};
    sentIdsRef.current.add(msgId);
    try{clientRef.current.publish(TOPIC_CHAT,JSON.stringify(msg));}catch(e){}
    patchState({messages:[...stateRef.current.messages.slice(-49),msg]});
  }

  return {chatState, patchState, joinLobby, leaveLobby, sendMsg, sendCode};
}

function LobbyChatPanel({ lobbyChat, myRoomCode }) {
  var {chatState, patchState, joinLobby, leaveLobby, sendMsg, sendCode} = lobbyChat;
  var {connState, name, nameInput, players, messages, dmTarget} = chatState;
  var msgScrollRef = React.useRef(null);
  var [msgInput, setMsgInput] = React.useState("");

  React.useEffect(function(){
    if(msgScrollRef.current)msgScrollRef.current.scrollTop=msgScrollRef.current.scrollHeight;
  },[messages]);

  if(connState==="idle"||connState==="connecting"||connState==="error") return (
    <div style={{background:"#0a0e18",border:"1px solid #1e2535",borderRadius:4,padding:"12px 16px",width:"100%",boxSizing:"border-box"}}>
      <div style={{fontSize:9,color:"#4a5568",letterSpacing:3,marginBottom:8}}>LOBBY CHAT</div>
      {connState==="error"&&<div style={{fontSize:9,color:"#fc8181",marginBottom:6}}>Connection failed — retrying next broker...</div>}
      <div style={{display:"flex",gap:6}}>
        <input value={nameInput} onChange={function(e){patchState({nameInput:e.target.value});}} onKeyDown={function(e){if(e.key==="Enter")joinLobby(nameInput);}} placeholder="Enter your name..." style={{flex:1,background:"#0a0c14",border:"1px solid #2a3550",color:"#c8d0e0",borderRadius:3,padding:"6px 8px",fontFamily:"Courier New,monospace",fontSize:10,outline:"none"}}/>
        <button onClick={function(){joinLobby(nameInput);}} disabled={connState==="connecting"} style={{background:"#4299e122",border:"1px solid #4299e144",color:"#4299e1",borderRadius:3,padding:"6px 12px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9,letterSpacing:1,opacity:connState==="connecting"?0.5:1}}>{connState==="connecting"?"...":"JOIN"}</button>
      </div>
    </div>
  );

  return (
    <div style={{background:"#0a0e18",border:"1px solid #1e2535",borderRadius:4,padding:"12px 14px",width:"100%",boxSizing:"border-box",display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:9,color:"#4a5568",letterSpacing:3}}>LOBBY CHAT</div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:9,color:"#68d391"}}>● {name}</span>
          <button onClick={leaveLobby} style={{background:"none",border:"none",color:"#4a5568",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:8}}>LEAVE</button>
        </div>
      </div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        <button style={{background:"#0d0f1a",border:"1px solid #1e2535",color:"#68d391",borderRadius:10,padding:"2px 8px",fontFamily:"Courier New,monospace",fontSize:9,cursor:"default"}}>● {name} (you)</button>
        {players.map(function(p,i){var isSel=dmTarget===p.name;return(
          <button key={i} onClick={function(){patchState({dmTarget:isSel?"":p.name});}}
            style={{background:isSel?"#4299e122":"#0d0f1a",border:"1px solid "+(isSel?"#4299e1":"#1e2535"),color:isSel?"#4299e1":"#a0adb8",borderRadius:10,padding:"2px 8px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9}}>
            ● {p.name}
          </button>
        );})}
        {players.length===0&&<span style={{fontSize:9,color:"#2a3550"}}>No one else online yet</span>}
      </div>
      <div ref={msgScrollRef} style={{overflowY:"auto",maxHeight:120,display:"flex",flexDirection:"column",gap:3,background:"#060810",borderRadius:3,padding:"6px 8px"}}>
        {messages.length===0&&<div style={{fontSize:9,color:"#2a3550"}}>No messages yet</div>}
        {messages.map(function(m,i){var isMine=m.from===name;return(
          <div key={i} style={{fontSize:9,color:m.isCode?"#f6e05e":m.to?"#b794f4":isMine?"#c8d0e0":"#718096",lineHeight:1.5}}>
            <span style={{color:isMine?"#4299e1":"#68d391",fontWeight:"bold"}}>{m.from}</span>
            {m.to&&<span style={{color:"#b794f4"}}> → {m.to}</span>}
            <span style={{color:"#2a3550"}}> · </span>{m.text}
          </div>
        );})}
      </div>
      <div style={{display:"flex",gap:4,flexDirection:"column"}}>
        {dmTarget&&<div style={{fontSize:8,color:"#b794f4",letterSpacing:1}}>DM → {dmTarget} <button onClick={function(){patchState({dmTarget:""}); }} style={{background:"none",border:"none",color:"#c53030",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9}}>✕</button></div>}
        <div style={{display:"flex",gap:4}}>
          <input value={msgInput} onChange={function(e){setMsgInput(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter"){sendMsg(msgInput,dmTarget);setMsgInput("");patchState({dmTarget:""});}}} placeholder={dmTarget?"Message "+dmTarget+"...":"Message everyone..."} style={{flex:1,background:"#0a0c14",border:"1px solid #2a3550",color:"#c8d0e0",borderRadius:3,padding:"5px 8px",fontFamily:"Courier New,monospace",fontSize:10,outline:"none"}}/>
          <button onClick={function(){sendMsg(msgInput,dmTarget);setMsgInput("");patchState({dmTarget:""}); }} style={{background:"#4299e122",border:"1px solid #4299e144",color:"#4299e1",borderRadius:3,padding:"5px 10px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9}}>SEND</button>
          {myRoomCode&&<button onClick={function(){sendCode(myRoomCode,dmTarget);}} style={{background:"#d69e2e22",border:"1px solid #d69e2e44",color:"#d69e2e",borderRadius:3,padding:"5px 8px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:8,letterSpacing:1}}>SEND CODE</button>}
        </div>
      </div>
    </div>
  );
}

function InGameChatPanel({ lobbyChat }) {
  var {chatState, patchState, sendMsg, sendCode} = lobbyChat;
  var {connState, name, players, messages, dmTarget} = chatState;
  var [open, setOpen] = React.useState(false);
  var [msgInput, setMsgInput] = React.useState("");
  var msgScrollRef = React.useRef(null);
  var [unread, setUnread] = React.useState(0);

  React.useEffect(function(){
    if(open){setUnread(0);}
  },[open]);

  React.useEffect(function(){
    if(!open&&messages.length>0){setUnread(function(n){return n+1;});}
    if(open&&msgScrollRef.current)msgScrollRef.current.scrollTop=msgScrollRef.current.scrollHeight;
  },[messages]);

  var connected = connState==="connected";
  var width = open ? 220 : 36;

  return (
    <div style={{width:width,flexShrink:0,background:"#0a0c12",borderRight:"1px solid #1e2535",display:"flex",flexDirection:"column",transition:"width 0.2s ease",overflow:"hidden",height:"100vh",position:"relative"}}>
      {/* Toggle button */}
      <button onClick={function(){setOpen(!open);if(!open)setUnread(0);}} style={{flexShrink:0,background:"none",border:"none",borderBottom:"1px solid #1e2535",color:connected?"#4299e1":"#4a5568",cursor:"pointer",padding:"10px 0",fontFamily:"Courier New,monospace",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",gap:4,position:"relative"}}>
        {open?"◀":"▶"}
        {!open&&<span style={{fontSize:8,writingMode:"vertical-rl",textOrientation:"mixed",color:"#4a5568",marginTop:4}}>CHAT</span>}
        {!open&&unread>0&&<div style={{position:"absolute",top:6,right:6,background:"#4299e1",borderRadius:"50%",width:14,height:14,fontSize:8,color:"#000",display:"flex",alignItems:"center",justifyContent:"center"}}>{unread>9?"9+":unread}</div>}
      </button>
      {open&&<div style={{display:"flex",flexDirection:"column",flex:1,minHeight:0,padding:"8px 8px 6px"}}>
        <div style={{fontSize:8,color:"#4a5568",letterSpacing:2,marginBottom:6}}>{connected?"● LOBBY CHAT":"NOT CONNECTED"}</div>
        {/* Players online */}
        <div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:6}}>
          {name&&<div style={{fontSize:8,color:"#68d391"}}>● {name} (you)</div>}
          {players.map(function(p,i){var isSel=dmTarget===p.name;return(
            <button key={i} onClick={function(){patchState({dmTarget:isSel?"":p.name});}}
              style={{background:isSel?"#4299e122":"none",border:"none",color:isSel?"#4299e1":"#718096",fontFamily:"Courier New,monospace",fontSize:8,textAlign:"left",cursor:"pointer",padding:"1px 0",borderRadius:2}}>
              ● {p.name}
            </button>
          );})}
          {connected&&players.length===0&&<div style={{fontSize:8,color:"#2a3550"}}>No others online</div>}
        </div>
        {/* Messages */}
        <div ref={msgScrollRef} style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:2,background:"#060810",borderRadius:3,padding:"4px 6px",marginBottom:6,minHeight:0}}>
          {messages.length===0&&<div style={{fontSize:8,color:"#2a3550"}}>No messages</div>}
          {messages.map(function(m,i){var isMine=m.from===name;return(
            <div key={i} style={{fontSize:8,color:m.isCode?"#f6e05e":m.to?"#b794f4":isMine?"#c8d0e0":"#718096",lineHeight:1.5,wordBreak:"break-word"}}>
              <span style={{color:isMine?"#4299e1":"#68d391",fontWeight:"bold"}}>{m.from}</span>
              {m.to&&<span style={{color:"#b794f4"}}>→{m.to}</span>}
              <span style={{color:"#2a3550"}}> </span>{m.text}
            </div>
          );})}
        </div>
        {/* DM indicator */}
        {dmTarget&&<div style={{fontSize:8,color:"#b794f4",marginBottom:3}}>→ {dmTarget} <button onClick={function(){patchState({dmTarget:""}); }} style={{background:"none",border:"none",color:"#c53030",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:8}}>✕</button></div>}
        {/* Input */}
        <div style={{display:"flex",gap:3}}>
          <input value={msgInput} onChange={function(e){setMsgInput(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter"&&msgInput.trim()){sendMsg(msgInput.trim(),dmTarget);setMsgInput("");patchState({dmTarget:""});}}} placeholder="..." style={{flex:1,background:"#0a0c14",border:"1px solid #2a3550",color:"#c8d0e0",borderRadius:3,padding:"3px 5px",fontFamily:"Courier New,monospace",fontSize:9,outline:"none",minWidth:0}}/>
          <button onClick={function(){if(msgInput.trim()){sendMsg(msgInput.trim(),dmTarget);setMsgInput("");patchState({dmTarget:""});}}} style={{background:"#4299e122",border:"1px solid #4299e144",color:"#4299e1",borderRadius:3,padding:"3px 6px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9}}>↑</button>
        </div>
      </div>}
    </div>
  );
}

function SpellBookSelect({current, onConfirm, onBack}) {
  var [book,setBook]=React.useState(current&&current.length?current:(loadSavedSpellBook()||[]));
  var [bookName,setBookName]=React.useState("My Spell Book");
  var [search,setSearch]=React.useState("");
  var [tab,setTab]=React.useState("all");
  var [savedBooks,setSavedBooks]=React.useState(function(){return loadAllSpellBooks();});
  var [renamingKey,setRenamingKey]=React.useState(null);
  var [renameVal,setRenameVal]=React.useState("");
  var RARITIES=["common","uncommon","rare"];
  var RARITY_COLOR={common:"#a0aec0",uncommon:"#63b3ed",rare:"#f6e05e"};
  var TAG_COLOR={units:"#68d391",tiles:"#f6ad55"};
  var counts={};book.forEach(function(s){counts[s.id]=(counts[s.id]||0)+1;});
  var total=book.length;
  var q=search.trim().toLowerCase();
  var filtered=ALL_SPELLS.filter(function(s){
    if(tab==="units"&&(s.target==="tile"||s.tag==="summon"))return false;
    if(tab==="tiles"&&s.target!=="tile")return false;
    if(tab==="summon"&&s.tag!=="summon")return false;
    if(tab!=="all"&&tab!=="units"&&tab!=="tiles"&&tab!=="summon"&&s.rarity!==tab)return false;
    if(q&&!s.name.toLowerCase().includes(q)&&!s.desc.toLowerCase().includes(q))return false;
    return true;
  });
  function addSpell(s){
    var cur=counts[s.id]||0;var max=SPELL_MAX_COPIES[s.rarity];
    if(cur>=max||total>=20)return;
    setBook(function(b){return[...b,{...s}];});
  }
  function removeSpell(s){
    setBook(function(b){var idx=b.findIndex(function(x){return x.id===s.id;});if(idx<0)return b;var n=b.slice();n.splice(idx,1);return n;});
  }
  function doRandom(){setBook(makeRandomSpellBook());}
  function doClear(){setBook([]);}
  function doSave(){
    if(!bookName.trim()||total<1)return;
    var all={...savedBooks,[bookName.trim()]:book};
    setSavedBooks(all);saveAllSpellBooks(all);saveSpellBook(book);
    addLog&&void 0; // no-op
  }
  function doLoad(key){
    setBook(savedBooks[key]||[]);setBookName(key);
  }
  function doDelete(key){
    var all={...savedBooks};delete all[key];
    setSavedBooks(all);saveAllSpellBooks(all);
  }
  function startRename(key){setRenamingKey(key);setRenameVal(key);}
  function commitRename(key){
    var nk=renameVal.trim();
    if(!nk||nk===key){setRenamingKey(null);return;}
    var all={...savedBooks,[nk]:savedBooks[key]};delete all[key];
    setSavedBooks(all);saveAllSpellBooks(all);
    if(bookName===key)setBookName(nk);
    setRenamingKey(null);
  }
  return (
    <div style={{minHeight:"100vh",background:"#0d0b08",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"Courier New,monospace",color:"#c8a96e",padding:"20px 12px",position:"relative",gap:10}}>
      <button onClick={onBack} style={{position:"absolute",top:16,left:16,background:"none",border:"1px solid #2a1e08",color:"#4a5568",borderRadius:3,padding:"5px 12px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9,letterSpacing:2}}>← BACK</button>
      <div style={{fontSize:9,color:"#4a3810",letterSpacing:5}}>BUILD YOUR SPELL BOOK</div>
      <div style={{fontSize:11,color:"#718096"}}>Choose 20 spells — common (max 4), uncommon (max 2), rare (max 1)</div>
      <div style={{width:"100%",maxWidth:960,display:"flex",gap:12,flex:1,minHeight:0}}>
        {/* Left: spell pool */}
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:6,minHeight:0}}>
          <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="search spells..." style={{background:"#0a0c14",border:"1px solid #2a3550",color:"#c8d0e0",borderRadius:3,padding:"5px 8px",fontFamily:"Courier New,monospace",fontSize:10,outline:"none",width:"100%",boxSizing:"border-box"}}/>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {[["all","ALL","#c8d0e0"],["units","UNITS","#68d391"],["tiles","TILES","#f6ad55"],["summon","SUMMON","#4ade80"],...RARITIES.map(function(r){return[r,r.toUpperCase(),RARITY_COLOR[r]];})].map(function(t){var key=t[0],label=t[1],col=t[2];return(
              <button key={key} onClick={function(){setTab(key);}} style={{background:tab===key?"#1e2535":"#0a0c14",border:"1px solid "+(tab===key?col+"88":"#1e2535"),color:tab===key?col:"#4a5568",borderRadius:2,padding:"3px 6px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:8,letterSpacing:1}}>{label}</button>
            );})}
          </div>
          <div style={{overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:3}}>
            {filtered.map(function(s){
              var cur=counts[s.id]||0;var max=SPELL_MAX_COPIES[s.rarity];var canAdd=cur<max&&total<20;
              var tagLabel=s.tag==="summon"?"summon":s.target==="tile"?"tile":"unit";
              var tagCol=s.tag==="summon"?"#4ade80":s.target==="tile"?"#f6ad55":"#68d391";
              return(
                <div key={s.id} style={{background:"#0d0f1a",borderRadius:3,padding:"5px 8px",borderLeft:"3px solid "+s.color,display:"flex",justifyContent:"space-between",alignItems:"center",opacity:canAdd?1:0.5}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:2,flexWrap:"wrap"}}>
                      <span style={{fontSize:10,fontWeight:"bold",color:s.color}}>{s.name}</span>
                      <span style={{fontSize:7,color:tagCol,background:tagCol+"18",borderRadius:2,padding:"1px 4px",border:"1px solid "+tagCol+"44"}}>{tagLabel}</span>
                      <span style={{fontSize:8,color:RARITY_COLOR[s.rarity]||"#a0aec0"}}>{s.rarity}</span>
                      <span style={{fontSize:8,color:"#d69e2e"}}>{s.cost}pt</span>
                      <span style={{fontSize:8,color:"#718096"}}>{s.target}</span>
                    </div>
                    <div style={{fontSize:8,color:"#6b7280",lineHeight:1.4}}>{s.desc}</div>
                    {cur>0&&<div style={{fontSize:8,color:s.color,marginTop:1}}>{cur}/{max} in book</div>}
                  </div>
                  <button onClick={function(){addSpell(s);}} disabled={!canAdd} style={{background:canAdd?s.color+"22":"#1e2535",border:"1px solid "+(canAdd?s.color+"55":"#2a3550"),color:canAdd?s.color:"#2a3550",borderRadius:2,padding:"3px 8px",cursor:canAdd?"pointer":"not-allowed",fontFamily:"Courier New,monospace",fontSize:10,flexShrink:0,marginLeft:8}}>+</button>
                </div>
              );
            })}
          </div>
        </div>
        {/* Centre: current book being edited */}
        <div style={{width:220,display:"flex",flexDirection:"column",gap:6,minHeight:0}}>
          <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
            <input value={bookName} onChange={function(e){setBookName(e.target.value);}} placeholder="Book name..." style={{flex:1,background:"#0a0c14",border:"1px solid #2a3550",color:"#c8d0e0",borderRadius:3,padding:"4px 7px",fontFamily:"Courier New,monospace",fontSize:10,outline:"none"}}/>
            <div style={{fontSize:11,color:total===20?"#4ade80":"#fb923c",fontWeight:"bold",flexShrink:0}}>{total}/20</div>
          </div>
          <div style={{overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:2}}>
            {book.length===0&&<div style={{fontSize:10,color:"#2a3550",padding:8}}>No spells added yet.</div>}
            {(function(){var grouped={};book.forEach(function(s){if(!grouped[s.id])grouped[s.id]={s:s,count:0};grouped[s.id].count++;});return Object.values(grouped);})().map(function(g,i){return(
              <div key={g.s.id+i} style={{background:"#0d0f1a",borderRadius:3,padding:"4px 6px",borderLeft:"3px solid "+g.s.color,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <span style={{fontSize:9,color:g.s.color,fontWeight:"bold"}}>{g.count>1?g.count+"x ":""}{g.s.name}</span>
                  <span style={{fontSize:8,color:"#4a5568",marginLeft:4}}>{g.s.cost}pt</span>
                </div>
                <button onClick={function(){removeSpell(g.s);}} style={{background:"none",border:"none",color:"#c53030",cursor:"pointer",fontSize:12,padding:"0 4px",lineHeight:1}}>×</button>
              </div>
            );})}
          </div>
          <div style={{display:"flex",gap:4,flexShrink:0}}>
            <button onClick={doRandom} style={{flex:1,background:"#0f1118",border:"1px solid #9f7aea55",color:"#9f7aea",borderRadius:3,padding:"7px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9,letterSpacing:1}}>RANDOM</button>
            <button onClick={doClear} style={{flex:1,background:"#0f1118",border:"1px solid #c5303055",color:"#c53030",borderRadius:3,padding:"7px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9,letterSpacing:1}}>CLEAR</button>
          </div>
          <button onClick={function(){doSave();}} disabled={total<1||!bookName.trim()} style={{background:total>0&&bookName.trim()?"#0a1808":"#0d0f1a",border:"1px solid "+(total>0&&bookName.trim()?"#68d39144":"#1e2535"),color:total>0&&bookName.trim()?"#68d391":"#2a3550",borderRadius:3,padding:"8px",cursor:total>0&&bookName.trim()?"pointer":"not-allowed",fontFamily:"Courier New,monospace",fontSize:10,letterSpacing:2,flexShrink:0}}>💾 SAVE BOOK</button>
          <button onClick={function(){if(total<1)return;onConfirm(book);}} disabled={total<1} style={{background:total>0?"#1a1208":"#0d0f1a",border:"1px solid "+(total>0?"#d69e2e44":"#1e2535"),color:total>0?"#d69e2e":"#2a3550",borderRadius:3,padding:"8px",cursor:total>0?"pointer":"not-allowed",fontFamily:"Courier New,monospace",fontSize:10,letterSpacing:2,flexShrink:0}}>USE THIS BOOK{total<20?" ("+total+"/20)":""}</button>
        </div>
        {/* Right: saved spell books */}
        <div style={{width:200,display:"flex",flexDirection:"column",gap:6,minHeight:0}}>
          <div style={{fontSize:9,color:"#4a5568",letterSpacing:3,flexShrink:0,borderBottom:"1px solid #1e2535",paddingBottom:4}}>SAVED BOOKS</div>
          <div style={{overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:4}}>
            {Object.keys(savedBooks).length===0&&<div style={{fontSize:9,color:"#2a3550",padding:"6px 0"}}>No saved books yet.</div>}
            {Object.keys(savedBooks).map(function(key){
              var bk=savedBooks[key];var isEditing=renamingKey===key;
              return(
                <div key={key} style={{background:"#0d0f1a",borderRadius:3,padding:"6px 8px",border:"1px solid #1e2535",display:"flex",flexDirection:"column",gap:4}}>
                  {isEditing?(
                    <div style={{display:"flex",gap:3}}>
                      <input value={renameVal} onChange={function(e){setRenameVal(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")commitRename(key);if(e.key==="Escape"){setRenamingKey(null);}}} autoFocus style={{flex:1,background:"#0a0c14",border:"1px solid #4299e155",color:"#c8d0e0",borderRadius:2,padding:"2px 5px",fontFamily:"Courier New,monospace",fontSize:9,outline:"none"}}/>
                      <button onClick={function(){commitRename(key);}} style={{background:"#4299e122",border:"none",color:"#4299e1",borderRadius:2,padding:"2px 6px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9}}>✓</button>
                    </div>
                  ):(
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:9,fontWeight:"bold",color:"#c8d0e0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:110}}>{key}</div>
                      <div style={{display:"flex",gap:2,flexShrink:0}}>
                        <button onClick={function(){startRename(key);}} title="Rename" style={{background:"none",border:"none",color:"#4a5568",cursor:"pointer",fontSize:10,padding:"0 2px"}}>✎</button>
                        <button onClick={function(){doDelete(key);}} title="Delete" style={{background:"none",border:"none",color:"#c53030",cursor:"pointer",fontSize:10,padding:"0 2px"}}>✕</button>
                      </div>
                    </div>
                  )}
                  <div style={{fontSize:8,color:"#4a5568"}}>{bk.length} spells</div>
                  <button onClick={function(){doLoad(key);}} style={{background:"#060e10",border:"1px solid #4299e133",color:"#4299e1",borderRadius:2,padding:"3px 6px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:8,letterSpacing:1}}>LOAD &amp; EDIT</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeckSelect({onConfirm, onBack}) {
  const [preview, setPreview] = React.useState(null);
  return (
    <div style={{minHeight:"100vh",background:"#0d0b08",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,fontFamily:"Courier New,monospace",color:"#c8a96e",padding:20,position:"relative"}}>
      <button onClick={onBack} style={{position:"absolute",top:16,left:16,background:"none",border:"1px solid #2a1e08",color:"#4a5568",borderRadius:3,padding:"5px 12px",cursor:"pointer",fontFamily:"Courier New,monospace",fontSize:9,letterSpacing:2}}>← BACK</button>
      <div style={{fontSize:9,color:"#4a3810",letterSpacing:5,marginBottom:4}}>CHOOSE YOUR BATTLE</div>
      <div style={{display:"flex",flexDirection:"column",gap:6,width:"100%",maxWidth:360}}>
        {THEME_DECKS.map(function(deck){return (
          <button key={deck.id} onClick={function(){setPreview(deck);}
} style={{background:"#110d06",border:"1px solid #2a1e08",borderLeft:"4px solid "+deck.color,color:"#c8a96e",borderRadius:3,padding:"12px 18px",cursor:"pointer",fontFamily:"inherit",fontSize:13,letterSpacing:2,textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>{deck.name}</span><span style={{color:deck.color,fontSize:12}}>→</span>
          </button>
        );})}
      </div>
      {preview && (
        <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div style={{background:"#0a0c14",border:"2px solid "+preview.color,borderRadius:6,padding:"28px 36px",maxWidth:480,width:"90%",fontFamily:"Courier New,monospace"}}>
            <div style={{fontSize:9,color:preview.color,letterSpacing:4,marginBottom:6}}>THE BATTLE</div>
            <div style={{fontSize:22,fontWeight:"bold",color:preview.color,marginBottom:16,letterSpacing:1}}>{preview.name}</div>
            <div style={{fontSize:15,color:"#a0adb8",lineHeight:1.9,whiteSpace:"pre-line",marginBottom:22,borderLeft:"3px solid "+preview.color+"55",paddingLeft:14,fontStyle:"italic"}}>{preview.lore}</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={function(){setPreview(null);}} style={{flex:1,background:"#0f1118",border:"1px solid #2a3550",color:"#718096",borderRadius:3,padding:"10px",cursor:"pointer",fontFamily:"inherit",fontSize:10,letterSpacing:2}}>BACK</button>
              <button onClick={function(){onConfirm(preview);}} style={{flex:2,background:preview.color+"18",border:"1px solid "+preview.color+"55",color:preview.color,borderRadius:3,padding:"10px",cursor:"pointer",fontFamily:"inherit",fontSize:11,letterSpacing:3,fontWeight:"bold"}}>ENTER THE BATTLE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
function Menu({ onStart, onSpellBook, onOnline }) {
  return (
    <div style={{minHeight:"100vh",background:"#0d0b08",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"'Courier New',monospace",color:"#c8a96e"}}>
      <div style={{fontSize:9,letterSpacing:6,color:"#4a3810"}}>⚔ THE ETERNAL CONFLICT ⚔</div>
      <h1 style={{fontSize:42,fontWeight:"bold",letterSpacing:6,margin:"0 0 6px",background:"linear-gradient(180deg,#fde68a,#d69e2e,#92400e)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>LORE OF BATTLE</h1>
      <div style={{display:"flex",flexDirection:"column",gap:6,width:340}}>
        {[["cpu","VS THE REALM"],["player","TWO PLAYERS"]].map(([id,label]) => (
          <button key={id} onClick={() => onStart(id)} style={{background:"#110d06",border:"1px solid #2a1e08",borderLeft:"3px solid #d69e2e",color:"#c8a96e",borderRadius:3,padding:"12px 20px",cursor:"pointer",fontFamily:"inherit",fontSize:12,letterSpacing:3,textAlign:"left"}}>
            {label}
          </button>
        ))}
        <button onClick={onOnline} style={{background:"#060e10",border:"1px solid #0e3040",borderLeft:"3px solid #4299e1",color:"#4299e1",borderRadius:3,padding:"12px 20px",cursor:"pointer",fontFamily:"inherit",fontSize:12,letterSpacing:3,textAlign:"left"}}>
          ⚡ ONLINE MULTIPLAYER
        </button>
        <button onClick={onSpellBook} style={{background:"#080610",border:"1px solid #2a1e40",borderLeft:"3px solid #9f7aea",color:"#9f7aea",borderRadius:3,padding:"12px 20px",cursor:"pointer",fontFamily:"inherit",fontSize:12,letterSpacing:3,textAlign:"left"}}>
          ✦ SPELL BOOK
        </button>
      </div>
    </div>
  );
}

// ─── Dice ─────────────────────────────────────────────────────────────────────
function DiceScreen({ vsMode, onDone }) {
  const [rolls, setRolls] = useState(null);
  const roll = () => {
    let r1 = Math.ceil(Math.random()*6), r2 = Math.ceil(Math.random()*6);
    while (r1===r2) { r1=Math.ceil(Math.random()*6); r2=Math.ceil(Math.random()*6); }
    setRolls({p1:r1,p2:r2});
  };
  const faces = ["","⚀","⚁","⚂","⚃","⚄","⚅"];
  const p1Wins = rolls && rolls.p1 > rolls.p2;
  return (
    <div style={{minHeight:"100vh",background:"#0d0b08",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:32,fontFamily:"'Courier New',monospace",color:"#c8a96e"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:9,color:"#4a3810",letterSpacing:5,marginBottom:4}}>⚔ WHO STRIKES FIRST ⚔</div>
      </div>
      <div style={{display:"flex",gap:56,alignItems:"center"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:10,color:"#4299e1",letterSpacing:3,marginBottom:10}}>YOU</div>
          <div style={{fontSize:72,color:rolls?"#4299e1":"#2a1e08"}}>{rolls?faces[rolls.p1]:"⚀"}</div>
          {rolls && <div style={{fontSize:22,fontWeight:"bold",color:"#4299e1",marginTop:6}}>{rolls.p1}</div>}
        </div>
        <div style={{fontSize:18,color:"#2a1e08"}}>VS</div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:10,color:"#fc8181",letterSpacing:3,marginBottom:10}}>{vsMode==="cpu"?"THE REALM":"PLAYER 2"}</div>
          <div style={{fontSize:72,color:rolls?"#fc8181":"#2a1e08"}}>{rolls?faces[rolls.p2]:"⚀"}</div>
          {rolls && <div style={{fontSize:22,fontWeight:"bold",color:"#fc8181",marginTop:6}}>{rolls.p2}</div>}
        </div>
      </div>
      {!rolls && <button onClick={roll} style={{background:"#1a1208",border:"1px solid #d69e2e44",color:"#d69e2e",borderRadius:3,padding:"11px 40px",cursor:"pointer",fontFamily:"inherit",fontSize:11,letterSpacing:3}}>⚄ ROLL THE DICE</button>}
      {rolls && (
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:14,fontWeight:"bold",color:"#d69e2e",letterSpacing:3,marginBottom:12}}>
            {p1Wins?"YOU GO FIRST":(vsMode==="cpu"?"THE REALM GOES FIRST":"PLAYER 2 GOES FIRST")}
          </div>
          <button onClick={() => onDone(p1Wins)} style={{background:"#1a1208",border:"1px solid #8b691444",color:"#d69e2e",borderRadius:3,padding:"10px 36px",cursor:"pointer",fontFamily:"inherit",fontSize:11,letterSpacing:3}}>
            ⚔ BEGIN →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Game Component ──────────────────────────────────────────────────────
function Game({ vsMode, p1First, onMenu, chosenDeck, chosenSpellBook, onlineConn, myOnlineRole, lobbyChat }) {
  var deck = chosenDeck || THEME_DECKS[0];
  var spellBook = (chosenSpellBook&&chosenSpellBook.length) ? chosenSpellBook : makeRandomSpellBook();
  var isOnline = vsMode==="online" && !!onlineConn;
  var myRole = isOnline ? (myOnlineRole||"p1") : null;
  // Board & units
  const [board, setBoard] = useState(initBoard);
  const [tileEffects, setTileEffects] = useState({}); // "r,c" -> {type,turnsLeft}

  // Player state
  const [p1Life, setP1Life] = useState(MAX_HP);
  const [p2Life, setP2Life] = useState(MAX_HP);
  const [p1Pts, setP1Pts] = useState(p1First ? 1 : 0);
  const [p2Pts, setP2Pts] = useState(p1First ? 0 : 1);
  const [p1MaxPts, setP1MaxPts] = useState(MAX_PTS);
  const [p2MaxPts, setP2MaxPts] = useState(MAX_PTS);
  const [p1Unlocked, setP1Unlocked] = useState(new Set([1,6]));
  const [p2Unlocked, setP2Unlocked] = useState(new Set([1,6]));
  const [p1Hand, setP1Hand] = useState([]);
  const [p2Hand, setP2Hand] = useState([]);

  // Turn state
  // phase: "p1" | "p2" | "event"
  const firstP = p1First ? "p1" : "p2";
  const secondP = p1First ? "p2" : "p1";
  const [phase, setPhase] = useState(firstP);
  const phaseRef = useRef(firstP);
  const [cycleNum, setCycleNum] = useState(1);
  const cycleRef = useRef(1);
  // Track if first player has gone this cycle
  const firstWentRef = useRef(false);

  // Event state
  const [eventDeck] = useState(function(){return shuffled((chosenDeck&&chosenDeck.events)||DECK_DWARVEN);});
  const eventIdxRef = useRef(0);
  const [activeEvent, setActiveEvent] = useState(null);
  const activeEventRef = useRef(null);
  const [eventCyclesLeft, setEventCyclesLeft] = useState(0);
  const eventCyclesRef = useRef(0);
  const [showEventPopup, setShowEventPopup] = useState(false);
  const popupCbRef = useRef(null);

  // UI state
  const [selected, setSelected] = useState(null); // {r,c,unitIdx}
  const [log, setLog] = useState([{msg:"Game started!",tag:"default"}]);
  const [winner, setWinner] = useState(null);
  // Check if life loss should trigger a win — only if king is outside encampment
  function checkLifeWin(loser, newLife, boardSnap) {
    if (newLife > 0) return;
    var kingSafe = isKingInEncampment(loser, boardSnap||board);
    if (!kingSafe) {
      setWinner(loser==="p1" ? "P2" : "P1");
      addLog("♛ "+(loser==="p1"?"P1":"P2")+"'s King is exposed — "+(loser==="p1"?"P2":"P1")+" wins!","death");
    } else {
      addLog("♛ "+(loser==="p1"?"P1":"P2")+"'s HP is 0 but King is in the encampment — destroy the King to win!","event");
    }
  }
  const [mergeMode, setMergeMode] = useState(false);
  const [spawnMode, setSpawnMode] = useState(null); // typeId
  const [spellMode, setSpellMode] = useState(null);
  const [castingSpell, setCastingSpell] = useState(null);
  const voidstepRef = useRef(null); // {r,c,unitIdx,unit} pending leap destination
  const [groundItems, setGroundItems] = useState({});
  const [lootPopup, setLootPopup] = useState(null);
  const [attacksUsedMap, setAttacksUsedMap] = useState({});
  const MULTI_ATTACK = {4:2, 5:2};

  var cp = phase==="p1"?"p1":"p2";
  var cpPts = cp==="p1"?p1Pts:p2Pts;
  var setCpPts = cp==="p1"?setP1Pts:setP2Pts;
  var isCpu = vsMode==="cpu"&&phase==="p2";
  // Online: block actions when it's not your turn
  var isMyTurn = !isOnline || (myRole===cp);
  var unlocked = cp==="p1"?p1Unlocked:p2Unlocked;
  var ev = activeEvent;
  var cpColor = cp==="p1"?"#4299e1":"#fc8181";
  const [tooltip, setTooltip] = useState(null);
  const [tileTip, setTileTip] = useState(null);
  const [btnTip, setBtnTip] = useState(null);
  const [onlineStatus, setOnlineStatus] = useState(isOnline?"connected":"");

  // ── Online sync ───────────────────────────────────────────────────────────
  var onlineSyncRef = useRef(null);
  onlineSyncRef.current = {board,tileEffects,p1Life,p2Life,p1Pts,p2Pts,p1MaxPts,p2MaxPts,p1Unlocked,p2Unlocked,p1Hand,p2Hand,phase,cycleNum,groundItems,winner,activeEvent,eventCyclesLeft};
  var onlineConnRef = useRef(onlineConn);
  onlineConnRef.current = onlineConn;

  function sendState(){
    var conn=onlineConnRef.current;
    if(!isOnline||!conn)return;
    try{
      var s=onlineSyncRef.current;
      var evSer=s.activeEvent?{id:s.activeEvent.id,name:s.activeEvent.name,desc:s.activeEvent.desc,lore:s.activeEvent.lore,color:s.activeEvent.color,cycles:s.activeEvent.cycles}:null;
      var gSer={};Object.keys(s.groundItems).forEach(function(k){gSer[k]=(s.groundItems[k]||[]).map(function(it){return {name:it.name,desc:it.desc,flavor:it.flavor,color:it.color,legendaryAbility:it.legendaryAbility||null};});});
      conn.send({type:"STATE",state:{
        board:s.board,tileEffects:s.tileEffects,
        p1Life:s.p1Life,p2Life:s.p2Life,
        p1Pts:s.p1Pts,p2Pts:s.p2Pts,
        p1MaxPts:s.p1MaxPts,p2MaxPts:s.p2MaxPts,
        p1Unlocked:[...s.p1Unlocked],p2Unlocked:[...s.p2Unlocked],
        p1Hand:s.p1Hand,p2Hand:s.p2Hand,
        phase:s.phase,cycleNum:s.cycleNum,
        groundItems:gSer,winner:s.winner,
        eventCyclesLeft:s.eventCyclesLeft,
        activeEvent:evSer,
      }});
    }catch(e){}
  }

  function sendOnline(msg){
    var conn=onlineConnRef.current;
    if(!isOnline||!conn)return;
    try{conn.send(msg);}catch(e){}
  }

  useEffect(function(){
    if(!isOnline||!onlineConn)return;
    function handleData(msg){
      if(!msg)return;
      if(msg.type==="STATE"){
        var s=msg.state;
        setBoard(s.board);
        setTileEffects(s.tileEffects||{});
        setP1Life(s.p1Life);setP2Life(s.p2Life);
        setP1Pts(s.p1Pts);setP2Pts(s.p2Pts);
        setP1MaxPts(s.p1MaxPts);setP2MaxPts(s.p2MaxPts);
        setP1Unlocked(new Set(s.p1Unlocked));setP2Unlocked(new Set(s.p2Unlocked));
        setP1Hand(s.p1Hand||[]);setP2Hand(s.p2Hand||[]);
        setPhase(function(prev){return s.phase==="event"?prev:s.phase;});
        if(s.phase!=="event"){phaseRef.current=s.phase;}
        setCycleNum(s.cycleNum);cycleRef.current=s.cycleNum;
        var allLoot=[...LOOT_COMMON,...LOOT_ELITE];
        var giRestored={};Object.keys(s.groundItems||{}).forEach(function(k){giRestored[k]=(s.groundItems[k]||[]).map(function(it){var tmpl=allLoot.find(function(l){return l.name===it.name;})||{apply:function(u){return u;}};return {...it,apply:tmpl.apply};});});
        setGroundItems(giRestored);
        if(s.winner)setWinner(s.winner);
        setEventCyclesLeft(s.eventCyclesLeft||0);
        if(s.activeEvent!=null){setActiveEvent(s.activeEvent);activeEventRef.current=s.activeEvent;}
        else if(s.activeEvent===null){setActiveEvent(null);activeEventRef.current=null;}
      }
      if(msg.type==="SHOW_EVENT_POPUP"){
        if(msg.ev){setActiveEvent(msg.ev);activeEventRef.current=msg.ev;}
        popupCbRef.current=function(){setShowEventPopup(false);};
        setShowEventPopup(true);
      }
      if(msg.type==="HIDE_EVENT_POPUP"){setShowEventPopup(false);}
      if(msg.type==="SHOW_LOOT_POPUP"){setLootPopup(msg.payload);}
      if(msg.type==="HIDE_LOOT_POPUP"){setLootPopup(null);}
      if(msg.type==="LOG"){suppressLogSyncRef.current=true;addLog(msg.msg,msg.tag);suppressLogSyncRef.current=false;}
      if(msg.type==="DISCONNECT"){setOnlineStatus("disconnected");addLog("Opponent disconnected.","death");}
    }
    function handleClose(){setOnlineStatus("disconnected");addLog("Opponent disconnected.","death");}
    function handleError(){setOnlineStatus("disconnected");addLog("Connection error.","death");}
    onlineConn.on("data",handleData);
    onlineConn.on("close",handleClose);
    onlineConn.on("error",handleError);
    return function(){
      try{onlineConn.off("data",handleData);}catch(e){}
      try{onlineConn.off("close",handleClose);}catch(e){}
      try{onlineConn.off("error",handleError);}catch(e){}
    };
  },[isOnline,onlineConn]);

  var suppressLogSyncRef = useRef(false);
  function addLog(msg, type) {
    var tag = type || (
      /destroyed|consumed|killed|dies|lost with/.test(msg) ? "death" :
      /blessed|healed|merges|unlocked|summoned|Drew|claimed|picks up/.test(msg) ? "buff" :
      /burn|frozen|cursed|deflects|takes \d/.test(msg) ? "debuff" :
      /pt\.|pts\.|cast \(|Draw costs|Retreat costs|Need \d|costs \d/.test(msg) ? "points" :
      /EVENT:|has ended|cycle|Cycle/.test(msg) ? "event" : "default"
    );
    setLog(function(prev){return [{msg:msg,tag:tag},...prev];});
    if(!suppressLogSyncRef.current) sendOnline({type:"LOG",msg:msg,tag:tag});
  }

  // ── Turn management ──────────────────────────────────────────────────────────
  // Send full state to peer after any phase change or turn end
  useEffect(function(){
    if(!isOnline)return;
    // Small delay to let all state setters flush
    var t=setTimeout(function(){sendState();},80);
    return function(){clearTimeout(t);};
  },[phase,cycleNum,winner]);

  // Also sync whenever pts or life change — ensures event bonuses reach the peer
  useEffect(function(){
    if(!isOnline)return;
    var t=setTimeout(function(){sendState();},60);
    return function(){clearTimeout(t);};
  },[p1Pts,p2Pts,p1Life,p2Life]);

  function endTurn() {
    // Clear moved flags for current player
    setBoard(prev => prev.map(row => row.map(cell =>
      cell.map(u => u.owner === cp ? {...u, moved:false} : u)
    )));

    const cur = phaseRef.current;

    if (cur === firstP) {
      // First player done → second player's turn
      firstWentRef.current = true;
      const newPts = Math.min(cycleRef.current, secondP==="p1"?p1MaxPts:p2MaxPts);
      untapPlayer(secondP);
      // Apply active event instant bonus to second player's turn allocation
      const evNow2 = activeEventRef.current;
      var spBonus=0;
      if (evNow2 && evNow2.instant) {
        const s2 = {pts1:0, pts2:0};
        evNow2.instant(s2);
        spBonus = secondP==="p1"?s2.pts1:s2.pts2;
      }
      if (secondP==="p1") setP1Pts(Math.max(0,newPts+spBonus)); else setP2Pts(Math.max(0,newPts+spBonus));
      phaseRef.current = secondP; setPhase(secondP);
      addLog(`⚔ ${secondP==="p1"?"Your":"Opponent's"} turn — ${newPts}pt.`);
    } else {
      // Second player done → event phase
      firstWentRef.current = false;
      phaseRef.current = "event"; setPhase("event");
      setTimeout(runEventPhase, 80);
    }
  }

  function untapPlayer(player) {
    setAttacksUsedMap({});
    setBoard(prev => prev.map(row => row.map(cell =>
      cell.map(u => {
        if (u.owner !== player && !(u.neutral)) return u;
        if (u.owner === player) {
          var next = {...u, sick:false, frozenAfterMove:false};
          // Tap cycle counter: decrement, only clear tapped when counter reaches 0
          if(u.tapCycles&&u.tapCycles>1){next.tapCycles=u.tapCycles-1;next.tapped=true;}
          else{next.tapped=false;next.tapCycles=0;}
          // Move cycle counter: decrement, only allow movement when counter reaches 0
          if(u.moveCycles&&u.moveCycles>1){next.moveCycles=u.moveCycles-1;next.moved=true;}
          else{next.moved=false;next.moveCycles=0;next.bonusAbilities=(u.bonusAbilities||[]).filter(function(a){return a!=="immovable_temp";});}
          return next;
        }
        return u;
      })
    )));
  }

  function runEventPhase() {
    // Neutral units act
    runNeutralAI();

    setTileEffects(function(prev){
      var next={};
      var expired=[];
      Object.entries(prev).forEach(function(kv){
        if(kv[1].turnsLeft>1)next[kv[0]]={...kv[1],turnsLeft:kv[1].turnsLeft-1};
        else expired.push(kv[0]);
      });
      if(expired.length)setTimeout(function(){expired.forEach(function(k){addLog("✦ Tile effect at "+k+" faded.");});},50);
      var fireTiles=Object.keys(next).filter(function(k){return next[k].type==="fire";});
      if(fireTiles.length)setTimeout(function(){
        setBoard(function(b){
          var n=cloneBoard(b);
          fireTiles.forEach(function(k){
            var pts2=k.split(",").map(Number);var ftr=pts2[0],ftc=pts2[1];
            var survivors=[];
            n[ftr][ftc].forEach(function(u){
              if(u.typeId===0){survivors.push(u);return;}
              var dmgd={...u,hp:u.hp-1};
              setTimeout(function(){addLog("🔥 "+UNITS[u.typeId].name+" burns at "+tileName(ftr,ftc)+" — 1 dmg!","debuff");},0);
              if(dmgd.hp>0)survivors.push(dmgd);
              else setTimeout(function(){addLog(UNITS[u.typeId].name+" consumed by fire!","death");},0);
            });
            n[ftr][ftc]=survivors;
          });
          return n;
        });
      },80);
      return next;
    });

    // Tick or draw event
    setTimeout(() => {
      const cur = activeEventRef.current;
      if (cur) {
        const left = eventCyclesRef.current - 1;
        if (left <= 0) {
          addLog('"'+cur.name+'" has ended.','event');
          var endedTileFx=cur.tileFx||null;
          if(endedTileFx){setTileEffects(function(prev){var nx={...prev};Object.keys(nx).forEach(function(k){if(nx[k].type===endedTileFx)delete nx[k];});return nx;});addLog("✦ "+endedTileFx+" tiles cleared.","default");}
          setActiveEvent(null); activeEventRef.current = null;
          setEventCyclesLeft(0); eventCyclesRef.current = 0;
          setP1MaxPts(MAX_PTS); setP2MaxPts(MAX_PTS);
          drawEvent();
          setTimeout(function(){sendState();},160);
        } else {
          setEventCyclesLeft(left); eventCyclesRef.current = left;
          addLog(`"${cur.name}" — ${left} cycle${left!==1?"s":""} remaining.`);
          startNextCycle();
        }
      } else {
        drawEvent();
      }
    }, 150);
  }

  function drawEvent() {
    if (eventIdxRef.current >= eventDeck.length) {
      addLog("Event deck exhausted.");
      startNextCycle(); return;
    }
    const ev = eventDeck[eventIdxRef.current++];
    activateEvent(ev);
  }

  function activateEvent(ev) {
    setActiveEvent(ev); activeEventRef.current = ev;
    const cycles = ev.cycles || 1;
    setEventCyclesLeft(cycles); eventCyclesRef.current = cycles;

    // Apply instant effects
    if (ev.instant) {
      const s = { pts1: 0, pts2: 0 };
      ev.instant(s);
      // Points are applied in startNextCycle after the popup is dismissed,
      // so they aren't overwritten by the cycle-number reset there.
      addLog(`💰 ${ev.name}: P1 ${s.pts1>=0?"+":""}${s.pts1}pt, P2 ${s.pts2>=0?"+":""}${s.pts2}pt`);
    }

    // Spawn neutral units
    if (ev.spawn) {
      const count = ev.spawn.count || 1;
      setBoard(prev => {
        let n = cloneBoard(prev);
        let spawned = 0;
        var bfTiles=[];
        for(var sr=1;sr<=5;sr++)for(var sc=0;sc<BOARD;sc++)bfTiles.push([sr,sc]);
        for(var si=bfTiles.length-1;si>0;si--){var sj=Math.floor(Math.random()*(si+1));var st=bfTiles[si];bfTiles[si]=bfTiles[sj];bfTiles[sj]=st;}
        for(var ti=0;ti<bfTiles.length&&spawned<count;ti++){
          var sr2=bfTiles[ti][0],sc2=bfTiles[ti][1];
          if(n[sr2][sc2].length<4&&!n[sr2][sc2].some(function(u){return u.neutral;})){
            var nu=makeUnit(ev.spawn.typeId,"neutral");
            nu.neutral=true;nu.label=ev.spawn.label;if(cycles>=4){nu.legendary=true;var legAbils=LEGENDARY_UNIT_ABILITIES[ev.spawn.label];if(legAbils){var tmp=nu;legAbils.forEach(function(a){tmp=addAbility(tmp,a);});nu=tmp;}}
            n[sr2][sc2].push(nu);
            spawned++;
            setTimeout(function(rr,cc,lbl){return function(){addLog("⚡ "+lbl+" spawns at "+tileName(rr,cc)+".","event");};}(sr2,sc2,nu.label),0);
          }
        }
        return n;
      });
    }

    // Tile effects
    if (ev.tileFx) {
      const newTiles = {};
      const used = new Set();
      let placed = 0;
      while (placed < 4) {
        const r = 2 + Math.floor(Math.random()*3);
        const c = Math.floor(Math.random()*BOARD);
        const k = `${r},${c}`;
        if (!used.has(k)) { used.add(k); newTiles[k] = {type:ev.tileFx, turnsLeft:cycles+1}; placed++; }
      }
      setTileEffects(prev => ({...prev, ...newTiles}));
    }

    // Push event
    if (ev.push) {
      setBoard(prev => {
        const n = cloneBoard(prev);
        for (let r=0;r<BOARD;r++) for (let c=0;c<BOARD;c++) {
          if (!n[r][c].length) continue;
          const top = n[r][c][n[r][c].length-1];
          if (top.typeId===0 || isImmovable(top)) continue;
          const nc = c<3?c+1:c>3?c-1:c;
          if (nc!==c && n[r][nc].length<4) { n[r][nc].push(n[r][c].pop()); }
        }
        return n;
      });
    }

    addLog(`⚡ EVENT: "${ev.name}" — ${ev.desc} [${cycles} cycle${cycles!==1?"s":""}]`);
    popupCbRef.current = startNextCycle;
    setShowEventPopup(true);
    var evSer={id:ev.id,name:ev.name,desc:ev.desc,lore:ev.lore,color:ev.color,cycles:ev.cycles};
    sendOnline({type:"SHOW_EVENT_POPUP",ev:evSer});
    // Sync board/tile state after event effects (spawn/push/tileFx) have applied
    setTimeout(function(){sendState();},120);
  }

  function startNextCycle() {
    setShowEventPopup(false);
    sendOnline({type:"HIDE_EVENT_POPUP"});
    const next = cycleRef.current + 1;
    cycleRef.current = next; setCycleNum(next);

    // Untap neutral units
    setBoard(prev => prev.map(row => row.map(cell =>
      cell.map(u => u.neutral ? {...u, tapped:false, moved:false} : u)
    )));

    // Start first player's turn
    untapPlayer(firstP);
    const pts = Math.min(next, firstP==="p1"?p1MaxPts:p2MaxPts);
    const secondPts = Math.min(next, firstP==="p1"?p2MaxPts:p1MaxPts);
    // Apply active event instant bonus for both players
    const evNow = activeEventRef.current;
    var bonus1=0, bonus2=0;
    if (evNow && evNow.instant) {
      const s = {pts1:0, pts2:0};
      evNow.instant(s);
      bonus1=s.pts1; bonus2=s.pts2;
      addLog("💰 "+evNow.name+" (ongoing): P1 "+(s.pts1>=0?"+":"")+s.pts1+"pt, P2 "+(s.pts2>=0?"+":"")+s.pts2+"pt","points");
    }
    setP1Pts(Math.max(0,(firstP==="p1"?pts:secondPts)+bonus1));
    setP2Pts(Math.max(0,(firstP==="p2"?pts:secondPts)+bonus2));
    phaseRef.current = firstP; setPhase(firstP);
    addLog(`⚔ ${firstP==="p1"?"Your":"Opponent's"} turn — ${pts}pt. (Cycle ${next})`);
    setTimeout(function(){sendState();},120);
  }

  // ── Neutral AI ───────────────────────────────────────────────────────────────
  function runNeutralAI() {
    setBoard(function(prev) {
      var n = cloneBoard(prev);
      for (var fr=0;fr<BOARD;fr++) for (var fc=0;fc<BOARD;fc++) {
        for (var i=n[fr][fc].length-1;i>=0;i--) {
          var u = n[fr][fc][i];
          if (!u||!u.neutral||u.tapped) continue;
          var best=null, bd=999;
          for (var tr=0;tr<BOARD;tr++) for (var tc=0;tc<BOARD;tc++) {
            if (n[tr][tc].some(function(x){return x.owner==="p1"||x.owner==="p2";})) {
              var d=Math.abs(tr-fr)+Math.abs(tc-fc);
              if (d<bd){bd=d;best={tr:tr,tc:tc};}
            }
          }
          if (!best){n[fr][fc][i]={...n[fr][fc][i],tapped:true};continue;}
          var attacked=false;
          outer: for (var atr=0;atr<BOARD;atr++) for (var atc=0;atc<BOARD;atc++) {
            var di=n[atr][atc].findIndex(function(x){return x.owner==="p1"||x.owner==="p2";});
            if (di<0) continue;
            if (!canAttack(u,fr,fc,atr,atc)) continue;
            var def=n[atr][atc][di];
            var dmg=Math.max(1,UNITS[u.typeId].atk+(u.atkBuff||0));
            n[atr][atc][di]={...def,hp:def.hp-dmg};
            if (n[atr][atc][di].hp<=0){
              if (def.typeId!==0){
                if(def.owner==="p1")setTimeout(function(){setP1Life(function(l){var nl=Math.max(0,l-1);checkLifeWin("p1",nl,null);return nl;});addLog("♛ P1 loses 1 HP — unit lost to neutral attack!","debuff");},0);
                else setTimeout(function(){setP2Life(function(l){var nl=Math.max(0,l-1);checkLifeWin("p2",nl,null);return nl;});addLog("♛ P2 loses 1 HP — unit lost to neutral attack!","debuff");},0);
              }
              n[atr][atc].splice(di,1);
            }
            attacked=true;
            break outer;
          }
          if (!attacked&&best) {
            var dr=Math.sign(best.tr-fr),dc2=Math.sign(best.tc-fc);
            var nr=Math.max(1,Math.min(5,fr+dr)),nc=Math.max(0,Math.min(BOARD-1,fc+dc2));
            if ((nr!==fr||nc!==fc)&&n[nr][nc].length<4) {
              var moving={...n[fr][fc].splice(i,1)[0],tapped:true};
              n[nr][nc].push(moving);
              continue;
            }
          }
          if (n[fr][fc][i]) n[fr][fc][i]={...n[fr][fc][i],tapped:true};
        }
      }
      return n;
    });
  }

  // ── CPU AI ───────────────────────────────────────────────────────────────────
  const cpuDoneRef = useRef(false);
  useEffect(() => {
    if (!isCpu || winner) return;
    cpuDoneRef.current = false;
    const t = setTimeout(() => {
      if (cpuDoneRef.current) return;
      cpuDoneRef.current = true;
      doCpuTurn();
    }, 900);
    return () => clearTimeout(t);
  }, [isCpu, winner]);

  function doCpuTurn() {
    setBoard(prev => {
      const n = cloneBoard(prev);
      const logs = [];

      // Attack pass
      for (let fr=0;fr<BOARD;fr++) for (let fc=0;fc<BOARD;fc++) {
        for (let ai=0;ai<n[fr][fc].length;ai++) {
          const att = n[fr][fc][ai];
          if (att.owner!=="p2"||att.tapped||att.sick) continue;
          let best=null, bestScore=-1;
          for (let tr=0;tr<BOARD;tr++) for (let tc=0;tc<BOARD;tc++) {
            const di = n[tr][tc].findIndex(x=>x.owner==="p1"||x.neutral);
            if (di<0) continue;
            const def = n[tr][tc][di];
            if (!canAttack(att,fr,fc,tr,tc)) continue;
            const isRanged = UNITS[att.typeId].abilities.includes("range");
            if (isRanged && UNITS[def.typeId].abilities.includes("armor") && !UNITS[att.typeId].abilities.includes("pierce")) continue;
            const dmg = UNITS[att.typeId].atk + (att.atkBuff||0);
            let score = def.typeId===0?1000:(def.neutral?50:20) + (def.hp<=dmg?100:dmg);
            if (score>bestScore) { bestScore=score; best={tr,tc,di}; }
          }
          if (!best) continue;
          const def = n[best.tr][best.tc][best.di];
          const dmg = UNITS[att.typeId].atk + (att.atkBuff||0);
          n[best.tr][best.tc][best.di] = {...def, hp:def.hp-dmg};
          if (n[best.tr][best.tc][best.di].hp<=0) {
            n[best.tr][best.tc].splice(best.di,1);
            logs.push(`CPU destroys ${UNITS[def.typeId].name}!`);
          } else {
            logs.push(`CPU deals ${dmg} to ${UNITS[def.typeId].name}.`);
          }
          n[fr][fc][ai] = {...att, tapped:true};
        }
      }

      // Move pass
      for (let fr=0;fr<BOARD;fr++) for (let fc=0;fc<BOARD;fc++) {
        for (let ai=0;ai<n[fr][fc].length;ai++) {
          const u = n[fr][fc][ai];
          if (u.owner!=="p2"||u.tapped||u.moved||u.sick||u.typeId===0) continue;
          let best=null,bd=99;
          for (let tr=0;tr<BOARD;tr++) for (let tc=0;tc<BOARD;tc++) {
            if (!n[tr][tc].some(x=>x.owner==="p1"||x.neutral)) continue;
            const d=Math.abs(tr-fr)+Math.abs(tc-fc);
            if(d<bd){bd=d;best={tr,tc};}
          }
          if (!best) continue;
          // Find best adjacent move
          let bm=null,bmDist=bd;
          for (let nr=0;nr<BOARD;nr++) for (let nc=0;nc<BOARD;nc++) {
            if (!canMove(u,fr,fc,nr,nc,{})) continue;
            if (n[nr][nc].length>=4) continue;
            const d=Math.abs(best.tr-nr)+Math.abs(best.tc-nc);
            if(d<bmDist){bmDist=d;bm={nr,nc};}
          }
          if (bm) {
            const moving={...n[fr][fc].splice(ai,1)[0],moved:true,tapped:true};
            n[bm.nr][bm.nc].push(moving);
            ai--;
          }
        }
      }

      // Spawn
      let pts = p2Pts;
      if (pts>=1) {
        for (let c=0;c<BOARD&&pts>=1;c++) {
          if (n[6][c].length===0) {
            n[6][c].push(makeUnit(1,"p2"));
            pts--;
            logs.push("CPU: Soldier summoned.");
            break;
          }
        }
      }

      setTimeout(() => {
        logs.forEach(m=>addLog(m));
        setP2Pts(pts);
        setTimeout(() => endTurnRef.current?.(), 400);
      }, 0);

      return n;
    });
  }

  const endTurnRef = useRef(null);
  endTurnRef.current = endTurn;

  // ── Click handlers ───────────────────────────────────────────────────────────
  function handleUnitClick(r, c, unitIdx) {
    if (winner || phase==="event") return;
    if (isOnline && !isMyTurn) { addLog("Wait for your turn."); return; }
    if (castingSpell) { resolveSpell(r,c,unitIdx); return; }
    const cell = board[r][c];
    const u = cell[unitIdx];
    if (!u) return;

    if (u.owner===cp && !u.neutral) {
      if (mergeMode) { setSelected({r,c,unitIdx}); setTimeout(function(){doMerge(r,c);},0); return; }
      if (spawnMode) { clearModes(); return; }
      setSelected({r,c,unitIdx});
      if (groundItems[r+","+c] && groundItems[r+","+c].length) {
        setTimeout(function(){pickUpGroundItem(r,c,u.id);},0);
      }
      return;
    }

    if (selected) {
      const selCell = board[selected.r][selected.c];
      var att = selCell[selected.unitIdx];
      if (!att||att.owner!==cp||att.neutral) att=selCell.find(function(x){return x.owner===cp&&!x.neutral;});
      if (!att||att.owner!==cp) { setSelected(null); return; }
      const realIdx = selCell.indexOf(att);
      const isRanged = UNITS[att.typeId].abilities.includes("range")||(att.bonusAbilities||[]).includes("range");
      const defHasArmor = UNITS[u.typeId].abilities.includes("armor")||(u.bonusAbilities||[]).includes("armor");
      const hasPierce = UNITS[att.typeId].abilities.includes("pierce")||(att.bonusAbilities||[]).includes("pierce");
      const defHasStealth = UNITS[u.typeId].abilities.includes("stealth")||(u.bonusAbilities||[]).includes("stealth");
      if (isRanged && defHasArmor && !hasPierce) {
        addLog(UNITS[u.typeId].name+" deflects ranged attack — Armor!"); setSelected(null); return;
      }
      if (isRanged && defHasStealth) {
        addLog(UNITS[u.typeId].name+" is in Stealth — cannot be targeted by ranged!"); setSelected(null); return;
      }
      if (!canAttack(att,selected.r,selected.c,r,c) && !canAttackTower(att,selected.r,selected.c,r,c,board)) { addLog("Out of attack range."); return; }
      const maxAtks = MULTI_ATTACK[att.typeId]||1;
      const usedByThis = attacksUsedMap[att.id]||0;
      if (att.tapped && usedByThis>=maxAtks) { addLog(UNITS[att.typeId].name+" already attacked this turn."); return; }
      setAttacksUsedMap(function(m){var n2={...m};n2[att.id]=(m[att.id]||0)+1;return n2;});
      doAttack(selected.r,selected.c,realIdx,r,c,unitIdx);
    }
  }

  function handleTileClick(r, c) {
    if (winner || phase==="event") return;
    if (isOnline && !isMyTurn) { addLog("Wait for your turn."); return; }
    if (castingSpell) { resolveSpell(r,c,null); return; }

    // Spawn mode
    if (spawnMode !== null) {
      const spawnRows = cp==="p1"?[0]:[6];
      if (!spawnRows.includes(r)) { addLog("Spawn in your back row."); return; }
      if (board[r][c].length>=4) { addLog("Tile full."); return; }
      const cost = UNITS[spawnMode].cost;
      if (cpPts < cost) { addLog(`Need ${cost}pt.`); return; }
      const u = makeUnit(spawnMode, cp);
      setBoard(prev => { const n=cloneBoard(prev); n[r][c].push(u); return n; });
      setCpPts(function(p){return p-cost;}); addLog(UNITS[spawnMode].name+" summoned at "+tileName(r,c)+".","buff");
      setSpawnMode(null); return;
    }

    if (!selected) return;
    const selCell = board[selected.r][selected.c];
    var att2 = selCell[selected.unitIdx];
    if (!att2||att2.owner!==cp||att2.neutral) att2=selCell.find(function(x){return x.owner===cp&&!x.neutral;});
    if (!att2||att2.owner!==cp) { setSelected(null); return; }
    const att = att2;
    const realAttIdx = selCell.indexOf(att);

    // Attack enemy on tile if in range
    const tileHasEnemy2 = board[r][c].some(function(u){return (u.owner!==cp||u.neutral)&&u.typeId!==0;});
    if (tileHasEnemy2 && (canAttack(att,selected.r,selected.c,r,c) || canAttackTower(att,selected.r,selected.c,r,c,board))) {
      const target = board[r][c].find(function(u){return (u.owner!==cp||u.neutral)&&u.typeId!==0;});
      const targetIdx = board[r][c].indexOf(target);
      if (target) {
        // Cavalier: block L-shape flank if target is in their encampment
        var fdr=Math.abs(r-selected.r),fdc=Math.abs(c-selected.c);
        var isFl=(fdr===1&&fdc===2)||(fdr===2&&fdc===1);
        var inEncamp=(target.owner==="p1"&&r===0)||(target.owner==="p2"&&r===BOARD-1);
        var hasFlankAbil2=(att.bonusAbilities||[]).includes("flank")||(UNITS[att.typeId]&&UNITS[att.typeId].abilities||[]).includes("flank");
        if((att.typeId===3||att.typeId===4||hasFlankAbil2)&&isFl&&inEncamp){addLog("Flank blocked — cannot use L-shape attack on a unit in its encampment.","debuff");return;}
        const isRanged2=UNITS[att.typeId].abilities.includes("range")||(att.bonusAbilities||[]).includes("range");
        const defArmor2=UNITS[target.typeId].abilities.includes("armor")||(target.bonusAbilities||[]).includes("armor");
        const pierce2=UNITS[att.typeId].abilities.includes("pierce")||(att.bonusAbilities||[]).includes("pierce");
        const defStealth=UNITS[target.typeId].abilities.includes("stealth")||(target.bonusAbilities||[]).includes("stealth");
        if (isRanged2&&defArmor2&&!pierce2){addLog(UNITS[target.typeId].name+" deflects ranged — Armor!");return;}
        if (isRanged2&&defStealth){addLog(UNITS[target.typeId].name+" is in Stealth — cannot be targeted by ranged!");return;}
        const mx2=MULTI_ATTACK[att.typeId]||1;
        const ud2=attacksUsedMap[att.id]||0;
        if (att.tapped&&ud2>=mx2){addLog(UNITS[att.typeId].name+" already attacked.");return;}
        setAttacksUsedMap(function(m){var n2={...m};n2[att.id]=(m[att.id]||0)+1;return n2;});
        doAttack(selected.r,selected.c,realAttIdx,r,c,targetIdx);
        return;
      }
    }

    // Move
    if (canMove(att, selected.r, selected.c, r, c, Object.fromEntries(Object.entries(tileEffects).filter(([,v])=>v.type==="blocked")))) {
      if (board[r][c].length>=4) { addLog("Tile full."); return; }
      const n = cloneBoard(board);
      const moving = n[selected.r][selected.c].splice(selected.unitIdx,1)[0];
      const u2 = {...moving, moved:true, tapped:true};
      // Lava damage
      var te2=tileEffects[r+","+c];
      if (te2&&te2.type==="fire") {
        addLog(UNITS[u2.typeId].name+" steps into fire at "+tileName(r,c)+" — 1 dmg!","debuff");
        u2.hp-=1;
        if(u2.hp<=0){addLog(UNITS[u2.typeId].name+" consumed by fire!","death");setBoard(n);setSelected(null);return;}
      }
      if (te2&&te2.type==="ice"){u2.frozenAfterMove=true;addLog(UNITS[u2.typeId].name+" frozen by ice at "+tileName(r,c)+"!","debuff");}
      n[r][c].push(u2);
      setBoard(n);
      var newUnitIdx = n[r][c].length-1;
      setSelected({r,c,unitIdx:newUnitIdx});
      addLog(UNITS[att.typeId].name+" moved to "+tileName(r,c)+".","default");
      // Auto-pickup ground item on destination tile
      if (groundItems[r+","+c] && groundItems[r+","+c].length) {
        setTimeout(function(){pickUpGroundItem(r,c,u2.id);},50);
      }
    } else {
      setSelected(null);
    }
  }

  const doAttackRef = useRef(false);
  function doAttack(fr,fc,ai,tr,tc,di) {
    if (doAttackRef.current) return;
    doAttackRef.current = true;
    // Use functional updater to always work from latest board state
    var attackResult = {defDied:false, attDied:false, dmg:0, counter:0, def:null, att:null};
    setBoard(function(prevBoard) {
    const n = cloneBoard(prevBoard);
    // Find attacker and defender by searching (indices may have shifted)
    var att = n[fr][fc][ai];
    if (!att||att.owner!==cp) att=n[fr][fc].find(function(x){return x.owner===cp&&!x.neutral;});
    var def = n[tr][tc][di];
    if (!def||(def.owner===cp&&!def.neutral)) def=n[tr][tc].find(function(x){return x.owner!==cp||x.neutral;});
    if (!att||!def) return prevBoard;
    var realAi=n[fr][fc].indexOf(att);
    var realDi=n[tr][tc].indexOf(def);
    ai=realAi; di=realDi;

    const ev = activeEventRef.current;
    const fx = ev?.effects||{};

    var attEncamp = (att.owner==="p1"&&fr===0)||(att.owner==="p2"&&fr===6)?1:0;
    const attAtk = UNITS[att.typeId].atk + (att.atkBuff||0) + (fx.atkBonus||0) + (fx.atkMalus||0) + (tileEffects[`${fr},${fc}`]?.type==="blessed"?1:tileEffects[`${fr},${fc}`]?.type==="cursed"?-1:0) + attEncamp;
    var defEncamp = (def.owner==="p1"&&tr===0)||(def.owner==="p2"&&tr===6)?1:0;
    const defAtk = UNITS[def.typeId].atk + (def.atkBuff||0) + (fx.atkBonus||0) + (fx.atkMalus||0) + (tileEffects[`${tr},${tc}`]?.type==="blessed"?1:tileEffects[`${tr},${tc}`]?.type==="cursed"?-1:0) + defEncamp;
    const isRanged = UNITS[att.typeId].abilities.includes("range") || (att.bonusAbilities||[]).includes("range");
    const counter = isRanged || att.voidstep ? 0 : Math.max(0,defAtk);
    const dmg = Math.max(0,attAtk);
    var encampHPBonus = defEncamp; // +1 effective HP while in encampment

    // Apply damage to defender
    n[tr][tc][di] = {...def, hp:def.hp-(Math.max(0,dmg-encampHPBonus))};
    const defDied = n[tr][tc][di].hp <= 0;
    if (defDied) n[tr][tc].splice(di,1);

    // Re-find attacker by ID after potential splice (same-tile splice shifts indices)
    ai = n[fr][fc].findIndex(function(x){return x.id===att.id;});

    // Counter damage to attacker
    if (counter > 0 && ai >= 0) {
      n[fr][fc][ai] = {...n[fr][fc][ai], hp:n[fr][fc][ai].hp-counter};
      if (n[fr][fc][ai].hp<=0) n[fr][fc].splice(ai,1);
    }
    var attDied = ai < 0 || (counter > 0 && !n[fr][fc][ai]);

    // Tap attacker — find by ID to avoid stale index issues
    var attIdxNow = n[fr][fc].findIndex(function(x){return x.id===att.id;});
    var dr2=Math.abs(tr-fr),dc3=Math.abs(tc-fc);
    var isFlank=(dr2===1&&dc3===2)||(dr2===2&&dc3===1);
    var targetEncamp=(def&&def.owner==="p1"&&tr===0)||(def&&def.owner==="p2"&&tr===BOARD-1);
    var hasFlankAbil=(att.bonusAbilities||[]).includes("flank")||(UNITS[att.typeId]&&UNITS[att.typeId].abilities||[]).includes("flank");
    if ((att.typeId===3||att.typeId===4||hasFlankAbil) && attIdxNow>=0 && !attDied && !isImmovable(att) && isFlank && !targetEncamp && n[tr][tc].length<4) {
      // Cavalier/General: L-shape flank — advance to target tile
      var cavUnit = n[fr][fc].splice(attIdxNow,1)[0];
      n[tr][tc].push({...cavUnit,moved:true,tapped:true,voidstep:false});
    } else if (attIdxNow>=0) {
      var cu=n[fr][fc][attIdxNow];
      // Fury Blow: attack twice — first hit keeps untapped, clears furyblow
      if(cu.furyblow){
        n[fr][fc][attIdxNow]={...cu,furyblow:false,tapped:false,voidstep:false};
        addLog("Fury Blow: "+UNITS[att.typeId].name+" may attack once more!","buff");
      // Onslaught: attack up to 3 times — decrement counter
      } else if(cu.onslaughtCount&&cu.onslaughtCount>1){
        n[fr][fc][attIdxNow]={...cu,onslaughtCount:cu.onslaughtCount-1,tapped:false,voidstep:false};
        addLog("Onslaught: "+UNITS[att.typeId].name+" has "+(cu.onslaughtCount-1)+" attack(s) remaining.","buff");
      } else {
        n[fr][fc][attIdxNow]={...cu,tapped:true,voidstep:false,onslaughtCount:0};
      }
    }

    // Loot drop BEFORE setBoard
    if (defDied && def.neutral) {
      // Check if this was an event-spawned unit and all of its kind are now gone
      if(def.label&&activeEventRef.current&&activeEventRef.current.spawn&&activeEventRef.current.spawn.label===def.label){
        setBoard(function(latest){
          var stillAlive=false;
          for(var er=0;er<BOARD&&!stillAlive;er++)for(var ec=0;ec<BOARD&&!stillAlive;ec++){
            if(latest[er][ec].some(function(u){return u.neutral&&u.label===def.label;}))stillAlive=true;
          }
          if(!stillAlive){
            addLog("⚡ All "+def.label+"s defeated — event ends early!","event");
            var earlyTileFx=activeEventRef.current&&activeEventRef.current.tileFx||null;
            setActiveEvent(null);activeEventRef.current=null;
            setEventCyclesLeft(0);eventCyclesRef.current=0;
            if(earlyTileFx){setTileEffects(function(prev){var nx={...prev};Object.keys(nx).forEach(function(k){if(nx[k].type===earlyTileFx)delete nx[k];});return nx;});}
          }
          return latest;
        });
      }
      var lootItem=rollLoot(def.typeId);
      var attOnSameTile = !attDied && fr===tr && fc===tc && n[tr][tc].findIndex(function(x){return x.id===att.id;})>=0;
      if (attOnSameTile) {
        var ai2=n[tr][tc].findIndex(function(x){return x.id===att.id;});
        n[tr][tc][ai2]=grantItem(n[tr][tc][ai2],lootItem);
        setTimeout(function(){
          var payload={item:{name:lootItem.name,desc:lootItem.desc,flavor:lootItem.flavor,color:lootItem.color,legendaryAbility:lootItem.legendaryAbility||null},unitName:UNITS[att.typeId].name};
          setLootPopup(payload);
          sendOnline({type:"SHOW_LOOT_POPUP",payload:payload});
        },0);
      } else {
        var dk=tr+","+tc;
        setGroundItems(function(prev){var gn={...prev};gn[dk]=[...(prev[dk]||[]),{name:lootItem.name,desc:lootItem.desc,flavor:lootItem.flavor,color:lootItem.color,apply:lootItem.apply}];return gn;});
        addLog("💀 "+lootItem.name+" dropped at "+tileName(tr,tc)+"!","death");
      }
    }

    var finalAttIdx=n[fr][fc].findIndex(function(x){return x.id===att.id;});
    attackResult={defDied:defDied,attDied:finalAttIdx<0,dmg:dmg,counter:counter,def:def,att:att};
    return n;
    }); // end setBoard

    // Post-attack effects (use attackResult captured above)
    // Give React a tick to commit board before reading
    setTimeout(function() {
    var defDied=attackResult.defDied,dmg=attackResult.dmg,counter=attackResult.counter;
    var def=attackResult.def,att=attackResult.att;
    if(!def||!att)return;

    addLog(UNITS[att.typeId].name+" at "+tileName(fr,fc)+" deals "+dmg+" to "+UNITS[def.typeId].name+" at "+tileName(tr,tc)+(counter>0?" (takes "+counter+" back)":"")+".","default");

    if (defDied && def.typeId!==0 && !def.neutral) {
      if (def.owner==="p1") { setP1Life(function(l){var nl=Math.max(0,l-1);checkLifeWin("p1",nl,null);return nl;}); addLog("♛ P1 loses 1 HP! (unit destroyed)","debuff"); }
      else { setP2Life(function(l){var nl=Math.max(0,l-1);checkLifeWin("p2",nl,null);return nl;}); addLog("♛ P2 loses 1 HP! (unit destroyed)","debuff"); }
      addLog(UNITS[def.typeId].name+" destroyed!","death");
    }
    if (defDied && def.typeId===0) {
      setWinner(cp==="p1"?"P1":"P2");
      addLog("★ King destroyed! "+(cp==="p1"?"YOU WIN!":"OPPONENT WINS!"),"death");
    }
    if (def.typeId===0 && !defDied) {
      if (def.owner==="p1") { setP1Life(function(l){var nl=Math.max(0,l-dmg);checkLifeWin("p1",nl,null);return nl;}); addLog("♛ P1 King takes "+dmg+" damage!","debuff"); }
      else { setP2Life(function(l){var nl=Math.max(0,l-dmg);checkLifeWin("p2",nl,null);return nl;}); addLog("♛ P2 King takes "+dmg+" damage!","debuff"); }
    }

    // Keep selected for multi-attack
    var maxAtksPost=MULTI_ATTACK[att.typeId]||1;
    var usedPost=(attacksUsedMap[att.id]||0);
    if (maxAtksPost>1&&usedPost<maxAtksPost) {
      addLog(UNITS[att.typeId].name+" can attack again ("+(maxAtksPost-usedPost)+" left).");
      setSelected({r:fr,c:fc,unitIdx:ai});
    } else {
      setSelected(null);
      clearModes();
    }
    doAttackRef.current = false;
    },0); // end setTimeout
  }

  function doMerge(mr, mc) {
    var r = mr!=null ? mr : (selected ? selected.r : null);
    var c = mc!=null ? mc : (selected ? selected.c : null);
    if (r==null||c==null) { addLog("Select a tile first."); return; }
    const cell = board[r][c];
    // Find mergeable type
    let bestType = null, bestCount = 0;
    for (const tid of [1,2,3,6,7,8]) {
      if (!UNITS[tid].mergeTo) continue;
      const req = MERGE_REQ[tid] || 2;
      const cnt = cell.filter(u=>u.owner===cp&&u.typeId===tid&&!u.tapped&&!u.sick).length;
      if (cnt>=req && cnt>bestCount) { bestType=tid; bestCount=cnt; }
    }
    if (!bestType) { addLog("Not enough units to merge here."); return; }
    const req = MERGE_REQ[bestType];
    const cost = MERGE_COST[bestType];
    if (cpPts<cost) { addLog(`Merge costs ${cost}pt.`); return; }
    const nextType = UNITS[bestType].mergeTo;
    const n = cloneBoard(board);
    let removed=0;
    var collectedItems=[];
    var collectedBonusAbilities=[];
    var collectedAtkBuff=0;
    var collectedMovBuff=0;
    n[r][c] = n[r][c].filter(u=>{
      if (removed<req&&u.owner===cp&&u.typeId===bestType&&!u.tapped&&!u.sick){
        removed++;
        if(u.items&&u.items.length)collectedItems=[...collectedItems,...u.items];
        if(u.bonusAbilities&&u.bonusAbilities.length)collectedBonusAbilities=[...collectedBonusAbilities,...u.bonusAbilities];
        collectedAtkBuff+=(u.atkBuff||0);
        collectedMovBuff+=(u.movBuff||0);
        return false;
      }
      return true;
    });
    var mergedU=makeUnit(nextType,cp);
    mergedU={...mergedU,tapped:true,hp:mergedU.maxHp,items:collectedItems,bonusAbilities:[...mergedU.bonusAbilities,...collectedBonusAbilities],atkBuff:collectedAtkBuff,movBuff:(mergedU.movBuff||0)+collectedMovBuff};
    n[r][c].push(mergedU);
    setBoard(n);
    setCpPts(p=>p-cost);
    if(cp==="p1") setP1Unlocked(s=>new Set([...s,nextType]));
    else setP2Unlocked(s=>new Set([...s,nextType]));
    addLog('✦ '+UNITS[bestType].name+'x'+req+' → '+UNITS[nextType].name+'! Unlocked.','buff');
    if(cp==='p1')setP1Unlocked(function(s){return new Set([...s,nextType]);});else setP2Unlocked(function(s){return new Set([...s,nextType]);});
    setSelected({r,c,unitIdx:n[r][c].length-1});
  }

  function clearModes() { setMergeMode(false); setSpawnMode(null); setSpellMode(null); setCastingSpell(null); voidstepRef.current=null; }

  function resolveSpell(r,c,unitIdx) {
    if (!castingSpell) return;
    const {id,cost} = castingSpell;

    // ── Voidstep destination pick ─────────────────────────────────────────────
    if(id==="voidstep_dest"){
      var vs=voidstepRef.current;
      if(!vs){setCastingSpell(null);setSpellMode(null);return;}
      var n2=cloneBoard(board);
      // Remove unit from source tile
      var srcIdx=n2[vs.r][vs.c].findIndex(function(x){return x.id===vs.unit.id;});
      if(srcIdx<0){addLog("Void Step failed — unit not found.");voidstepRef.current=null;setCastingSpell(null);setSpellMode(null);return;}
      var leapUnit=n2[vs.r][vs.c].splice(srcIdx,1)[0];
      // Place on destination (up to 4 units max, can't land on own King)
      if(n2[r][c].length>=4){addLog("Destination tile is full.");return;}
      n2[r][c].push({...leapUnit,moved:true,voidstep:true,tapped:false,sick:false});
      setBoard(n2);
      // Consume pts and remove from hand
      var origSpell=vs.spell;
      setCpPts(function(p){return p-origSpell.cost;});
      var setHand2=cp==="p1"?setP1Hand:setP2Hand;
      setHand2(function(h){return h.filter(function(x){return x!==origSpell;});});
      addLog("Void Step: "+UNITS[leapUnit.typeId].name+" leaps to "+tileName(r,c)+" — no counter damage this turn.","buff");
      voidstepRef.current=null;
      setCastingSpell(null);setSpellMode(null);
      return;
    }

    const n = cloneBoard(board);
    const cell = n[r][c];
    var ui = unitIdx!=null?unitIdx:(cell.length-1);
    var u = cell[ui];
    var handled = true;

    // Block spells from targeting opponent's encampment row or units there
    var oppEncampRow = cp==="p1" ? BOARD-1 : 0;
    if(r===oppEncampRow){addLog("Cannot target the opponent's encampment.","debuff");return;}
    // Also block targeting any unit that is in the opponent's encampment
    if(u && u.owner!==cp && u.neutral!==true){
      var uEncamp = u.owner==="p1" ? 0 : BOARD-1;
      if(r===uEncamp){addLog("Cannot target units in the opponent's encampment.","debuff");return;}
    }
    // Block spells targeting a unit with Stealth (enemy units only)
    if(u && u.owner!==cp && !u.neutral){
      var defStealth2=UNITS[u.typeId].abilities.includes("stealth")||(u.bonusAbilities||[]).includes("stealth");
      if(defStealth2){addLog(UNITS[u.typeId].name+" is in Stealth — cannot be targeted by spells!","debuff");return;}
    }

    // helper: apply damage to a unit, handle death
    function dmgUnit(row,col,idx,dmg){
      n[row][col][idx]={...n[row][col][idx],hp:n[row][col][idx].hp-dmg};
      if(n[row][col][idx].hp<=0){
        var dead=n[row][col][idx];
        n[row][col].splice(idx,1);
        addLog(UNITS[dead.typeId].name+" destroyed!","death");
        if(dead.neutral){var li=rollLoot(dead.typeId);setGroundItems(function(prev){var dk=row+","+col;var gn={...prev};gn[dk]=[...(prev[dk]||[]),{name:li.name,desc:li.desc,flavor:li.flavor,color:li.color,apply:li.apply}];return gn;});}
        if(!dead.neutral&&dead.typeId!==0){if(dead.owner==="p1"){setP1Life(function(l){var nl=Math.max(0,l-1);checkLifeWin("p1",nl,n);return nl;});addLog("♛ P1 loses 1 HP! (unit destroyed by spell)","debuff");}else{setP2Life(function(l){var nl=Math.max(0,l-1);checkLifeWin("p2",nl,n);return nl;});addLog("♛ P2 loses 1 HP! (unit destroyed by spell)","debuff");}}
        if(dead.typeId===0)setWinner(cp==="p1"?"P1":"P2");
        return true;
      }
      return false;
    }
    // helper: set tile effect
    function setTE(row,col,type,cycles){
      setTileEffects(function(prev){var k=row+","+col;return {...prev,[k]:{type:type,turnsLeft:cycles+1}};});
      if(type==="blocked"){
        // Destroy all units on the tile when a block is placed
        setBoard(function(prev){
          var nb=cloneBoard(prev);
          nb[row][col].forEach(function(dead){
            if(dead.typeId===0){setWinner(dead.owner==="p1"?"P2":"P1");return;}
            if(!dead.neutral&&dead.typeId!==0){
              if(dead.owner==="p1"){setP1Life(function(l){var nl=Math.max(0,l-1);checkLifeWin("p1",nl,nb);return nl;});}
              else{setP2Life(function(l){var nl=Math.max(0,l-1);checkLifeWin("p2",nl,nb);return nl;});}
            }
            addLog(UNITS[dead.typeId]?UNITS[dead.typeId].name:"Unit"+" crushed by blocked tile!","death");
          });
          nb[row][col]=[];
          return nb;
        });
      }
    }
    // helper: set tile effects in radius
    function setTERadius(row,col,radius,type,cycles){
      for(var dr=-radius;dr<=radius;dr++)for(var dc2=-radius;dc2<=radius;dc2++){
        var nr2=row+dr,nc2=col+dc2;
        if(nr2>=0&&nr2<BOARD&&nc2>=0&&nc2<BOARD)setTE(nr2,nc2,type,cycles);
      }
    }

    // ── Unit-targeting spells ─────────────────────────────────────────────────
    if(id==="warcry"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,atkBuff:(u.atkBuff||0)+2,spellFx:[...(u.spellFx||[]),"War Cry: +2 ATK"]};addLog("War Cry: +2 ATK to "+UNITS[u.typeId].name+".","buff");
    } else if(id==="battlesong"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,atkBuff:(u.atkBuff||0)+1,spellFx:[...(u.spellFx||[]),"Battle Song: +1 ATK"]};addLog("Battle Song: +1 ATK permanently to "+UNITS[u.typeId].name+".","buff");
    } else if(id==="sharpen"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,atkBuff:(u.atkBuff||0)+1,spellFx:[...(u.spellFx||[]),"Sharpen: +1 ATK"]};addLog("Sharpen: +1 ATK this turn.","buff");
    } else if(id==="furyblow"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,furyblow:true};addLog("Fury Blow: "+UNITS[u.typeId].name+" attacks twice this turn.","buff");
    } else if(id==="mend"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,hp:Math.min((u.maxHp||UNITS[u.typeId].hp),u.hp+2)};addLog("Mend: +2 HP to "+UNITS[u.typeId].name+".","buff");
    } else if(id==="fortify"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,hp:Math.min(u.hp+2+2,(u.maxHp||UNITS[u.typeId].hp)+2),maxHp:(u.maxHp||UNITS[u.typeId].hp)+2};addLog("Fortify: +2 max HP and healed.","buff");
    } else if(id==="ironhide"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,hp:u.hp+1,maxHp:(u.maxHp||UNITS[u.typeId].hp)+1};addLog("Iron Hide: +1 HP.","buff");
    } else if(id==="blaze"){
      if(!u||u.owner===cp&&!u.neutral){addLog("Select an enemy.");return;}
      var died=dmgUnit(r,c,ui,2);if(!died)addLog("Blaze Arrow: 2 dmg to "+UNITS[u.typeId].name+".","debuff");
    } else if(id==="weaken"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      n[r][c][ui]={...u,atkBuff:(u.atkBuff||0)-1};addLog("Weaken: -1 ATK to "+UNITS[u.typeId].name+".","debuff");
    } else if(id==="slowfoot"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      n[r][c][ui]={...u,moved:true,moveCycles:2};addLog("Slow Foot: "+UNITS[u.typeId].name+" cannot move for 1 cycle.","debuff");
    } else if(id==="fumble"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      n[r][c][ui]={...u,atkBuff:(u.atkBuff||0)-2};addLog("Fumble: -2 ATK to "+UNITS[u.typeId].name+".","debuff");
    } else if(id==="exhaust"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      n[r][c][ui]={...u,tapped:true,tapCycles:2};addLog("Exhaust: "+UNITS[u.typeId].name+" tapped for 1 cycle.","debuff");
    } else if(id==="rally"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,tapped:false,moved:false,sick:false};addLog("Rally: "+UNITS[u.typeId].name+" untapped.","buff");
    } else if(id==="haste"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,movBuff:(u.movBuff||0)+1,spellFx:[...(u.spellFx||[]),"Haste: +1 MOV"]};addLog("Haste: +1 movement this turn.","buff");
    } else if(id==="retreat"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      if(isImmovable(u)){addLog(UNITS[u.typeId].name+" is immovable — cannot be forced back.","debuff");return;}
      var nr=r+(cp==="p1"?1:-1);
      if(nr>=0&&nr<BOARD&&n[nr][c].length<4){n[nr][c].push({...n[r][c].splice(ui,1)[0]});addLog("Forced Retreat: enemy pushed back.","debuff");}
      else{addLog("Cannot retreat — tile blocked.");}
    } else if(id==="shield"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,shielded:true,spellFx:[...(u.spellFx||[]),"Shield Wall: blocks next hit"]};addLog("Shield Wall: "+UNITS[u.typeId].name+" shielded.","buff");
    } else if(id==="guardup"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var newU2=addAbility({...u},"armor");n[r][c][ui]={...newU2,spellFx:[...(u.spellFx||[]),"Guard Up: Armor"]};addLog("Guard Up: Armor granted this turn.","buff");
    } else if(id==="warcry2"){
      for(var rr=0;rr<BOARD;rr++)for(var cc2=0;cc2<BOARD;cc2++)n[rr][cc2]=n[rr][cc2].map(function(x){return x.owner===cp?{...x,atkBuff:(x.atkBuff||0)+1}:x;});
      addLog("War Howl: all friendly units +1 ATK.","buff");
    } else if(id==="bloodrite"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      if(u.hp<=3){addLog("Not enough HP for Blood Rite.");return;}
      n[r][c][ui]={...u,hp:u.hp-3,atkBuff:(u.atkBuff||0)+4};addLog("Blood Rite: -3 HP, +4 ATK.","buff");
    } else if(id==="berserker"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var ba3=(u.bonusAbilities||[]).filter(function(a){return a!=="armor";});n[r][c][ui]={...u,atkBuff:(u.atkBuff||0)+3,bonusAbilities:ba3};addLog("Berserker: +3 ATK, Armor removed.","buff");
    } else if(id==="snipe"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      var died2=dmgUnit(r,c,ui,3);if(!died2)addLog("Snipe: 3 damage (ignores Armor) to "+UNITS[u.typeId].name+".","debuff");
    } else if(id==="regenerate"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,hp:u.maxHp||UNITS[u.typeId].hp};addLog("Regenerate: fully healed "+UNITS[u.typeId].name+".","buff");
    } else if(id==="lifedrain"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      dmgUnit(r,c,ui,2);
      var own=null;for(var rr2=0;rr2<BOARD;rr2++)for(var cc3=0;cc3<BOARD;cc3++){var f=n[rr2][cc3].findIndex(function(x){return x.owner===cp&&x.typeId!==0;});if(f>=0){own={r:rr2,c:cc3,i:f};break;}if(own)break;}
      if(own){n[own.r][own.c][own.i]={...n[own.r][own.c][own.i],hp:Math.min((n[own.r][own.c][own.i].maxHp||UNITS[n[own.r][own.c][own.i].typeId].hp),n[own.r][own.c][own.i].hp+2)};}
      addLog("Life Drain: 2 dmg dealt, 2 HP restored to friendly.","debuff");
    } else if(id==="massexhaust"){
      n[r][c]=n[r][c].map(function(x){return (x.owner!==cp||x.neutral)?{...x,tapped:true,tapCycles:2}:x;});addLog("Mass Exhaust: all enemies on tile tapped for 1 cycle.","debuff");
    } else if(id==="inspire"){
      n[r][c]=n[r][c].map(function(x){return x.owner===cp?{...x,tapped:false,moved:false,sick:false}:x;});addLog("Inspire: all friendly units on tile untapped.","buff");
    } else if(id==="teleport"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      if(isImmovable(u)){addLog(UNITS[u.typeId].name+" is immovable — cannot be teleported.","debuff");return;}
      // mark unit for teleport — handled as two-step; simplified: teleport to clicked empty tile
      addLog("Teleport: "+UNITS[u.typeId].name+" teleported.","buff");
    } else if(id==="shove"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      if(isImmovable(u)){addLog(UNITS[u.typeId].name+" is immovable — cannot be shoved.","debuff");return;}
      var sr=r+(cp==="p1"?1:-1);if(sr>=0&&sr<BOARD&&n[sr][c].length<4){n[sr][c].push({...n[r][c].splice(ui,1)[0]});addLog("Shove: enemy pushed 1 tile.","debuff");}
      else{var sc2=c+1<BOARD&&n[r][c+1].length<4?c+1:c-1>=0&&n[r][c-1].length<4?c-1:-1;if(sc2>=0){n[r][sc2].push({...n[r][c].splice(ui,1)[0]});addLog("Shove: enemy pushed sideways.","debuff");}else addLog("No room to shove.");}
    } else if(id==="rootstrike"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      var newU4=addAbility({...u},"immovable_temp");n[r][c][ui]={...newU4,moved:true,moveCycles:2};addLog("Root Strike: "+UNITS[u.typeId].name+" immovable for 1 cycle.","debuff");
    } else if(id==="marksman"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var newU5=addAbility({...u},"range");n[r][c][ui]={...newU5,spellFx:[...(u.spellFx||[]),"Marksman: Range"]};addLog("Marksman: Range granted this turn.","buff");
    } else if(id==="blindshot"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      var ba6=(u.bonusAbilities||[]).filter(function(a){return a!=="range";});n[r][c][ui]={...u,bonusAbilities:ba6};addLog("Blind Shot: Range removed from "+UNITS[u.typeId].name+".","debuff");
    } else if(id==="stonewarden"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var newU7=addAbility({...u,hp:u.hp+2,maxHp:(u.maxHp||UNITS[u.typeId].hp)+2},"armor");n[r][c][ui]={...newU7,spellFx:[...(u.spellFx||[]),"Stone Warden: Armor +2HP"]};addLog("Stone Warden: Armor and +2 HP.","buff");
    } else if(id==="piercearmor"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var newU8=addAbility({...u},"pierce");n[r][c][ui]={...newU8,spellFx:[...(u.spellFx||[]),"Pierce Armor: Pierce"]};addLog("Pierce Armor: Pierce granted this turn.","buff");
    } else if(id==="deathstrike"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      if(u.typeId===0){addLog("Cannot target King.");return;}
      dmgUnit(r,c,ui,9999);addLog("Death Strike: instant kill.","death");
    } else if(id==="warlordscall"){
      for(var rr3=0;rr3<BOARD;rr3++)for(var cc4=0;cc4<BOARD;cc4++)n[rr3][cc4]=n[rr3][cc4].map(function(x){return x.owner===cp?{...x,atkBuff:(x.atkBuff||0)+2,tapped:false,moved:false,sick:false}:x;});
      addLog("Warlord's Call: all friendly units +2 ATK, untapped.","buff");
    } else if(id==="onslaught"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      n[r][c][ui]={...u,onslaughtCount:3};addLog("Onslaught: "+UNITS[u.typeId].name+" may attack 3 times this turn.","buff");
    } else if(id==="venomstrike"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      var died3=dmgUnit(r,c,ui,4);if(!died3)n[r][c][ui]={...n[r][c][ui],atkBuff:(n[r][c][ui].atkBuff||0)-2};addLog("Venom Strike: 4 dmg, -2 ATK.","debuff");
    } else if(id==="bloodpact"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var newHp=Math.max(1,Math.floor(u.hp/2));n[r][c][ui]={...u,hp:newHp,atkBuff:(u.atkBuff||0)+UNITS[u.typeId].atk+(u.atkBuff||0)};addLog("Blood Pact: HP halved, ATK doubled.","buff");
    } else if(id==="dominion"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      n[r][c][ui]={...u,owner:cp,dominion:true};addLog("Dominion: "+UNITS[u.typeId].name+" under your control this turn.","buff");
    } else if(id==="paralyze"){
      for(var rr4=0;rr4<BOARD;rr4++)for(var cc5=0;cc5<BOARD;cc5++)n[rr4][cc5]=n[rr4][cc5].map(function(x){return x.owner!==cp?{...x,tapped:true,tapCycles:2}:x;});
      addLog("Paralyze: all enemy units tapped for 1 cycle.","debuff");
    } else if(id==="massrally"){
      for(var rr5=0;rr5<BOARD;rr5++)for(var cc6=0;cc6<BOARD;cc6++)n[rr5][cc6]=n[rr5][cc6].map(function(x){return x.owner===cp?{...x,tapped:false,moved:false,sick:false}:x;});
      addLog("Mass Rally: all friendly units untapped.","buff");
    } else if(id==="voidstep"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      if(isImmovable(u)){addLog(UNITS[u.typeId].name+" is immovable — cannot use Void Step.","debuff");return;}
      // Store unit info, switch to destination-picking phase
      voidstepRef.current={r:r,c:c,unitIdx:ui,unit:u,cost:cost,spell:castingSpell};
      addLog("Void Step: choose a destination tile for "+UNITS[u.typeId].name+".","buff");
      // Don't consume pts/hand yet — wait for destination click
      setCastingSpell({...castingSpell,id:"voidstep_dest",target:"tile"});
      setSpellMode("voidstep_dest");
      return; // skip the normal resolveSpell finalization below
    } else if(id==="eagleeye"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var newU9=addAbility(addAbility({...u},"range"),"pierce");n[r][c][ui]=newU9;addLog("Eagle Eye: Range and Pierce granted permanently.","buff");
    } else if(id==="blindfield"){
      for(var rr6=0;rr6<BOARD;rr6++)for(var cc7=0;cc7<BOARD;cc7++)n[rr6][cc7]=n[rr6][cc7].map(function(x){if(x.owner!==cp&&(UNITS[x.typeId].abilities.includes("range")||(x.bonusAbilities||[]).includes("range"))){var nba=(x.bonusAbilities||[]).filter(function(a){return a!=="range";});return {...x,bonusAbilities:nba,blindfield:2};}return x;});
      addLog("Blind Field: all enemy ranged units lose Range for 2 turns.","debuff");
    } else if(id==="calltroops"){
      var nearRow=cp==="p1"?1:BOARD-2;
      var freeSlots=[];for(var cc8=0;cc8<BOARD;cc8++){if(n[nearRow][cc8].length<4)freeSlots.push(cc8);}
      if(freeSlots.length<2){addLog("Call to Arms: not enough space on your nearest battlefield row — cannot cast.","debuff");return;}
      freeSlots.slice(0,2).forEach(function(c2){n[nearRow][c2].push(makeUnit(1,cp));});
      addLog("Call to Arms: 2 Soldiers summoned to row "+(nearRow+1)+".","buff");
    } else if(id==="phantom"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var placed2=false;var dirs2=[[0,1],[0,-1],[1,0],[-1,0]];
      var hasAdj2=dirs2.some(function(d){var pr=r+d[0],pc=c+d[1];return pr>=0&&pr<BOARD&&pc>=0&&pc<BOARD&&n[pr][pc].length<4;});
      if(!hasAdj2){addLog("Phantom Guard: no adjacent space — cannot cast.","debuff");return;}
      for(var d2=0;d2<dirs2.length&&!placed2;d2++){var pr=r+dirs2[d2][0],pc=c+dirs2[d2][1];if(pr>=0&&pr<BOARD&&pc>=0&&pc<BOARD&&n[pr][pc].length<4){var ph=makeUnit(1,cp);ph.hp=1;ph.maxHp=1;ph.shielded=true;n[pr][pc].push(ph);placed2=true;}}
      addLog(placed2?"Phantom Guard: shield soldier summoned.":"No adjacent tile available.","buff");
    } else if(id==="conscript"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var dirs3=[[0,1],[0,-1],[1,0],[-1,0]];
      var hasAdj3=dirs3.some(function(d){var p3r=r+d[0],p3c=c+d[1];return p3r>=0&&p3r<BOARD&&p3c>=0&&p3c<BOARD&&n[p3r][p3c].length<4;});
      if(!hasAdj3){addLog("Conscript: no adjacent space — cannot cast.","debuff");return;}
      var placed3=false;for(var d3=0;d3<dirs3.length&&!placed3;d3++){var pr3=r+dirs3[d3][0],pc3=c+dirs3[d3][1];if(pr3>=0&&pr3<BOARD&&pc3>=0&&pc3<BOARD&&n[pr3][pc3].length<4){n[pr3][pc3].push(makeUnit(1,cp));placed3=true;}}
      addLog(placed3?"Conscript: Soldier summoned adjacent.":"No adjacent space available.","buff");
    } else if(id==="bfsurge"){
      if(n[r][c].length>=4){addLog("Battlefield Surge: tile is full — cannot cast.","debuff");return;}
      if(r===0||r===BOARD-1){addLog("Battlefield Surge: cannot summon to an encampment row.","debuff");return;}
      n[r][c].push(makeUnit(1,cp));
      addLog("Battlefield Surge: Soldier summoned at "+tileName(r,c)+".","buff");
    } else if(id==="dblenlist"){
      var nr2=cp==="p1"?1:BOARD-2;
      var freeS2=[];for(var bc2=0;bc2<BOARD;bc2++){if(n[nr2][bc2].length<4)freeS2.push(bc2);}
      if(freeS2.length<2){addLog("Double Enlist: not enough space — cannot cast.","debuff");return;}
      freeS2.slice(0,2).forEach(function(c2){n[nr2][c2].push(makeUnit(1,cp));});
      addLog("Double Enlist: 2 Soldiers summoned to row "+(nr2+1)+".","buff");
    } else if(id==="flankguard"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var dirs5=[[0,1],[0,-1],[1,0],[-1,0]];
      var hasAdj5=dirs5.some(function(d){var p5r=r+d[0],p5c=c+d[1];return p5r>=0&&p5r<BOARD&&p5c>=0&&p5c<BOARD&&n[p5r][p5c].length<4;});
      if(!hasAdj5){addLog("Flank Guard: no adjacent space — cannot cast.","debuff");return;}
      var placed5=false;for(var d5=0;d5<dirs5.length&&!placed5;d5++){var pr5=r+dirs5[d5][0],pc5=c+dirs5[d5][1];if(pr5>=0&&pr5<BOARD&&pc5>=0&&pc5<BOARD&&n[pr5][pc5].length<4){n[pr5][pc5].push(makeUnit(6,cp));placed5=true;}}
      addLog(placed5?"Flank Guard: Archer summoned adjacent.":"No adjacent space.","buff");
    } else if(id==="knightsvow"){
      var nr3=cp==="p1"?1:BOARD-2;
      var freeS3=[];for(var bc3=0;bc3<BOARD;bc3++){if(n[nr3][bc3].length<4)freeS3.push(bc3);}
      if(freeS3.length<1){addLog("Knight's Vow: no space on nearest battlefield row — cannot cast.","debuff");return;}
      n[nr3][freeS3[0]].push(makeUnit(2,cp));
      addLog("Knight's Vow: Knight summoned to row "+(nr3+1)+".","buff");
    } else if(id==="xbwcompany"){
      var nr4=cp==="p1"?1:BOARD-2;
      var freeS4=[];for(var bc4=0;bc4<BOARD;bc4++){if(n[nr4][bc4].length<4)freeS4.push(bc4);}
      if(freeS4.length<2){addLog("Crossbow Company: not enough space — cannot cast.","debuff");return;}
      freeS4.slice(0,2).forEach(function(c2){n[nr4][c2].push(makeUnit(7,cp));});
      addLog("Crossbow Company: 2 Crossbowmen summoned to row "+(nr4+1)+".","buff");
    } else if(id==="ironlegion"){
      if(n[r][c].length>=4){addLog("Iron Legion: tile is full — cannot cast.","debuff");return;}
      var fill=4-n[r][c].length;for(var fi=0;fi<fill;fi++){n[r][c].push(makeUnit(1,cp));}
      addLog("Iron Legion: "+(fill)+" Soldiers fill the tile at "+tileName(r,c)+".","buff");
    } else if(id==="advanceguard"){
      var nr5=cp==="p1"?1:BOARD-2;
      var freeS5=[];for(var fc2=0;fc2<BOARD;fc2++){if(n[nr5][fc2].length<4)freeS5.push(fc2);}
      if(freeS5.length<1){addLog("Advance Guard: no space on nearest battlefield row — cannot cast.","debuff");return;}
      var toPlace=Math.min(3,freeS5.length);freeS5.slice(0,toPlace).forEach(function(c2){n[nr5][c2].push(makeUnit(1,cp));});
      addLog("Advance Guard: "+toPlace+" Soldiers placed on row "+(nr5+1)+".","buff");
    } else if(id==="stormlines"){
      if(!u||u.owner===cp){addLog("Select an enemy.");return;}
      var dirs10=[[0,1],[0,-1],[1,0],[-1,0]];
      var adjFree=dirs10.filter(function(d){var p10r=r+d[0],p10c=c+d[1];return p10r>=0&&p10r<BOARD&&p10c>=0&&p10c<BOARD&&n[p10r][p10c].length<4;});
      if(adjFree.length<2){addLog("Storm the Lines: not enough adjacent space — cannot cast.","debuff");return;}
      var pl10=0;adjFree.slice(0,2).forEach(function(d){var su=makeUnit(1,cp);su.sick=false;n[r+d[0]][c+d[1]].push(su);pl10++;});
      addLog("Storm the Lines: "+pl10+" Soldiers summoned adjacent to enemy.","buff");
    } else if(id==="grantflank"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var newUF=addAbility({...u},"flank");n[r][c][ui]={...newUF,spellFx:[...(u.spellFx||[]),"Flanking Strike: Flank"]};addLog("Flanking Strike: "+UNITS[u.typeId].name+" gains the Flank ability.","buff");
    } else if(id==="shadowveil"){
      if(!u||u.owner!==cp){addLog("Select your unit.");return;}
      var newUS=addAbility({...u},"stealth");n[r][c][ui]={...newUS,spellFx:[...(u.spellFx||[]),"Shadow Veil: Stealth"]};addLog("Shadow Veil: "+UNITS[u.typeId].name+" enters Stealth.","buff");
      if(n[r][c].length>=4){addLog("War Engine: tile is full — cannot cast.","debuff");return;}
      n[r][c].push(makeUnit(3,cp));
      addLog("War Engine: Cavalier summoned at "+tileName(r,c)+".","buff");
    } else if(id==="fortresswall"){
      for(var rr7=0;rr7<BOARD;rr7++)for(var cc9=0;cc9<BOARD;cc9++)n[rr7][cc9]=n[rr7][cc9].map(function(x){if(x.owner!==cp)return x;return {...addAbility({...x,hp:x.hp+2,maxHp:(x.maxHp||UNITS[x.typeId].hp)+2,shielded:true},"armor")};});
      addLog("Fortress Wall: all friendly units gain Armor, +2 HP, Shield.","buff");
    } else if(id==="resurrection"){
      // no unit target needed — log only (full implementation would track destroyed units)
      addLog("Resurrection: no destroyed unit to revive.","buff");
    } else {
      // Tile-only spells fall through here — handled below
      handled = false;
    }

    // ── Tile-targeting spells ─────────────────────────────────────────────────
    if(id==="brushfire"){setTE(r,c,"fire",2);addLog("Brush Fire: tile set ablaze.","debuff");handled=true;}
    else if(id==="bless"){setTE(r,c,"blessed",2);addLog("Bless Ground: tile blessed.","buff");handled=true;}
    else if(id==="frostpatch"){setTE(r,c,"ice",2);addLog("Frost Patch: tile frozen.","debuff");handled=true;}
    else if(id==="inferno"){setTE(r,c,"fire",3);var adj=[[0,1],[0,-1],[1,0],[-1,0]];adj.forEach(function(d){var nr3=r+d[0],nc3=c+d[1];if(nr3>=0&&nr3<BOARD&&nc3>=0&&nc3<BOARD)setTE(nr3,nc3,"fire",3);});addLog("Inferno: tile and neighbours ablaze.","debuff");handled=true;}
    else if(id==="blizzard"){setTE(r,c,"ice",3);var adj2=[[0,1],[0,-1],[1,0],[-1,0]];adj2.forEach(function(d){var nr4=r+d[0],nc4=c+d[1];if(nr4>=0&&nr4<BOARD&&nc4>=0&&nc4<BOARD)setTE(nr4,nc4,"ice",3);});addLog("Blizzard: tile and neighbours frozen.","debuff");handled=true;}
    else if(id==="hexground"){setTE(r,c,"cursed",3);addLog("Hex Ground: tile cursed.","debuff");handled=true;}
    else if(id==="clearground"){setTileEffects(function(prev){var k=r+","+c;var nx={...prev};delete nx[k];return nx;});addLog("Clear Ground: tile effect removed.","buff");handled=true;}
    else if(id==="armageddon"){setTERadius(r,c,2,"fire",3);addLog("Armageddon: area set ablaze.","debuff");handled=true;}
    else if(id==="deepfreeze"){setTERadius(r,c,2,"ice",3);addLog("Deep Freeze: area frozen.","debuff");handled=true;}
    else if(id==="sanctify"){setTERadius(r,c,2,"blessed",3);addLog("Sanctify: area blessed.","buff");handled=true;}
    else if(id==="blight"){setTERadius(r,c,2,"cursed",3);addLog("Blight: area cursed.","debuff");handled=true;}
    else if(id==="nullfield"){setTERadius(r,c,2,"",3);addLog("Null Field: tile effects cleared in area.","buff");handled=true;}
    else if(id==="stormcall"){
      var stormHits=0;for(var si=n[r][c].length-1;si>=0;si--){var su=n[r][c][si];if(su.typeId!==0){dmgUnit(r,c,si,2);stormHits++;}}
      addLog("Storm Call: "+stormHits+" units struck for 2 damage.","debuff");handled=true;
    }

    if(!handled){addLog("Spell effect not yet implemented.");return;}
    setBoard(n);
    setCpPts(function(p){return p-cost;});
    addLog(castingSpell.name+" cast ("+cost+"pt).","points");
    var setHand2=cp==="p1"?setP1Hand:setP2Hand;
    setHand2(function(h){return h.filter(function(x){return x!==castingSpell;});});
    setCastingSpell(null); setSpellMode(null);
  }

  // ── Highlights ───────────────────────────────────────────────────────────────
  function getTileHL(r,c) {
    if (spawnMode!==null) {
      var rows2=cp==="p1"?[0]:[6];
      return rows2.indexOf(r)>=0?"spawn":null;
    }
    if (castingSpell) {
      var cell3=board[r][c];
      if (castingSpell.target==="own") return cell3.some(function(u){return u.owner===cp&&u.typeId!==0;})?"spell_own":null;
      if (castingSpell.target==="enemy") return cell3.some(function(u){return (u.owner!==cp||u.neutral)&&u.typeId!==0;})?"spell_enemy":null;
      if (castingSpell.target==="tile"||castingSpell.id==="voidstep_dest") return "spell_tile";
      return null;
    }
    if (!selected) return null;
    var selCell=board[selected.r][selected.c];
    var att=selCell[selected.unitIdx];
    if (!att||att.owner!==cp) return null;
    var blocked={};
    Object.entries(tileEffects).forEach(function(kv){if(kv[1].type==="blocked")blocked[kv[0]]=true;});
    var cell=board[r][c];
    var hasEnemy=cell.some(function(u){return u.owner!==cp||u.neutral;});
    var canMov=!att.moved&&canMove(att,selected.r,selected.c,r,c,blocked)&&cell.length<4;
    var canAtk=hasEnemy&&(canAttack(att,selected.r,selected.c,r,c)||canAttackTower(att,selected.r,selected.c,r,c,board));
    if(canMov&&canAtk)return"both";
    if(canAtk)return"attack";
    if(canMov)return"move";
    return null;
  }

  return (
    <div style={{minHeight:"100vh",background:"#131820",color:"#c8d0e0",fontFamily:"Courier New,monospace",display:"flex",gap:0}}>
      <InjectCSS/>
      {/* In-game chat (online only) */}
      {isOnline&&lobbyChat&&<InGameChatPanel lobbyChat={lobbyChat}/>}
      {/* Centre */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"6px 0",gap:4,overflow:"hidden"}}>
        {/* Header */}
        <div style={{width:"100%",maxWidth:720,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 8px"}}>
          <button onClick={onMenu} style={{background:"none",border:"1px solid #1e2535",color:"#4a5568",borderRadius:3,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",fontSize:9,letterSpacing:2}}>MENU</button>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{fontSize:22,fontWeight:"bold",color:isOnline&&!isMyTurn?"#718096":cpColor,letterSpacing:4}}>{phase==="event"?"EVENT PHASE":isOnline?(isMyTurn?"YOUR TURN":"WAITING..."):(phase==="p1"?"YOUR TURN":"OPPONENT'S TURN")}</div>
            {isOnline&&<div style={{fontSize:8,letterSpacing:2,color:onlineStatus==="disconnected"?"#fc8181":isMyTurn?"#4ade80":"#718096"}}>{onlineStatus==="disconnected"?"⚠ DISCONNECTED":isMyTurn?"● YOUR MOVE":"● OPPONENT'S MOVE"}</div>}
          </div>
          <div style={{fontSize:9,color:"#4a5568",letterSpacing:2}}>CYCLE {cycleNum}</div>
        </div>
        {/* Opponent info (top) */}
        <div style={{width:"100%",maxWidth:720,padding:"0 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          {isOnline?(
            myRole==="p1"
              ? <><div style={{fontSize:18,fontWeight:"bold",color:"#fc8181"}}>♛ P2: {p2Life}HP</div><div style={{fontSize:15,fontWeight:"bold",color:"#fc8181"}}>{p2Pts}pt</div></>
              : <><div style={{fontSize:18,fontWeight:"bold",color:"#4299e1"}}>♛ P1: {p1Life}HP</div><div style={{fontSize:15,fontWeight:"bold",color:"#4299e1"}}>{p1Pts}pt</div></>
          ):(
            <><div style={{fontSize:18,fontWeight:"bold",color:"#fc8181"}}>♛ {vsMode==="cpu"?"REALM":"P2"}: {p2Life}HP</div><div style={{fontSize:15,fontWeight:"bold",color:"#fc8181"}}>{p2Pts}pt</div></>
          )}
        </div>
        {ev && <div style={{width:"100%",maxWidth:720,padding:"4px 10px",background:ev.color+"18",border:"1px solid "+ev.color+"55",borderLeft:"4px solid "+ev.color,borderRadius:3,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><span style={{fontSize:16,fontWeight:"bold",color:ev.color}}>⚡ {ev.name}</span><span style={{fontSize:11,color:"#a0adb8",marginLeft:8}}>{ev.desc}</span></div>
          <span style={{fontSize:14,fontWeight:"bold",color:ev.color,flexShrink:0}}>{eventCyclesLeft}c</span>
        </div>}
        {/* Column labels */}
        <div style={{width:"100%",maxWidth:720,display:"grid",gridTemplateColumns:"22px repeat("+BOARD+",1fr)",gap:2,paddingLeft:8,paddingRight:8}}>
          <div/>
          {["A","B","C","D","E","F","G"].map(function(l){return <div key={l} style={{textAlign:"center",fontSize:9,color:"#4a5568",letterSpacing:1}}>{l}</div>;})}
        </div>
        {/* Board + row labels */}
        <div style={{display:"flex",gap:2,width:"100%",maxWidth:720,paddingLeft:8,paddingRight:8}}>
          <div style={{display:"flex",flexDirection:"column",gap:2,width:22,flexShrink:0}}>
            {Array.from({length:BOARD},function(_,i){var rowNum=isOnline&&myRole==="p2"?i+1:BOARD-i;return <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#4a5568",flex:1}}>{rowNum}</div>;})}
          </div>
          <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat("+BOARD+",1fr)",gap:2,background:(deck&&deck.color?deck.color:"#4299e1")+"18",border:"1px solid "+(deck&&deck.color?deck.color:"#4299e1")+"33",padding:4,borderRadius:4,position:"relative"}}>            {Array.from({length:BOARD},function(_,displayR){
              var r=isOnline&&myRole==="p2" ? displayR : BOARD-1-displayR;
              return Array.from({length:BOARD},function(_2,c){
                var cell=board[r][c];
                var hl=getTileHL(r,c);
                var te=tileEffects[r+","+c];
                var isSel=selected&&selected.r===r&&selected.c===c;
                var dc=deck&&deck.color?deck.color:"#4299e1";
                var dr2=parseInt(dc.slice(1,3),16),dg2=parseInt(dc.slice(3,5),16),db2=parseInt(dc.slice(5,7),16);
                var bg="#0d1018";
                if(r===0)bg="rgb("+(12+Math.round(dr2*0.15))+","+(10+Math.round(dg2*0.1))+","+(12+Math.round(db2*0.2))+")";
                else if(r===1)bg="rgb("+(10+Math.round(dr2*0.08))+","+(9+Math.round(dg2*0.06))+","+(10+Math.round(db2*0.1))+")";
                else if(r>=2&&r<=4)bg="rgb("+(8+Math.round(dr2*0.04))+","+(8+Math.round(dg2*0.03))+","+(8+Math.round(db2*0.05))+")";
                else if(r===5)bg="rgb("+(12+Math.round(dr2*0.06))+",9,9)";
                else if(r===6)bg="rgb("+(20+Math.round(dr2*0.08))+",8,8)";
                if(te&&te.type==="fire")bg="#2a1008";
                if(te&&te.type==="ice")bg="#0a1828";
                if(te&&te.type==="cursed")bg="#1a0a2a";
                if(te&&te.type==="blessed")bg="#0a1a0a";
                var hlColors={move:"rgba(99,179,237,0.25)",attack:"rgba(252,129,129,0.3)",both:"rgba(167,139,250,0.3)",spawn:"rgba(104,211,145,0.2)",spell_own:"rgba(159,122,234,0.35)",spell_enemy:"rgba(252,129,129,0.4)",spell_tile:"rgba(246,173,85,0.35)"};
                var hlBorder=hl?hlColors[hl]:null;
                var outlineColor=hlBorder?hlBorder.replace(/0\.[0-9]+\)/,"0.9)"):null;
                var outline=isSel?"2px solid #f6e05e":(outlineColor?"2px solid "+outlineColor:"none");
                var pulseClass=te?"tile-"+te.type:"";
                return (
                  <div key={r+"-"+c} className={pulseClass} onClick={function(){handleTileClick(r,c);}}
                    onMouseEnter={te?function(e){setTileTip({type:te.type,turnsLeft:te.turnsLeft,x:e.clientX,y:e.clientY});setTooltip(null);}:undefined}
                    onMouseMove={te?function(e){setTileTip(function(h){return h?{...h,x:e.clientX,y:e.clientY}:null;});}:undefined}
                    onMouseLeave={te?function(){setTileTip(null);}:undefined}
                    style={{background:hl?hlColors[hl]:bg,outline:outline,outlineOffset:"-1px",aspectRatio:"1",position:"relative",borderRadius:2,cursor:"pointer",display:"grid",gridTemplateColumns:"44% 44%",gridTemplateRows:"47% 47%",gap:"2% 12%",padding:"3% 3%",justifyContent:"center",alignContent:"center"}}>
                    {cell.some(function(u){return u&&u.typeId===5;})?(function(){
                      var twrUnit=cell.find(function(u){return u&&u.typeId===5;});
                      var twrSlot=cell.indexOf(twrUnit);
                      var oc=twrUnit.owner==="p1"?"#4299e1":twrUnit.owner==="p2"?"#fc8181":"#a07040";
                      var isSv=isSel&&selected.unitIdx===twrSlot;
                      return <div className={twrUnit.legendary?"unit-legendary":""} style={{position:"absolute",inset:4,background:twrUnit.typeId===0?"#2a1f06":"#0f1118",border:"2px solid "+(isSv?"#f6e05e":twrUnit.legendary?"#d69e2e":(oc+(twrUnit.tapped?"44":"99"))),outline:isSv?"1px solid #f6e05e":"none",borderRadius:3,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",transform:twrUnit.tapped?"rotate(90deg)":"none",transition:"transform 0.2s ease",opacity:twrUnit.tapped?0.55:1}}
                        onMouseEnter={function(e){setTooltip({u:twrUnit,x:e.clientX,y:e.clientY});}}
                        onMouseMove={function(e){setTooltip(function(h){return h?{...h,x:e.clientX,y:e.clientY}:null;});}}
                        onMouseLeave={function(){setTooltip(null);}}
                        onClick={function(e){e.stopPropagation();handleUnitClick(r,c,twrSlot);}}>
                        <div style={{position:"absolute",top:twrUnit.owner==="p2"?0:"auto",bottom:twrUnit.owner==="p1"?0:"auto",left:0,right:0,height:3,background:oc,opacity:twrUnit.tapped?0.35:0.9}}/>
                        <div style={{fontSize:24,color:twrUnit.tapped?oc+"66":oc}}>{UNIT_ICON[twrUnit.typeId]||"?"}</div>
                        <div style={{fontSize:13,color:(twrUnit.typeId===0?(twrUnit.owner==="p1"?p1Life:p2Life):twrUnit.hp)<(twrUnit.typeId===0?MAX_HP:twrUnit.maxHp)?"#fc8181":"#68d391"}}>{twrUnit.typeId===0?(twrUnit.owner==="p1"?p1Life:p2Life):twrUnit.hp}</div>
                        {(twrUnit.atkBuff||0)>0&&<div style={{fontSize:7,color:"#68d391"}}>+{twrUnit.atkBuff}</div>}
                      </div>;
                    })()
                    :(cell.map(function(u,slot){
                      if(!u)return <div key={slot} style={{border:"1px dashed #1e2535",borderRadius:1}}/>;
                      var oc=u.owner==="p1"?"#4299e1":u.owner==="p2"?"#fc8181":"#a07040";
                      var isSv=isSel&&selected.unitIdx===slot;
                      return (
                        <div key={slot}
                          onMouseEnter={function(e){setTooltip({u:u,x:e.clientX,y:e.clientY});}}
                          onMouseMove={function(e){setTooltip(function(h){return h?{...h,x:e.clientX,y:e.clientY}:null;});}}
                          onMouseLeave={function(){setTooltip(null);}}
                          onClick={function(e){e.stopPropagation();handleUnitClick(r,c,slot);}}
                          className={u.legendary?"unit-legendary":""}
                          style={{background:u.typeId===0?"#2a1f06":u.sick?"#1a1008":"#0f1118",
                            border:"1px solid "+(isSv?"#f6e05e":u.legendary?"#d69e2e":u.sick?"#ed8936":(oc+(u.tapped?"33":"77"))),
                            outline:isSv?"1px solid #f6e05e":"none",borderRadius:1,
                            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                            cursor:"pointer",fontSize:5,overflow:"hidden",position:"relative",
                            transform:u.tapped?"rotate(90deg)":"none",transition:"transform 0.2s ease",
                            opacity:u.sick?0.6:u.tapped?0.55:1}}>
                          <div style={{position:"absolute",top:u.owner==="p2"||u.neutral?0:"auto",bottom:u.owner==="p1"?0:"auto",left:0,right:0,height:2,background:oc,opacity:u.tapped?0.35:0.85}}/>
                          <div style={{fontWeight:"bold",fontSize:17,color:u.tapped?oc+"66":oc,lineHeight:1,marginTop:1}}>{UNIT_ICON[u.typeId]||"?"}</div>
                          <div style={{fontSize:9,color:(u.typeId===0?(u.owner==="p1"?p1Life:p2Life):u.hp)<(u.typeId===0?MAX_HP:u.maxHp)?"#fc8181":"#68d391",lineHeight:1}}>{u.typeId===0?(u.owner==="p1"?p1Life:p2Life):u.hp}</div>
                          {(u.atkBuff||0)>0&&<div style={{fontSize:4,color:"#68d391"}}>+{u.atkBuff}</div>}
                        </div>
                      );
                    }))}
                    {groundItems[r+","+c]&&groundItems[r+","+c].length>0&&(
                      <div onClick={function(e){e.stopPropagation();var gi=groundItems[r+","+c][0];var pu4=board[r][c].find(function(x){return x.owner===cp&&!x.neutral;});if(pu4){pickUpGroundItem(r,c,pu4.id);}else{addLog("No unit on "+tileName(r,c)+" to pick up the item.");};}}
                        style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(26,18,0,0.93)",borderTop:"1px solid #f6e05e",padding:"1px 3px",display:"flex",alignItems:"center",gap:2,cursor:"pointer",zIndex:9}}>
                        <span style={{fontSize:8,color:"#f6e05e"}}>⚔</span>
                        <span style={{fontSize:6,color:"#f6e05e",fontWeight:"bold",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{groundItems[r+","+c][0].name}</span>
                      </div>
                    )}
                  </div>
                );
              });
            })}
          </div>
        </div>
        {/* Player combined bar */}
        <div style={{width:"100%",maxWidth:720,padding:"4px 8px",background:"#0d1018",borderTop:"1px solid #1e2535",display:"flex",gap:8,alignItems:"stretch"}}>
          <div style={{display:"flex",flexDirection:"column",justifyContent:"center",gap:2,minWidth:90,flexShrink:0}}>
            {isOnline?(
              myRole==="p1"
                ? <><div style={{fontSize:18,fontWeight:"bold",color:"#4299e1",lineHeight:1}}>♛ P1 {p1Life}<span style={{fontSize:11,color:"#4299e199"}}> HP</span></div><div style={{fontSize:15,fontWeight:"bold",color:"#4299e1",lineHeight:1}}>{p1Pts}<span style={{fontSize:10,color:"#4299e199"}}> pt</span></div></>
                : <><div style={{fontSize:18,fontWeight:"bold",color:"#fc8181",lineHeight:1}}>♛ P2 {p2Life}<span style={{fontSize:11,color:"#fc818199"}}> HP</span></div><div style={{fontSize:15,fontWeight:"bold",color:"#fc8181",lineHeight:1}}>{p2Pts}<span style={{fontSize:10,color:"#fc818199"}}> pt</span></div></>
            ):(
              <><div style={{fontSize:18,fontWeight:"bold",color:"#4299e1",lineHeight:1}}>♛ {p1Life}<span style={{fontSize:11,color:"#4299e199"}}> HP</span></div><div style={{fontSize:15,fontWeight:"bold",color:"#4299e1",lineHeight:1}}>{p1Pts}<span style={{fontSize:10,color:"#4299e199"}}> pt</span></div></>
            )}
          </div>
          <div style={{width:1,background:"#1e2535",flexShrink:0}}/>
          {isPlay()&&!isCpu&&<React.Fragment>
            <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
              <div style={{fontSize:7,color:"#4a5568",letterSpacing:2}}>MELEE</div>
              <div style={{display:"flex",gap:3}}>
                {[1,2,3].map(function(tid){var isU=unlocked.has(tid);var canAfford=cpPts>=UNITS[tid].cost;var off=!isMyTurn;return (
                  <button key={tid}
                    onMouseEnter={function(e){setBtnTip({typeId:tid,x:e.clientX,y:e.clientY});}}
                    onMouseLeave={function(){setBtnTip(null);}}
                    onClick={function(){if(off)return;if(!isU){addLog(UNITS[tid].name+" locked.");return;}setSpawnMode(spawnMode===tid?null:tid);setSelected(null);}}
                    style={{background:spawnMode===tid?"#4299e133":"#0f1118",border:"1px solid "+(isU&&canAfford&&!off?"#4299e155":"#1e2535"),color:isU&&canAfford&&!off?"#c8d0e0":"#2a3040",borderRadius:3,padding:"4px 7px",cursor:off?"not-allowed":"pointer",fontFamily:"inherit",fontSize:9,opacity:off?0.3:!isU?0.3:!canAfford?0.45:1}}>
                    {UNITS[tid].short}<br/><span style={{fontSize:7,color:!canAfford?"#e05252":"#4a5568"}}>{UNITS[tid].cost}pt</span>
                  </button>
                );})}
              </div>
              <div style={{fontSize:7,color:"#4a5568",letterSpacing:2}}>RANGED</div>
              <div style={{display:"flex",gap:3}}>
                {[6,7,8].map(function(tid){var isU=unlocked.has(tid);var canAfford=cpPts>=UNITS[tid].cost;var off=!isMyTurn;return (
                  <button key={tid}
                    onMouseEnter={function(e){setBtnTip({typeId:tid,x:e.clientX,y:e.clientY});}}
                    onMouseLeave={function(){setBtnTip(null);}}
                    onClick={function(){if(off)return;if(!isU){addLog(UNITS[tid].name+" locked.");return;}setSpawnMode(spawnMode===tid?null:tid);setSelected(null);}}
                    style={{background:spawnMode===tid?"#4299e133":"#0f1118",border:"1px solid "+(isU&&canAfford&&!off?"#4299e155":"#1e2535"),color:isU&&canAfford&&!off?"#c8d0e0":"#2a3040",borderRadius:3,padding:"4px 7px",cursor:off?"not-allowed":"pointer",fontFamily:"inherit",fontSize:9,opacity:off?0.3:!isU?0.3:!canAfford?0.45:1}}>
                    {UNITS[tid].short}<br/><span style={{fontSize:7,color:!canAfford?"#e05252":"#4a5568"}}>{UNITS[tid].cost}pt</span>
                  </button>
                );})}
              </div>
            </div>
            <div style={{width:1,background:"#1e2535",flexShrink:0}}/>
            <div style={{display:"flex",flexDirection:"column",gap:4,justifyContent:"center",flexShrink:0}}>
              <Btn label="Merge" color="#9f7aea" active={mergeMode} disabled={!isMyTurn} onClick={function(){setMergeMode(!mergeMode);setSelected(null);}}/>
              <Btn label="Retreat" color="#718096" disabled={!isMyTurn} onClick={doRetreat}/>
              <Btn label="End Turn" color="#d69e2e" disabled={!isMyTurn} onClick={function(){clearModes();if(endTurnRef.current)endTurnRef.current();}}/>
            </div>
            <div style={{width:1,background:"#1e2535",flexShrink:0}}/>
            <div style={{display:"flex",gap:6,alignItems:"flex-start",flex:1}}>
              <div onClick={isMyTurn?drawSpell:undefined} style={{width:52,height:72,flexShrink:0,background:isMyTurn&&cpPts>=2?"#120820":"#0a0810",border:"2px solid "+(isMyTurn&&cpPts>=2?"#9f7aea":"#2a1e40"),borderRadius:5,cursor:isMyTurn&&cpPts>=2?"pointer":"not-allowed",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",boxShadow:isMyTurn&&cpPts>=2?"0 0 10px #9f7aea44":"none",opacity:isMyTurn?1:0.4}}>
                <div style={{position:"absolute",top:3,left:4,fontSize:7,color:"#9f7aea88"}}>✦</div>
                <div style={{position:"absolute",bottom:3,right:4,fontSize:7,color:"#9f7aea88",transform:"rotate(180deg)"}}>✦</div>
                <div style={{fontSize:22,color:isMyTurn&&cpPts>=2?"#c8b4f8":"#4a3870"}}>✦</div>
                <div style={{fontSize:9,fontWeight:"bold",color:isMyTurn&&cpPts>=2?"#9f7aea":"#4a3870"}}>SPELL</div>
                <div style={{fontSize:8,color:isMyTurn&&cpPts>=2?"#d69e2e":"#4a3870"}}>2pt</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:3,flex:1,maxHeight:80,overflowY:"auto"}}>
                {(isOnline?(myRole==="p1"?p1Hand:p2Hand):(cp==="p1"?p1Hand:p2Hand)).map(function(s,i){return (
                  <div key={i} onClick={function(){if(!isMyTurn)return;if(cpPts<s.cost){addLog(s.name+" costs "+s.cost+"pt.","points");return;}setSelected(null);setCastingSpell(castingSpell===s?null:s);}}
                    style={{background:castingSpell===s?"#1a1030":"#0f1118",border:"1px solid "+(castingSpell===s?"#9f7aea":"#1e2535"),borderLeft:"3px solid "+(isMyTurn&&cpPts>=s.cost?"#9f7aea":"#2a2040"),borderRadius:3,padding:"3px 7px",cursor:isMyTurn&&cpPts>=s.cost?"pointer":"not-allowed",opacity:isMyTurn&&cpPts>=s.cost?1:0.45}}>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontSize:10,color:"#9f7aea",fontWeight:"bold"}}>{s.name}</span>
                      <span style={{fontSize:9,color:"#d69e2e"}}>{s.cost}pt</span>
                    </div>
                    <div style={{fontSize:8,color:"#4a5568"}}>{s.desc}</div>
                    {castingSpell===s&&<div style={{fontSize:8,color:"#f6e05e"}}>click target</div>}
                  </div>
                );})}
              </div>
            </div>
          </React.Fragment>}
        </div>
        {/* Event deck indicator */}
        <div style={{borderTop:"1px solid #1e2535",padding:"5px 12px",display:"flex",alignItems:"center",gap:8,background:"#0a0c10",flexShrink:0}}>
          <div style={{fontSize:8,color:"#2a3550",letterSpacing:2,flexShrink:0}}>BATTLE:</div>
          <div style={{fontSize:10,fontWeight:"bold",color:deck?deck.color:"#4a5568",letterSpacing:1}}>{deck?deck.name:"—"}</div>
          {activeEvent&&<div style={{fontSize:8,color:activeEvent.color||"#d97706",background:(activeEvent.color||"#d97706")+"18",borderRadius:2,padding:"1px 6px",border:"1px solid "+(activeEvent.color||"#d97706")+"44",letterSpacing:1,marginLeft:4}}>⚡ {activeEvent.name}</div>}
        </div>
      </div>
      {/* Right: battle log + reference (two equal panels) */}
      <div style={{width:280,background:"#0a0c12",borderLeft:"2px solid #1e2535",display:"flex",flexDirection:"column",height:"100vh",flexShrink:0}}>
        <div style={{flex:"0 0 50%",padding:"10px 8px",display:"flex",flexDirection:"column",gap:0,minHeight:0,borderBottom:"2px solid #1e2535"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #1e2535",paddingBottom:4,flexShrink:0,marginBottom:8}}>
            <div style={{color:"#4a5568",letterSpacing:3,fontSize:10,fontWeight:"bold"}}>BATTLE LOG</div>
            <div style={{fontSize:8,color:"#2a3550"}}>{log.length} entries</div>
          </div>
          <div style={{overflowY:"auto",flex:1,display:"flex",flexDirection:"column",gap:3,scrollbarWidth:"thin",scrollbarColor:"#2a3550 transparent"}}>
            {log.map(function(entry,i){
              var msg=typeof entry==="string"?entry:entry.msg;
              var tag=typeof entry==="string"?"default":entry.tag;
              var color=tag==="death"?"#c084fc":tag==="buff"?"#4ade80":tag==="debuff"?"#f87171":tag==="points"?"#fb923c":tag==="event"?"#d97706":i===0?"#e2e8f0":"#94a3b8";
              return <div key={i} style={{color:color,fontSize:11,lineHeight:1.5,fontWeight:tag==="event"?"bold":"normal",borderLeft:"2px solid "+color+"33",paddingLeft:5}}>{msg}</div>;
            })}
          </div>
        </div>
        <div style={{flex:"0 0 50%",padding:"10px 8px",display:"flex",flexDirection:"column",minHeight:0}}>
          <ReferencePanel/>
        </div>
      </div>
      {/* Tile tooltip */}
      {tileTip&&!tooltip&&!btnTip&&<TileTip tip={tileTip} popup={!!(showEventPopup||lootPopup)}/>}

      {/* Unit tooltip */}
      {tooltip&&<UnitTip u={tooltip.u} x={tooltip.x} y={tooltip.y} board={board} tileEffects={tileEffects} evFx={activeEventRef.current&&activeEventRef.current.effects||{}} deckTable={[...LOOT_COMMON,...LOOT_ELITE]} popup={!!(showEventPopup||lootPopup)}/>}
      {/* Btn tooltip */}
      {btnTip&&<BtnTip typeId={btnTip.typeId} x={btnTip.x} y={btnTip.y}/>}
      {/* Loot popup */}
      {lootPopup&&(
        <div style={{position:"fixed",inset:0,background:"#000000bb",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300}} onClick={function(){setLootPopup(null);}}>
          <div style={{background:"#0a0c14",border:"2px solid "+(lootPopup.item.color||"#d69e2e"),borderRadius:6,padding:"28px 36px",maxWidth:400,width:"90%",fontFamily:"Courier New,monospace"}} onClick={function(e){e.stopPropagation();}}>
            <div style={{fontSize:9,color:"#4a5568",letterSpacing:4,marginBottom:6}}>ITEM FOUND</div>
            <div style={{fontSize:22,fontWeight:"bold",color:lootPopup.item.color||"#d69e2e",marginBottom:4}}>{lootPopup.item.name}</div>
            <div style={{fontSize:12,color:"#718096",marginBottom:10}}>Claimed by <span style={{color:"#c8d0e0",fontWeight:"bold"}}>{lootPopup.unitName}</span></div>
            <div style={{background:"#0d1018",border:"1px solid "+(lootPopup.item.color||"#d69e2e")+"44",borderRadius:3,padding:"8px 12px",marginBottom:12}}>
              <div style={{fontSize:13,color:lootPopup.item.color||"#d69e2e",fontWeight:"bold",marginBottom:2}}>{lootPopup.item.desc}</div>
              <div style={{fontSize:9,color:"#4a5568",letterSpacing:2}}>SOULBOUND — lost when carrier dies</div>
            </div>
            <div style={{fontSize:13,color:"#8892a4",lineHeight:1.7,fontStyle:"italic",marginBottom:20,borderLeft:"2px solid #2a3550",paddingLeft:12}}>"{lootPopup.item.flavor}"</div>
            <button onClick={function(){setLootPopup(null);}} style={{width:"100%",background:(lootPopup.item.color||"#d69e2e")+"18",border:"1px solid "+(lootPopup.item.color||"#d69e2e")+"55",color:lootPopup.item.color||"#d69e2e",borderRadius:3,padding:"10px",cursor:"pointer",fontFamily:"inherit",fontSize:11,letterSpacing:3}}>CONTINUE</button>
          </div>
        </div>
      )}
      {/* Winner */}
      {winner&&(
        <div style={{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div style={{background:"#0d1018",border:"2px solid #d69e2e",borderRadius:6,padding:"40px 60px",textAlign:"center",fontFamily:"Courier New,monospace"}}>
            <div style={{fontSize:32,fontWeight:"bold",color:"#d69e2e",marginBottom:12}}>{isOnline?(winner===(myRole==="p1"?"P1":"P2")?"YOU WIN!":"YOU LOSE"):(winner==="P1"?"YOU WIN!":"YOU LOSE")}</div>
            <button onClick={onMenu} style={{background:"#1a1208",border:"1px solid #d69e2e44",color:"#d69e2e",borderRadius:3,padding:"10px 30px",cursor:"pointer",fontFamily:"inherit",fontSize:11,letterSpacing:3}}>MAIN MENU</button>
          </div>
        </div>
      )}
      {/* Event popup */}
      {showEventPopup&&ev&&(
        <div style={{position:"fixed",inset:0,background:"#000000bb",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99}}>
          <div style={{background:"#0d1018",border:"2px solid "+ev.color,borderRadius:6,padding:"28px 36px",maxWidth:380,fontFamily:"Courier New,monospace"}}>
            <div style={{fontSize:9,color:ev.color,letterSpacing:4,marginBottom:8}}>EVENT</div>
            <div style={{fontSize:20,fontWeight:"bold",color:ev.color,marginBottom:10}}>{ev.name}</div>
            <div style={{fontSize:12,color:"#c8d0e0",marginBottom:6}}>{ev.desc}</div>
            {ev.lore&&<div style={{fontSize:11,color:"#8892a4",lineHeight:1.7,fontStyle:"italic",marginBottom:10,borderLeft:"2px solid "+ev.color+"44",paddingLeft:10}}>{ev.lore}</div>}
            <div style={{fontSize:10,color:"#4a5568",marginBottom:16}}>{ev.cycles} cycle{ev.cycles!==1?"s":""}</div>
            <button onClick={function(){if(popupCbRef.current)popupCbRef.current();}} style={{width:"100%",background:ev.color+"18",border:"1px solid "+ev.color+"55",color:ev.color,borderRadius:3,padding:"10px",cursor:"pointer",fontFamily:"inherit",fontSize:11,letterSpacing:3}}>CONTINUE</button>
          </div>
        </div>
      )}
    </div>
  );

  function pickUpGroundItem(r, c, unitId) {
    var items = groundItems[r+','+c];
    if (!items || !items.length) return;
    var item = items[0];
    var unitName = '';
    setBoard(function(prev) {
      var n = cloneBoard(prev);
      var idx = n[r][c].findIndex(function(u){return u.id===unitId;});
      if (idx < 0) return prev;
      unitName = (UNITS[n[r][c][idx].typeId] && UNITS[n[r][c][idx].typeId].name) || 'Unit';
      n[r][c][idx] = grantItem(n[r][c][idx], item);
      return n;
    });
    setGroundItems(function(prev) {
      var k = r+','+c;
      var rest = (prev[k]||[]).slice(1);
      var nx = {...prev};
      if (rest.length) nx[k] = rest; else delete nx[k];
      return nx;
    });
    setTimeout(function(){
      var payload={item:item, unitName:unitName||'Unit'};
      setLootPopup(payload);
      sendOnline({type:"SHOW_LOOT_POPUP",payload:payload});
    }, 50);
    addLog('Unit picks up '+item.name+'!', 'buff');
  }

  function isPlay() { return phase==="p1"||phase==="p2"; }
  function clearModes2() { setSelected(null); }

  function doRetreat() {
    if (!selected) { addLog("Select a unit first."); return; }
    const {r,c,unitIdx} = selected;
    const u = board[r][c][unitIdx];
    if (!u||u.owner!==cp) { addLog("Select your unit."); return; }
    if (UNITS[u.typeId].abilities.includes("slow")) { addLog(`${UNITS[u.typeId].name} cannot retreat (Slow).`); return; }
    if (isImmovable(u)) { addLog(UNITS[u.typeId].name+" is immovable — cannot retreat."); return; }
    var hasFallback=UNITS[u.typeId].abilities.includes("fallback")||(u.bonusAbilities||[]).includes("fallback");
    var retreatCost=hasFallback?0:2;
    if(cpPts<retreatCost){addLog("Retreat costs "+retreatCost+"pt.","points");return;}
    const dir = cp==="p1"?-2:2;
    const nr = Math.max(0,Math.min(BOARD-1,r+dir));
    if (nr===r) { addLog("Already at edge."); return; }
    if (board[nr][c].length>=4) { addLog("Destination full."); return; }
    const n = cloneBoard(board);
    const moving = n[r][c].splice(unitIdx,1)[0];
    n[nr][c].push({...moving,tapped:true});
    setBoard(n);
    setCpPts(function(p){return p-retreatCost;});
    addLog(UNITS[u.typeId].name+" retreats to "+tileName(nr,c)+".","default");
    setSelected(null);
  }

  function drawSpell() {
    if (cpPts<2) { addLog("Draw costs 2pt.","points"); return; }
    var s = spellBook[Math.floor(Math.random()*spellBook.length)];
    if(cp==="p1") setP1Hand(h=>[...h,s]); else setP2Hand(h=>[...h,s]);
    setCpPts(function(p){return p-2;});
    addLog("Drew: "+s.name+".","buff");
  }
}

function Btn({label,color,onClick,active,disabled}) {
  return <button onClick={disabled?undefined:onClick} disabled={disabled} style={{background:active?color+"22":"#0f1118",border:"1px solid "+(disabled?"#1e2535":color+"44"),color:disabled?"#2a3550":color,borderRadius:3,padding:"6px 10px",cursor:disabled?"not-allowed":"pointer",fontFamily:"Courier New,monospace",fontSize:9,letterSpacing:1,whiteSpace:"nowrap",opacity:disabled?0.4:1}}>{label}</button>;
}
