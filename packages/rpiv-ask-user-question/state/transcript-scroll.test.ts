import { describe, expect, it, vi } from "vitest";
import {
	matchTranscriptScrollKey,
	parseWheelSequence,
	resolveScrollLines,
	type ScrollCapableTui,
	scrollTranscript,
	WHEEL_SCROLL_LINES,
} from "./transcript-scroll.js";

describe("parseWheelSequence", () => {
	it("parses SGR wheel up/down", () => {
		expect(parseWheelSequence("\x1b[<64;10;5M")).toBe(-1);
		expect(parseWheelSequence("\x1b[<65;10;5M")).toBe(1);
	});

	it("parses legacy X10 wheel up/down", () => {
		// button 96 = 64 | 32, direction up; button 97 = down
		expect(parseWheelSequence(`\x1b[M${String.fromCharCode(96 + 32)}  `)).toBe(-1);
		expect(parseWheelSequence(`\x1b[M${String.fromCharCode(97 + 32)}  `)).toBe(1);
	});

	it("ignores non-wheel buttons and malformed input", () => {
		expect(parseWheelSequence("\x1b[<0;10;5M")).toBeUndefined();
		expect(parseWheelSequence("\x1b[<32;10;5M")).toBeUndefined();
		expect(parseWheelSequence("\x1b[<66;10;5M")).toBeUndefined();
		expect(parseWheelSequence("a")).toBeUndefined();
		expect(parseWheelSequence("\x1b[A")).toBeUndefined();
	});
});

describe("matchTranscriptScrollKey", () => {
	const bound = (entries: Record<string, string>) => (data: string, name: string) => entries[name] === data;

	it("maps the alt-screen page/line bindings to intents", () => {
		const matches = bound({
			"tui.altScreen.pageUp": "pgup",
			"tui.altScreen.pageDown": "pgdn",
			"tui.altScreen.halfPageUp": "halfup",
			"tui.altScreen.halfPageDown": "halfdown",
			"tui.altScreen.lineUp": "lineup",
			"tui.altScreen.lineDown": "linedown",
		});
		expect(matchTranscriptScrollKey(matches, "pgup")).toEqual({ unit: "page", direction: -1 });
		expect(matchTranscriptScrollKey(matches, "pgdn")).toEqual({ unit: "page", direction: 1 });
		expect(matchTranscriptScrollKey(matches, "halfup")).toEqual({ unit: "halfPage", direction: -1 });
		expect(matchTranscriptScrollKey(matches, "halfdown")).toEqual({ unit: "halfPage", direction: 1 });
		expect(matchTranscriptScrollKey(matches, "lineup")).toEqual({ unit: "line", direction: -1 });
		expect(matchTranscriptScrollKey(matches, "linedown")).toEqual({ unit: "line", direction: 1 });
	});

	it("returns undefined for unbound keys", () => {
		expect(matchTranscriptScrollKey(() => false, "x")).toBeUndefined();
	});
});

describe("resolveScrollLines", () => {
	const tui: ScrollCapableTui = { terminal: { rows: 40 } };

	it("scales page units from the viewport height and leaves one row of overlap", () => {
		expect(resolveScrollLines({ unit: "page", direction: 1 }, tui)).toBe(39);
		expect(resolveScrollLines({ unit: "page", direction: -1 }, tui)).toBe(-39);
		expect(resolveScrollLines({ unit: "halfPage", direction: 1 }, tui)).toBe(20);
		expect(resolveScrollLines({ unit: "line", direction: 1 }, tui)).toBe(1);
	});

	it("uses the uncovered transcript height for pages when supplied", () => {
		// A 20-row transcript area beside the dialog: page is 19, not the 40-row terminal.
		expect(resolveScrollLines({ unit: "page", direction: 1 }, tui, 20)).toBe(19);
		expect(resolveScrollLines({ unit: "halfPage", direction: 1 }, tui, 20)).toBe(10);
		expect(resolveScrollLines({ unit: "line", direction: 1 }, tui, 20)).toBe(1);
	});

	it("ignores a non-positive visible height override", () => {
		expect(resolveScrollLines({ unit: "page", direction: 1 }, tui, 0)).toBe(39);
	});

	it("falls back to a usable page size when the terminal reports no rows", () => {
		expect(resolveScrollLines({ unit: "page", direction: 1 }, {})).toBe(23);
	});
});

describe("scrollTranscript", () => {
	it("forwards to the fullscreen scroll primitive and reports success", () => {
		const scrollBy = vi.fn();
		expect(scrollTranscript({ scrollBy }, 3)).toBe(true);
		expect(scrollBy).toHaveBeenCalledWith(3);
	});

	it("is a no-op when the host has no primitive or the delta is zero", () => {
		expect(scrollTranscript({}, 3)).toBe(false);
		const scrollBy = vi.fn();
		expect(scrollTranscript({ scrollBy }, 0)).toBe(false);
		expect(scrollBy).not.toHaveBeenCalled();
	});

	it("uses a three-line notch", () => {
		expect(WHEEL_SCROLL_LINES).toBe(3);
	});
});
