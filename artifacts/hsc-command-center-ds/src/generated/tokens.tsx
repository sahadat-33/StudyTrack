/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f4f8f7",
      "foreground": "#132d38",
      "border": "#d8e3e1",
      "card": "#ffffff",
      "cardForeground": "#132d38",
      "popover": "#ffffff",
      "popoverForeground": "#132d38",
      "primary": "#173b4d",
      "primaryForeground": "#ffffff",
      "secondary": "#dcece8",
      "secondaryForeground": "#183d42",
      "muted": "#eaf1ef",
      "mutedForeground": "#536a70",
      "accent": "#f5e7c5",
      "accentForeground": "#4c3813",
      "destructive": "#b23b43",
      "destructiveForeground": "#ffffff",
      "input": "#cad9d7",
      "ring": "#237f79",
      "chart1": "#237f79",
      "chart2": "#e0ad4c",
      "chart3": "#35627a",
      "chart4": "#bd6652",
      "chart5": "#769b82",
      "sidebar": "#edf3f1",
      "sidebarForeground": "#304a54",
      "sidebarBorder": "#d8e3e1",
      "sidebarPrimary": "#173b4d",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#dcece8",
      "sidebarAccentForeground": "#183d42",
      "sidebarRing": "#237f79"
    },
    "dark": {
      "background": "#0d1d26",
      "foreground": "#eaf2ef",
      "border": "#2a414a",
      "card": "#132832",
      "cardForeground": "#eaf2ef",
      "popover": "#172f39",
      "popoverForeground": "#eaf2ef",
      "primary": "#57b8a9",
      "primaryForeground": "#082522",
      "secondary": "#203942",
      "secondaryForeground": "#d9e9e5",
      "muted": "#1b323b",
      "mutedForeground": "#a6bbb8",
      "accent": "#4b3e23",
      "accentForeground": "#f3dca1",
      "destructive": "#8f343e",
      "destructiveForeground": "#ffe9e9",
      "input": "#314a52",
      "ring": "#65c6b6",
      "chart1": "#65c6b6",
      "chart2": "#edc46e",
      "chart3": "#76a9c1",
      "chart4": "#e4866d",
      "chart5": "#9abb9c",
      "sidebar": "#10242d",
      "sidebarForeground": "#d8e6e2",
      "sidebarBorder": "#2a414a",
      "sidebarPrimary": "#57b8a9",
      "sidebarPrimaryForeground": "#082522",
      "sidebarAccent": "#203942",
      "sidebarAccentForeground": "#eaf2ef",
      "sidebarRing": "#65c6b6"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "sans-serif"
    ],
    "serif": [
      "Source Serif 4",
      "Georgia",
      "serif"
    ],
    "mono": [
      "Geist Mono",
      "monospace"
    ]
  },
  "radius": "0.75rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
