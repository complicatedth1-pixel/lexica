// highlight-categories.js
// Defines the 10 highlight categories + special Note category.
// Exposes: window.HL_CATEGORIES, window.HL_CAT_MAP
// Load order: after auth.js, before highlights.js
 
'use strict';
 
// 10 hardcoded categories + 1 special
window.HL_CATEGORIES = [
  { key: 'per',     label: 'Person',       color: '#fb923c', colorAlpha: 'rgba(251,146,60,0.55)',  spanClass: 'hl-span-per'     },
  { key: 'org',     label: 'Organisation', color: '#22d3ee', colorAlpha: 'rgba(34,211,238,0.45)',  spanClass: 'hl-span-org'     },
  { key: 'place',   label: 'Place',        color: '#4ade80', colorAlpha: 'rgba(74,222,128,0.50)',  spanClass: 'hl-span-place'   },
  { key: 'date',    label: 'Date',         color: '#ffe566', colorAlpha: 'rgba(255,229,102,0.60)', spanClass: 'hl-span-date'    },
  { key: 'event',   label: 'Event',        color: '#c084fc', colorAlpha: 'rgba(192,132,252,0.55)', spanClass: 'hl-span-event'   },
  { key: 'why',     label: 'Cause',        color: '#f87171', colorAlpha: 'rgba(248,113,113,0.55)', spanClass: 'hl-span-why'     },
  { key: 'effect',  label: 'Effect',       color: '#f9a8d4', colorAlpha: 'rgba(249,168,212,0.55)', spanClass: 'hl-span-effect'  },
  { key: 'concept', label: 'Concept',      color: '#60a5fa', colorAlpha: 'rgba(96,165,250,0.50)',  spanClass: 'hl-span-concept' },
  { key: 'law',     label: 'Law/Policy',   color: '#fbbf24', colorAlpha: 'rgba(251,191,36,0.55)',  spanClass: 'hl-span-law'     },
  { key: 'data',    label: 'Data/Stat',    color: '#a3e635', colorAlpha: 'rgba(163,230,53,0.50)',  spanClass: 'hl-span-data'    },
  // Special — standalone note, no group needed
  { key: 'note',    label: 'Note',         color: '#e879f9', colorAlpha: 'rgba(232,121,249,0.45)', spanClass: 'hl-span-note'    },
];
 
// Fast lookup by key
window.HL_CAT_MAP = {};
window.HL_CATEGORIES.forEach(c => { window.HL_CAT_MAP[c.key] = c; });

