/**
 * No-modifier transcript scroll passthrough for the focused questionnaire overlay.
 *
 * Pi's alt-screen TUI suppresses viewport-level wheel and page scrolling while a
 * capturing overlay owns focus (`shouldDeferViewportInputToOverlay`), and a wheel
 * sequence outside the overlay's rendered bounds never reaches its component. Once
 * the questionnaire is on screen the chat transcript behind it therefore stops
 * responding to the wheel and PageUp/PageDown. The dialog itself only uses
 * unmodified arrow/Tab keys, so these gestures can be forwarded to the primary
 * scroll view instead of dropped — no modifier required, dialog navigation intact.
 *
 * `TuiAltScreen` exposes the needed primitive as a public `scrollBy(lines)` method,
 * but it is not part of the `TUI` interface, so this module detects it structurally
 * and degrades to a no-op on hosts without it (regular/main-screen TUI, RPC hosts).
 */

/** Logical lines moved per wheel notch when the overlay forwards the gesture. */
export const WHEEL_SCROLL_LINES = 3;

export type TranscriptScrollUnit = "line" | "halfPage" | "page";

export type WheelDirection = -1 | 1;

export interface TranscriptScrollIntent {
	readonly unit: TranscriptScrollUnit;
	readonly direction: WheelDirection;
}

/** Structural view of the fullscreen TUI's scroll primitive plus the page-size source. */
export interface ScrollCapableTui {
	scrollBy?: (lines: number) => void;
	terminal?: { rows?: number };
}

/** Key names consulted on the host's keybindings manager for transcript scrolling. */
const SCROLL_KEYBINDINGS: ReadonlyArray<readonly [string, TranscriptScrollIntent]> = [
	["tui.altScreen.pageUp", { unit: "page", direction: -1 }],
	["tui.altScreen.pageDown", { unit: "page", direction: 1 }],
	["tui.altScreen.halfPageUp", { unit: "halfPage", direction: -1 }],
	["tui.altScreen.halfPageDown", { unit: "halfPage", direction: 1 }],
	["tui.altScreen.lineUp", { unit: "line", direction: -1 }],
	["tui.altScreen.lineDown", { unit: "line", direction: 1 }],
];

/**
 * Parse an SGR (`ESC [ < b ; x ; y M`) or legacy X10 (`ESC [ M c c c`) wheel
 * sequence. Mirrors pi-tui's own `parseWheelEvent` so the two never disagree on
 * which button codes are wheel events; non-wheel input returns `undefined`.
 */
export function parseWheelSequence(data: string): WheelDirection | undefined {
	const sgr = /^\x1b\[<(\d+);(\d+);(\d+)[Mm]$/.exec(data);
	if (sgr) return wheelDirection(Number.parseInt(sgr[1]!, 10));
	if (data.length === 6 && data.startsWith("\x1b[M")) return wheelDirection(data.charCodeAt(3) - 32);
	return undefined;
}

function wheelDirection(button: number): WheelDirection | undefined {
	// Bit 6 (value 64) marks wheel buttons; low bits 0/1 are up/down.
	if ((button & 64) === 0) return undefined;
	const direction = button & 3;
	if (direction === 0) return -1;
	if (direction === 1) return 1;
	return undefined;
}

/** Map a keypress to a transcript scroll intent via the host's alt-screen keybindings. */
export function matchTranscriptScrollKey(
	matches: (data: string, name: string) => boolean,
	data: string,
): TranscriptScrollIntent | undefined {
	for (const [name, intent] of SCROLL_KEYBINDINGS) {
		if (matches(data, name)) return intent;
	}
	return undefined;
}

/**
 * Resolve a semantic intent to a signed line delta. `visibleRows` is the transcript
 * area actually visible beside the dialog; when supplied it sizes page/half-page
 * scrolls so a page advances by the uncovered transcript height instead of the whole
 * terminal (which overshoots by the dialog's height).
 */
export function resolveScrollLines(
	intent: TranscriptScrollIntent,
	tui: ScrollCapableTui,
	visibleRows?: number,
): number {
	return intent.direction * scrollUnitLines(intent.unit, tui, visibleRows);
}

function scrollUnitLines(unit: TranscriptScrollUnit, tui: ScrollCapableTui, visibleRows?: number): number {
	if (unit === "line") return 1;
	const rows = visibleRows && visibleRows > 0 ? visibleRows : (tui.terminal?.rows ?? 24);
	if (unit === "halfPage") return Math.max(1, Math.floor(rows / 2));
	// Leave one row of overlap so the boundary line stays visible, matching Pi's page scroll.
	return Math.max(1, rows - 1);
}

/**
 * Scroll the alt-screen transcript by `lines`. Returns false when the host has no
 * scroll primitive (regular/main-screen TUI, RPC host), so callers can leave the
 * gesture unconsumed.
 */
export function scrollTranscript(tui: ScrollCapableTui, lines: number): boolean {
	if (lines === 0 || typeof tui.scrollBy !== "function") return false;
	tui.scrollBy(lines);
	return true;
}
