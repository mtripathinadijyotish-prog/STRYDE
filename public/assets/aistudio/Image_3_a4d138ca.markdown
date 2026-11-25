---
name: Cyber HUD RPG
colors:
  surface: '#11131a'
  surface-dim: '#11131a'
  surface-bright: '#373941'
  surface-container-lowest: '#0c0e15'
  surface-container-low: '#191b23'
  surface-container: '#1d1f27'
  surface-container-high: '#282a31'
  surface-container-highest: '#33343c'
  on-surface: '#e2e2ec'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#e2e2ec'
  inverse-on-surface: '#2e3038'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#d0bcff'
  on-secondary: '#3c0091'
  secondary-container: '#571bc1'
  on-secondary-container: '#c4abff'
  tertiary: '#d8ffe7'
  on-tertiary: '#003824'
  tertiary-container: '#65f2b5'
  on-tertiary-container: '#006d4a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#d0bcff'
  on-secondary-fixed: '#23005c'
  on-secondary-fixed-variant: '#5516be'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#11131a'
  on-background: '#e2e2ec'
  surface-variant: '#33343c'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  title-md:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system channels an immersive, high-precision cyberpunk HUD aesthetic engineered for personal productivity and self-mastery. The brand personality is disciplined, electric, futuristic, and rewarding. It transforms everyday tasks, habits, and long-term milestones into an epic role-playing progression loop.

The visual style blends sleek futuristic minimalism with tactical glassmorphism and radiant neon instrumentation:
- **Atmosphere:** Deep void obsidian backgrounds preserve cognitive focus and battery life while providing maximum contrast for bioluminescent cyber accents.
- **HUD Elements:** Clean angular motifs, translucent panels, and micro-glow status rings deliver the tactile satisfaction of an advanced starship console or augmented-reality interface.
- **Gamified Precision:** Quest logs, skill trees, and attribute rings feel high-stakes yet frictionless, avoiding cartoonish clutter in favor of razor-sharp data visualization.

## Colors

The palette operates on high-contrast phosphorescent accents over deep void tones:

- **Primary (`#00F0FF` - Electric Cyan):** Core active states, standard quest checkpoints, active HUD frames, and primary interactive nodes.
- **Secondary (`#8B5CF6` - Neural Violet):** XP bars, mana reserves, player class attributes, and deep-focus skill unlocks.
- **Tertiary (`#10B981` - Matrix Emerald):** Task completions, streak integrity, stat positive buffs, and system green status checks.
- **Accent - Legendary Gold (`#F59E0B`):** Epic achievements, level-up milestones, boss quest rewards, and streak multipliers.
- **Surfaces & Containers:**
  - `Canvas / Deep Void`: `#08090C` to `#0B0D14`
  - `Surface Base`: `#131622` with semi-translucent backdrop blurs
  - `Surface Raised / Cards`: `#1A1F30`
  - `Surface Highlight / Active Modules`: `#222940`
  - `Borders & Outlines`: `#00F0FF` at 15% to 30% alpha for subtle ambient glow grids.

## Typography

The typographic hierarchy blends cybernetic discipline with high-density data legibility:

- **Display & Headlines (Space Grotesk):** Provides structured geometric angles, echoing sci-fi terminal interfaces while maintaining approachable character proportions.
- **Body & Content (Geist):** Handles descriptions, task checklists, and quest briefings with ultra-crisp neo-grotesque clarity, optimizing reading flow in dark environments.
- **Telemetry & Labels (JetBrains Mono):** Reserved for HUD stat displays, XP counts, countdown timers, tier badges, and attributes (e.g., `+120 XP`, `LVL 42`, `STR: 88/100`). Always render micro-labels in uppercase with tracked spacing (`0.05em` to `0.1em`).

## Layout & Spacing

Layout follows a strict 8pt modular system combined with a 12-column responsive fluid grid (4 columns on mobile, 8 on tablet, 12 on desktop):

