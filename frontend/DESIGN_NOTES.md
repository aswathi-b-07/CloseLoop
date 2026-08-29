# CloseLoop Dashboard — Design Notes

The dashboard UI is styled to match **Razorpay's design language** (razorpay.com),
so the submission feels native to the Razorpay platform. Below is what was used
and where it maps in the code.

## Color palette (Razorpay-inspired)
| Token | Hex | Use |
|---|---|---|
| Razorpay blue (`rzp`) | `#3395FF` | Primary CTAs, links, active toggle, LLM/Gemini tier, focus rings |
| Blue dark / darker | `#1E64E7` / `#1450C0` | Button hover, emphasis text on tints |
| Blue tint | `#EBF3FF` / `#F5F9FF` | Row hover, chips, finding cards |
| Navy (headings/text) | `#0F1B3D`, `#162F56`, `#02042B` | Headlines, wordmark, key numbers |
| Canvas | `#F4F6FD` | Page background (with soft blue radial gradients) |
| Hairline (`line`) | `#E7EAF3` | Card borders, table rules |
| Semantic | emerald `#12B76A`, amber `#F59E0B`, red `#F04438` | Success / warning / at-risk |

Defined in `tailwind.config.js`; base styles + gradients in `src/index.css`.

## Typography
- **Plus Jakarta Sans** (700/800) — display/headings & the CloseLoop wordmark
  (closest free match to Razorpay's geometric custom typeface).
- **Inter** (400–700) — body, tables, UI.
- Loaded via Google Fonts in `index.html`; wired as `font-display` / `font-sans`.

## Razorpay UI elements applied
| Razorpay element | Where in the dashboard |
|---|---|
| **White top nav bar** with brand mark + right-aligned controls & primary CTA | `Header.jsx` — gradient-blue logo tile, navy wordmark, "Run reconciliation" blue button |
| **Rounded blue gradient logo tile** | `Header.jsx` (`from-rzp to-rzp-dark`, `rounded-xl`, soft glow) |
| **Solid blue pill/rounded CTA buttons** with soft shadow + hover-darken | `.btn-primary` in `index.css` |
| **Soft-shadow white cards**, `rounded-2xl`, hairline border, hover lift | `.card` / `.card-hover`; every panel |
| **Stat / KPI tiles** — big bold navy numbers, small uppercase labels | `KpiCards.jsx`, `AccuracyPanel.jsx` |
| **Rounded-full status & category pills** (light tint bg, colored text) | `.chip`, `ExceptionBadge`, `TierBadge`, "Gemini · connected" |
| **Clean data tables** — light zebra header, hairline rows, blue row hover | `ExceptionsTable.jsx`, `AccuracyPanel.jsx`, `ErrorAnalysis.jsx` |
| **Toggle switch** (blue when on) | `Header.jsx` — "Use Gemini Tier-3" |
| **Progress / usage bars** in brand colors | `TierUsage.jsx`, `ConfidenceBar` |
| **Slide-in side panel (drawer)** with backdrop blur | `EntityDrawer.jsx` — entity drill-down + audit timeline |
| **Generous whitespace, blue radial background accents** | `index.css` body gradient + grid spacing |

## Theme
Switched from the previous dark theme to a **light theme** (Razorpay's site is
predominantly light: white surfaces, navy text, blue accents). All badge/tier
colors were re-tuned for readable contrast on white in `src/lib/taxonomy.js`.

## Run it
```powershell
# restart the dev server so tailwind.config.js + fonts reload
cd D:\asw-claude\razorpay\frontend
npm run dev
```
Backend must be running too (`uvicorn closeloop.api:app --app-dir src --port 8000`).
