# Slipstream brand reference: DockMaster Web styling family

## Identity guardrail (read first)

Slipstream keeps its own name and its own product identity. This document exists so Slipstream's UI reads as *native to the DockMaster Web ecosystem* it surfaces data from (same palette family, same type feel, same component idiom), not so Slipstream can pass as a DockMaster product.

- Do not reproduce the DockMaster wordmark, the ship/wake logomark, or any DockMaster/Blu brand asset in Slipstream's UI.
- Do not label Slipstream as "DockMaster" or "Blu" anywhere in copy.
- Do color-match, type-match, and component-match so the two feel like they belong on the same desk.

Harmony, not impersonation.

## Sourcing and confidence, in brief

- `dockmaster.com` (marketing site, Next.js + Tailwind + shadcn/ui) exposed its **actual Tailwind theme tokens** in a shipped CSS bundle, including custom `--navy` / `--gold` HSL variables layered on top of stock shadcn defaults. This is the strongest evidence in this doc: it's DockMaster's own design-system source, not a guess.
- `portal.dockmaster.com`'s "Introducing DockMaster Web" launch post embeds two real product screenshots (customer record view, customer-portal vessel view). These are the actual DockMaster Web UI and are the primary reference for component idiom.
- The **Blu Voice Agent** page (`dockmaster.com/products/blu-voice-agent`) has no distinct visual identity of its own in public view. It uses the DockMaster marketing shell and logo, and its copy stresses that Blu's voice/name/accent are *configurable per marina* rather than fixed brand elements. There is no Blu-specific screenshot or palette to extract. Treat "Blu" as a feature of DockMaster's ecosystem, not a separate visual brand; Slipstream should not invent one either.
- A few soft teal/pink/mauve hex values appear in the Blu page's CSS but only as decorative illustration accents on that one marketing page (not tokens, not reused elsewhere). Excluded from the palette below as noise.

Anything below marked **approximate** was sampled by eye from a screenshot, not read from a CSS source. Treat it as a reasonable stand-in, not a verified brand value.

## CSS custom properties

These are the brand-derived tokens as originally specified. The shipped `web/style.css` implements this set and has since grown app-specific additions; three tokens below (`--ds-gold-light`, `--ds-success`, `--ds-warning`) ended up unused in the shipped stylesheet, and the shipped sans stack adds "Segoe UI" and Roboto after Inter. This document remains the brand source of truth; `web/style.css` is the implementation.

```css
:root {
  /* Primary / navy family: verified, appears verbatim in DockMaster's shipped
     Tailwind CSS and matches product-screenshot heading/nav color */
  --ds-navy: #161848;        /* primary text, nav/sidebar wordmark, headings */
  --ds-navy-light: #1e1e5a;  /* secondary navy surfaces, hover states */
  --ds-navy-dark: #0d0d2b;   /* deepest navy, near-black text/bg */

  /* Accent gold family: verified, appears verbatim in DockMaster's shipped
     Tailwind CSS; observed in-product on the "pinned note" highlight card */
  --ds-gold: #ffc844;        /* attention/highlight accent, CTAs on marketing surfaces */
  --ds-gold-light: #ffe066;  /* lighter gold, highlight fills */
  --ds-gold-soft: #ffd87a;   /* softest gold, used for tinted highlight backgrounds */
  --ds-gold-text: #b86614;   /* approximate: computed from DockMaster's --gold-text HSL
                                 token (30 80% 40%) for accessible gold-on-light text;
                                 not visually sampled */

  /* Surfaces */
  --ds-surface: #ffffff;         /* card / page background */
  --ds-surface-sunken: #f3f4f6;  /* computed from DockMaster's --surface-sunken token
                                     (220 14% 96%); page chrome behind cards */
  --ds-surface-muted: #b7c6dc;   /* approximate: inactive segmented-tab fill and
                                     empty-state image-placeholder fill, sampled by eye */

  /* Borders / text */
  --ds-border: #e5e5e5;          /* computed from shadcn --border token (0 0% 89.8%) */
  --ds-text-muted: #666666;      /* computed from shadcn --muted-foreground (0 0% 40%) */

  /* Semantic */
  --ds-success: #2f9e6e;   /* approximate default: not observed in any DockMaster
                               screenshot; nearest plausible tone from their shadcn
                               chart palette (173 58% 39%). No verified marina-software
                               green exists in public DockMaster surfaces. */
  --ds-warning: var(--ds-gold);      /* DockMaster reuses the gold family for attention,
                                        not a separate warning hue; do the same */
  --ds-danger: #ef4444;              /* computed from shadcn --destructive (0 84.2% 60.2%) */
  --ds-danger-border-soft: #f3b4ac;  /* approximate: soft red outline seen framing the
                                        "Emergency Contact" box in the customer-detail
                                        screenshot; used as an outline, not a fill */

  /* Radii: DockMaster Web reads as a rounded-corner, card-forward UI */
  --ds-radius-sm: 6px;      /* buttons, badges */
  --ds-radius-md: 10px;     /* inputs, small panels */
  --ds-radius-lg: 14px;     /* cards */
  --ds-radius-pill: 9999px; /* segmented tab controls, toggles */

  /* Type */
  --ds-font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --ds-font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}
```