- **Grid Alignment:** Dashboard widgets conform strictly to modular column spans (e.g., Quest Log: 8 cols, Stat Widget: 4 cols on desktop).
- **Margins & Gutters:** Dynamic safe areas scale between `1rem` on mobile screens to `2.5rem` on wide desktop consoles to maintain ergonomic dashboard control.
- **Rhythm:** Dense HUD layouts utilize `space-xs` and `space-sm` for internal component telemetry, whereas `space-lg` and `space-xl` insulate quest stages and category decks.

## Elevation & Depth

Visual hierarchy does not rely on heavy physical drop shadows. Instead, it utilizes **layered glassmorphic luminescences and fine telemetry borders**:

- **Layer 0 (Canvas):** Pure `#08090C` background, optionally overlaid with a faint 24px isometric or rectangular grid pattern at 2% opacity.
- **Layer 1 (Sub-Containers):** `#131622` at 85% opacity with `16px` backdrop-filter blur and a 1px border of `rgba(255, 255, 255, 0.06)`.
- **Layer 2 (Floating Cards & Active Quests):** `#1A1F30` at 90% opacity with `20px` backdrop blur, a 1px border of `rgba(0, 240, 255, 0.25)`, and a diffuse cyan edge glow: `0 0 20px -5px rgba(0, 240, 255, 0.15)`.
- **Layer 3 (Modals, Overlays, Level-Up Banners):** `#222940` at 95% opacity with a dual ring: an inner crisp stroke of `#00F0FF` and an outer ambient bloom of `0 0 35px rgba(139, 92, 246, 0.3)`.

## Shapes

The design system employs **Soft (`1`)** geometry with intentional sci-fi chamfers and sharp micro-accents:

- Standard panels and interactive controls carry a clean `0.25rem` (4px) or `0.5rem` (8px) radius to maintain an industrial, technical aesthetic.
- Avoid pill or bubble shapes; circular radiuses are strictly limited to circular circular progression rings, user avatar cyber-hexagons, and radial attribute charts.
- Progress bars and stat meters employ square caps or slight 45-degree cutoffs to reinforce the HUD diagnostic feel.

## Components

### Buttons
- **Primary Cyber Button:** Electric cyan fill (`#00F0FF`) with jet-black text (`#08090C`), semi-bold Space Grotesk. Hover state ignites a cyan outer glow (`0 0 16px rgba(0, 240, 255, 0.5)`).
- **Secondary / Action Button:** Translucent `#131622` surface with a 1px border of `#8B5CF6`. Violet text with an active hover state triggering a soft purple bloom.
- **Ghost HUD Button:** Transparent fill, `JetBrains Mono` label, framed by low-opacity bracket-like borders at the corners.

### Quest & Daily Cards
- Built on Layer 2 elevation with a 1px border that shifts dynamically: `#00F0FF` for active quests, `#8B5CF6` for epic habit streaks, and `#F59E0B` for legendary boss encounters.
- Card headers feature status tag chips displaying remaining time, difficulty tier (e.g., `RANK S`), and XP yield.

### Input Fields & Selectors
- Solid `#131622` background framed in a 1px `rgba(255, 255, 255, 0.12)` boundary.
- On focus, border snaps to solid `#00F0FF` with a subtle inner glow, transitioning prompt text into an uppercase micro-label in JetBrains Mono above the field.

### Checkboxes & Quest Toggles
- Custom square check-containers (18x18px) with a 2px chamfered border.
- Unchecked: Empty slate dark box with faint outline.
- Checked: Snaps to emerald green (`#10B981`) or cyan (`#00F0FF`) with an animated glowing cyber checkmark, instantly striking through task typography with a glowing tracer line.

### Gamified Progress & Stat Bars
- **HP / Energy / XP Tracks:** Recessed slate-charcoal troughs (`#131622`) containing segmented or continuous radiant fills.
- Bars feature an animated gradient sweep terminating in a brighter 2px head-beam that glows at the frontier of progress.

### Badges & Loot Chips
- Compact geometric chips with high-contrast text and micro-borders:
  - Common: Neutral slate border.
  - Rare: `#00F0FF` border and text.
  - Epic: `#8B5CF6` border and text.
  - Legendary: `#F59E0B` border with animated golden shimmer.