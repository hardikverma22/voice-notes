# Design

Source of truth for tokens: `src/design/tokens.css`. Contrast is enforced by `npm run check:contrast`.

## Direction

Calm, editorial, warm. The app is a quiet notebook that listens. The record control is the hero; everything else steps back. Mode: Operate (mobile-first app UI), so scanability, consistency, and native-feeling controls outrank expression. Brand lives in precise details: the breathing ring, the serif note titles, the single warm accent.

## Palette

| Token            | Light     | Dark      | Reasoning                                                                                                                   |
| ---------------- | --------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `--vn-bg`        | `#f4f2ec` | `#111513` | Warm paper and warm charcoal-green, so the app reads as a calm notebook, not a white or black screen.                       |
| `--vn-surface`   | `#fdfcf8` | `#1a201d` | A step lighter than bg, so cards read without heavy borders.                                                                |
| `--vn-fg`        | `#1c2321` | `#eef2ee` | Ink-green near-black and near-white; well above 14:1.                                                                       |
| `--vn-fg-muted`  | `#56615d` | `#a9b4ae` | Secondary text; about 5.7:1 and 8.6:1, past WCAG AA.                                                                        |
| `--vn-border`    | `#cfccc3` | `#323b36` | Hairlines and dividers only. Decorative, so it is not required to reach 3:1.                                                |
| `--vn-control`   | `#7a847f` | `#7d8a84` | Borders that define a control (secondary buttons, toolbar). WCAG 1.4.11 needs 3:1 for a control boundary.                   |
| `--vn-accent`    | `#0f6b6a` | `#4fc4b8` | One accent: deep teal in light, a lifted teal in dark. Used for record, primary actions, focus, pressed states, progress.   |
| `--vn-accent-fg` | `#ffffff` | `#111513` | Text on the accent; about 6.3:1 and 8.7:1.                                                                                  |
| `--vn-danger`    | `#b42318` | `#ff8c7f` | Delete and errors only, deliberately separate from the accent so destructive actions never look like the primary action.    |
| `--vn-focus`     | `#0f6b6a` | `#4fc4b8` | Focus ring is the accent (one accent for focus and active states). On the inverted toast, focus uses the bg colour instead. |

Dark is hand-tuned, not inverted: the accent is lifted in lightness so it stays above 8:1 on the dark background, and shadows are heavier because elevation is less visible on dark.

Note on the earlier palette: the first version used terracotta on cream. It was replaced after review because the warm-terracotta combination read as generic; teal keeps one accent and warm-leaning neutrals while standing apart.

## Type

| Role                   | Family                                                           | Size                    | Reasoning                                                             |
| ---------------------- | ---------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| Note titles, app name  | `--vn-font-serif` (ui-serif, New York, Iowan Old Style, Georgia) | `--vn-text-xl` / `2xl`  | Serif reads as editorial and personal for things the user wrote.      |
| UI, labels, transcript | `--vn-font-sans` (system UI)                                     | `--vn-text-base` (1rem) | System stacks give native rendering, zero download, and work offline. |
| Metadata, timestamps   | sans                                                             | `--vn-text-sm` / `xs`   | Smaller and muted, so it recedes behind the content.                  |

Body line-height is 1.55, which keeps long transcripts comfortable on a phone. No web fonts are loaded (brief constraint).

## Spacing and shape

A 4px-based scale (`--vn-space-1` to `-8`). Radii are soft: 8, 14, and 24px, so the record control and cards feel friendly without looking toy-like.

## Motion

| Token             | Value                        | Reasoning                                                                              |
| ----------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| `--vn-dur-fast`   | 150ms                        | Hover, press, and focus feedback; quick enough to feel instant.                        |
| `--vn-dur-base`   | 220ms                        | Panels and state changes; long enough to see, short enough not to slow the user.       |
| `--vn-dur-breath` | 2400ms                       | The record ring's slow breath; calm, reads as "listening" without demanding attention. |
| `--vn-ease`       | `cubic-bezier(0.2, 0, 0, 1)` | Decelerating curve feels responsive and settled.                                       |

All motion is removed under `prefers-reduced-motion` (see `src/index.css`).

## Elevation

Two shadow levels. Light shadows are warm-tinted, not gray, to match the paper background. Dark shadows are stronger because depth is harder to see on dark surfaces.

## Accessibility

- WCAG 2.2 AA contrast for every text and control pair, checked in both themes by `check:contrast`.
- Focus is always visible (2px accent outline with 2px offset).
- Touch targets at least 44 by 44 CSS px on phones.
- Motion is optional; nothing essential depends on animation.

## Rejected from the generated system

`design-system/voice-notes/MASTER.md` (from ui-ux-pro-max) proposed a violet palette, neumorphism, Google Fonts (Lora and Raleway), and a testimonials landing pattern. All of these conflict with the brief (one warm accent, system fonts only, no marketing layout), so they are not used. Its general checklist items (44px targets, visible focus, reduced motion, 375/768/1024/1440 breakpoints) are kept.
