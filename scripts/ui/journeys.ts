// Journey definitions as data: the demo run sheet (docs/DEMO.md) replayed in a
// real browser so screenshots can be critiqued. Steps are declarative so a
// journey reads like the demo script and new moments cost one line, not code.
//
// Two targets exist because one journey deliberately breaks the provider:
// 'main' is the real server, 'brokenProvider' points at a dead endpoint so the
// error state gets captured instead of imagined.

export type Target = 'main' | 'brokenProvider';

export type Step =
  // Navigation and viewport
  | { action: 'goto'; target?: Target }
  | { action: 'resize'; width: number; height: number; note?: string }
  // Composite conversation moves — what the demo actually does
  | { action: 'ask'; text: string; timeoutMs?: number }
  | { action: 'briefing'; timeoutMs?: number }
  // Primitives, for edge cases that must not wait for a well-formed reply
  | { action: 'type'; text: string }
  | { action: 'submit' }
  | { action: 'click'; selector: string }
  | { action: 'waitForReply'; timeoutMs?: number }
  | { action: 'wait'; ms: number }
  | { action: 'expandReceipts' }
  | { action: 'screenshot'; name: string; fullPage?: boolean };

export interface Journey {
  name: string;
  description: string;
  /** Default viewport. The projector check resizes mid-journey instead. */
  viewport?: { width: number; height: number };
  steps: Step[];
}

// Reply waits are generous on purpose: a cold gpt-oss:20b takes 30-60s to load
// before the first token, and a timeout here reads as a UI bug in the critique.
const REPLY_TIMEOUT = 180_000;

export const JOURNEYS: Journey[] = [
  {
    name: 'first-run-briefing',
    description: 'Cold load, morning briefing, receipts expanded, projector check',
    steps: [
      { action: 'goto' },
      { action: 'screenshot', name: 'cold-load' },
      { action: 'briefing' },
      { action: 'screenshot', name: 'briefing-reply' },
      { action: 'expandReceipts' },
      { action: 'screenshot', name: 'receipts-expanded', fullPage: true },
      // Demo moment 1 is shown on a projector; 1280x720 is the room's floor.
      { action: 'resize', width: 1280, height: 720, note: 'projector' },
      { action: 'screenshot', name: 'projector-1280x720' },
    ],
  },
  {
    name: 'core-qa',
    description: 'The three markdown-heavy answers: money, capacity, overnight',
    steps: [
      { action: 'goto' },
      { action: 'ask', text: "How much completed work haven't we billed yet?" },
      { action: 'screenshot', name: 'unbilled' },
      { action: 'ask', text: 'Can we keep up with the haul-out schedule over the next three weeks?' },
      { action: 'screenshot', name: 'haul-out' },
      { action: 'ask', text: 'Anything come in overnight?' },
      { action: 'screenshot', name: 'overnight-blu' },
      // The Blu provenance gap is a receipts-panel problem, so capture it open.
      { action: 'expandReceipts' },
      { action: 'screenshot', name: 'receipts-after-three-turns', fullPage: true },
    ],
  },
  {
    name: 'approval-gate',
    description: 'Draft invoices, approve, confirm the number moved; then reject',
    steps: [
      { action: 'goto' },
      { action: 'ask', text: "How much completed work haven't we billed yet?" },
      { action: 'screenshot', name: 'unbilled-before' },
      // Reject first, then approve. Order matters: approving invoices all the
      // unbilled work, so a reject pass afterwards would have nothing to draft
      // and no card to click. Invoice state is per-server-boot (store.ts reads
      // the seed at import, nothing writes back), so each run starts clean.
      { action: 'ask', text: 'Draft invoices for all the unbilled completed work.' },
      { action: 'screenshot', name: 'drafts-card' },
      { action: 'click', selector: '.approval-card .reject' },
      { action: 'wait', ms: 1000 },
      { action: 'screenshot', name: 'rejected' },
      // Reload before the approve pass. Asking twice in one conversation lets
      // the model reply "I already drafted those" instead of calling the tool
      // again — a fresh page clears client history while the server keeps the
      // un-created drafts, so there is reliably a card to approve.
      { action: 'goto' },
      { action: 'ask', text: 'Draft invoices for all the unbilled completed work.' },
      { action: 'screenshot', name: 'drafts-card-second-pass' },
      { action: 'click', selector: '.approval-card .approve' },
      { action: 'wait', ms: 2000 },
      { action: 'screenshot', name: 'approved' },
      { action: 'ask', text: "How much completed work haven't we billed yet?" },
      { action: 'screenshot', name: 'unbilled-after' },
    ],
  },
  {
    name: 'edges',
    description: 'Empty submit, double-send, long input, huge receipt, provider down',
    steps: [
      { action: 'goto' },
      // Submitting nothing: the Ask button is disabled while the input is
      // empty, so this presses Enter instead — the path still reachable — and
      // captures the dimmed button as the explanation for why nothing happens.
      { action: 'submit' },
      { action: 'screenshot', name: 'empty-submit' },
      // Double-send: an impatient second question lands while the first is
      // still in flight. Retyping is required — submit clears the input, so
      // two bare submits would no-op instead of reproducing the race.
      { action: 'type', text: 'How many slips are vacant?' },
      { action: 'submit' },
      { action: 'type', text: 'How many slips are vacant?' },
      { action: 'submit' },
      { action: 'screenshot', name: 'double-send-inflight' },
      { action: 'waitForReply', timeoutMs: REPLY_TIMEOUT },
      { action: 'screenshot', name: 'double-send-settled' },
      {
        action: 'ask',
        text:
          'I need a complete operational picture before the owners meeting, so please walk through ' +
          'every work order that is currently open, who it belongs to, which technician is assigned, ' +
          'what parts it is waiting on, when it was promised, how far past that promise it now sits, ' +
          'and what it would cost us if the customer walked away over it — and be thorough.',
      },
      { action: 'screenshot', name: 'long-question', fullPage: true },
      // The parts list is the biggest tool result: worst case for the panel.
      { action: 'ask', text: 'Which jobs are blocked waiting on parts? Flag any high-priority ones.' },
      { action: 'expandReceipts' },
      { action: 'screenshot', name: 'huge-receipt-expanded', fullPage: true },
      { action: 'goto', target: 'brokenProvider' },
      { action: 'ask', text: "How much completed work haven't we billed yet?", timeoutMs: 60_000 },
      { action: 'screenshot', name: 'provider-down' },
    ],
  },
];