## Token table

| Token | Value | Role | Derived from |
|---|---|---|---|
| `--ds-navy` | `#161848` | Primary text, nav/sidebar, headings | Verbatim in `dockmaster.com` shipped CSS; cross-checked against its shadcn `--navy: 237 56% 18%` HSL token (converts to ~#141748, same neighborhood) and matches heading color in both product screenshots |
| `--ds-navy-light` | `#1e1e5a` | Secondary navy surfaces, hover | Verbatim in `dockmaster.com/products/dockmaster-web` and `/blu-voice-agent` CSS |
| `--ds-navy-dark` | `#0d0d2b` | Deep navy / near-black text | Verbatim across all three fetched marketing pages' CSS |
| `--ds-gold` | `#ffc844` | Highlight/attention accent | Verbatim in shipped CSS; also the border/tint color on the "Pinned Note" card in `dm-customer-details.png` |
| `--ds-gold-light` | `#ffe066` | Lighter gold fill (unused in shipped style.css so far) | Verbatim in shipped CSS |
| `--ds-gold-soft` | `#ffd87a` | Softest gold tint | Verbatim in shipped CSS |
| `--ds-gold-text` | `#b86614` (approx.) | Gold-on-light accessible text | Computed from `--gold-text: 30 80% 40%` HSL token, not visually confirmed |
| `--ds-surface` | `#ffffff` | Card/page background | Obvious from both product screenshots |
| `--ds-surface-sunken` | `#f3f4f6` (approx.) | Chrome behind cards | Computed from `--surface-sunken: 220 14% 96%` HSL token |
| `--ds-surface-muted` | `#b7c6dc` (approx., eyeballed) | Inactive tab fill, image placeholder | Sampled by eye from `dm-customer-details.png` / `dm-customer-portal.png` |
| `--ds-border` | `#e5e5e5` (approx.) | Card/input hairlines | Computed from shadcn `--border: 0 0% 89.8%` |
| `--ds-text-muted` | `#666666` (approx.) | Secondary/label text | Computed from shadcn `--muted-foreground: 0 0% 40%` |
| `--ds-success` | `#2f9e6e` (guessed default) | Success state (unused in shipped style.css so far) | **Not observed anywhere in public DockMaster surfaces.** Nearest plausible tone from their shadcn chart palette. Flagged as invented, not verified. |
| `--ds-warning` | = gold | Warning/attention (unused in shipped style.css so far) | DockMaster's own convention: gold is the attention color, there's no separate warning hue |
| `--ds-danger` | `#ef4444` (approx.) | Error/destructive | Computed from shadcn `--destructive: 0 84.2% 60.2%` |
| `--ds-danger-border-soft` | `#f3b4ac` (approx., eyeballed) | Outline-only danger box | Sampled by eye from the "Emergency Contact" box border in `dm-customer-details.png` |
| Radii | 6 / 10 / 14 / pill (px) | see above | Eyeballed from card/button/tab corners in both screenshots; base `--radius: 0.5rem` (8px) confirmed in shadcn tokens as the design system's default unit |
| Type | Inter | Body/heading font | `font-family:__Inter_f367f3`, the Next.js font-optimized Inter, confirmed in shipped CSS. Product screenshots' letterforms are consistent with Inter but this is visual judgment, not a confirmed in-app font declaration. Shipped `web/style.css` adds "Segoe UI" and Roboto as fallbacks. |

## Component notes (for Slipstream's receipts panel and approval cards)

**Nav / shell.** Left sidebar, white, ~230-260px wide. Small square logomark chip (navy background, rounded ~6px, white icon) sits top-left next to a two-line wordmark: bold product name over a smaller muted subtitle. Nav items are icon + label, single column, no nesting shown. Top bar is a plain breadcrumb trail (`Section > Record name`) plus a couple of icon-only utility buttons (search, theme toggle) right-aligned; no heavy top nav.

**Page header.** Bold navy H1 at large size, optional muted gray subtitle line directly under it, primary action (if any) right-aligned on the same row as the H1, not the breadcrumb.

**Cards.** White surface, ~14px radius, thin `1px` light-gray border, soft shadow, generous internal padding (~24px). Section labels *inside* cards are small-caps-style: uppercase, muted gray, letter-spaced, sitting above the field grid, e.g. "CONTACT INFORMATION", "SPECIFICATIONS". Fields render as label-over-value pairs in a two-column grid, label in muted gray small text, value in navy medium-weight text. This label pattern is the one to reuse verbatim for Slipstream's receipts panel line items.

**Segmented tabs.** Pill-shaped container, full-width, evenly split segments. Active segment: white fill, thin navy border/ring, navy text. Inactive segments: flat muted steel-blue fill (`--ds-surface-muted`), navy text, no border. This is a strong, distinctive DockMaster idiom, worth copying for any tabbed view in Slipstream (e.g. approval-card status filters).

**Buttons.** Primary/filled buttons use the **navy family**, not gold; gold is reserved for highlight/attention call-outs, never for calls-to-action. Filled buttons: navy fill, white text, small leading icon, ~6px radius. Secondary/outline buttons: white fill, thin gray border, navy text, same radius. Toggles (e.g. "Active" switch): pill track, filled when on.

**Highlight / callout cards.** The one place gold shows up inside the product: a "Pinned Note" card uses a pale gold-tinted background (`--ds-gold-soft`-ish) with a gold-toned left border/icon and a small pill badge in a matching gold tint. Use this exact pattern (pale gold wash + gold pill badge) for anything in Slipstream that needs to say "look at this" without implying an error, e.g. a flagged-but-not-failed receipt.

**Danger/attention outlines.** Rather than filling a box red, DockMaster outlines it: white background, soft red/coral border, normal navy text inside. Reserve a filled red only for the smallest elements (a badge dot, a destructive button), and use the soft outline for anything box-sized; an "Emergency Contact" field group is outlined this way in the customer-detail screenshot.

**Empty/placeholder states.** Flat muted steel-blue rectangle with a centered navy line-icon (a boat glyph for vessel photos, a person glyph for an avatar) and, further down, a centered icon + one line of gray text for zero-data states ("No documents uploaded yet"). Reuse this for Slipstream's receipts panel when there's nothing to show yet.

**Data tables:** not directly observed in the two available screenshots (both are record-detail views, not list/table views), so no table idiom to report with confidence. If a table view surfaces later, sample it before assuming striped rows vs. plain rows.

## Reference screenshots (in `artifacts/brand/`, gitignored scratch space)

These live outside version control (gitignored, machine-local), so they may be absent on a fresh clone; the token provenance above stands on its own.

- `dm-customer-details.png`: DockMaster Web customer record view: sidebar nav, breadcrumb header, pinned-note gold highlight card, segmented tabs (active/inactive states), soft-red-outline danger box, label-over-value field grid.
- `dm-customer-portal.png`: DockMaster Web *customer portal* (self-service) vessel view: filled navy primary button ("Send Message" / "Upload Document"), image-placeholder pattern with centered line-icon, empty-state pattern ("No documents uploaded yet"), same segmented-tab idiom in a second context.
- `dm-logo.webp`: DockMaster wordmark + ship/wake mark, for palette sampling only. **Not to be reproduced or echoed in Slipstream's own logo/marks**; sampled for its navy/light-blue tones only, per the identity guardrail above.

Also retained in the same directory for provenance (not images, but the source of the verified hex/HSL values above): `home.html`, `web.html`, `blu.html` (raw marketing-page HTML) and `next1.css`, `next2.css` (shipped Tailwind bundles containing the `--navy` / `--gold` / shadcn tokens).

## Do / don't

**Do**
- Use the navy family for all primary text, nav chrome, and filled action buttons.
- Reserve gold strictly for highlight/attention surfaces (pinned notes, flagged items), never for primary CTAs.
- Use the pill-segmented-tab pattern for any tabbed or filterable view.
- Use uppercase muted-gray section labels inside cards, exactly as DockMaster does.
- Outline (don't fill) box-sized danger/attention states; save filled red for tiny elements only.

**Don't**
- Don't use the DockMaster or Blu logo, wordmark, or ship/wake mark anywhere in Slipstream.
- Don't imply Slipstream *is* a DockMaster or Blu product: no co-branding, no "powered by" lockup, no borrowed marks.

**Attribution is not branding.** The seed data carries a `source` field on reservations and work orders (`blu_voice_agent`, `customer_portal`, `staff`), and the receipts panel names that channel: "Blu Voice Agent" on a record that arrived through it. That is a factual statement about where a row came from, and it is the whole point of the receipts panel: provenance the GM can check. Render it as a plain text chip in the navy/gold token family, never as a logo or a lockup. Saying "this booking came in via Blu" is honest; drawing Blu's mark on it is not.
- Don't invent a green "success" color with false confidence: `--ds-success` above is a guess, flagged as such; revisit if a real DockMaster success state ever surfaces.
- Don't treat the soft teal/pink/mauve hues found on the Blu marketing page as a real palette. They're one-off illustration accents, not brand tokens.
