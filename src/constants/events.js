// src/constants/events.js
// Combines all 120 events from the 3 attached files

import { DRAGON_EVENTS } from './dragon-events.js';
import { HIGHLANDS_EVENTS } from './highlands-events.js';
import { DWARVEN_EVENTS } from './dwarven-events.js';

// Combine all events into one master list
export const ALL_EVENTS = [
  ...DRAGON_EVENTS,
  ...HIGHLANDS_EVENTS,
  ...DWARVEN_EVENTS
];

// For easy access by theme
export const EVENT_DECKS = {
  dragon: DRAGON_EVENTS,
  highlands: HIGHLANDS_EVENTS,
  dwarven: DWARVEN_EVENTS
};

// Helper data
export const TARGET_LABEL = {
  p1: "P1 only",
  p2: "P2 only",
  soldiers: "Soldiers",
  archers: "Archers",
  knights: "Knights",
  all: null
};

export const TARGET_COLOR = {
  p1: "#4299e1",
  p2: "#fc8181",
  soldiers: "#a0aec0",
  archers: "#f6ad55",
  knights: "#68d391",
  all: "#718096"
};

// Utility to get random event from a theme
export function getRandomEvent(themeId = "dwarven") {
  const deck = EVENT_DECKS[themeId] || DWARVEN_EVENTS;
  return deck[Math.floor(Math.random() * deck.length)];
}

export default ALL_EVENTS;
