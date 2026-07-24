// Per-slide topic icons for the reading (detail) view, feeding DockMaster's own
// "icon chip beside the section title" idiom back into the deck. Keyed by slide
// filename. Line-icons, currentColor so the chip controls the tone. Kept simple
// so they read at chip size. The diagram slide has no icon (it is already a
// picture).
const S = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

export const SLIDE_ICONS = {
  '01-brief-and-method.md': `<svg viewBox="0 0 24 24" ${S}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M8 10h8M8 14h8M8 18h5"/></svg>`,
  '02-criteria.md': `<svg viewBox="0 0 24 24" ${S}><path d="M4 7h9M4 12h9M4 17h9"/><path d="M15.5 7l1.8 1.8L21 5"/></svg>`,
  '03-candidates.md': `<svg viewBox="0 0 24 24" ${S}><path d="M4 5h16l-6 7v6l-4 2v-8L4 5z"/></svg>`,
  '04-product-shape.md': `<svg viewBox="0 0 24 24" ${S}><rect x="4" y="14" width="4" height="6" rx="1"/><rect x="10" y="9" width="4" height="11" rx="1"/><rect x="16" y="4" width="4" height="16" rx="1"/></svg>`,
  '05-build-vs-partner.md': `<svg viewBox="0 0 24 24" ${S}><path d="M12 20v-5M12 15l-5-5V5M12 15l5-5V5"/><circle cx="7" cy="4.5" r="1.6"/><circle cx="17" cy="4.5" r="1.6"/><circle cx="12" cy="20" r="1.6"/></svg>`,
  '06-architecture-trust.md': `<svg viewBox="0 0 24 24" ${S}><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M8 7l8 0M7 8l4 8M17 8l-4 8"/></svg>`,
  '07-demo.md': `<svg viewBox="0 0 24 24" ${S}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M10 8l4.5 2.5L10 13z" fill="currentColor" stroke="none"/><path d="M8 21h8"/></svg>`,
  '08-gtm.md': `<svg viewBox="0 0 24 24" ${S}><path d="M4 4v16h16"/><path d="M7 15l3.5-4 3 2 5.5-6"/></svg>`,
  '09-expand-metrics.md': `<svg viewBox="0 0 24 24" ${S}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
  '10-honesty.md': `<svg viewBox="0 0 24 24" ${S}><path d="M12 3l7 3v5c0 4.2-3 7.3-7 8.4C8 18.3 5 15.2 5 11V6l7-3z"/><path d="M9 11.5l2 2 4-4"/></svg>`,
  '11-appendix-decisions.md': `<svg viewBox="0 0 24 24" ${S}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>`,
};
