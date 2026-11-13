import { DESIGN_COLOR_TOKENS as colors, DESIGN_TYPOGRAPHY_TOKENS as type } from '../ui/design-primitives';
import { handBand, winnerText, type ShareResult } from './results';

const WIDTH = 430, SCALE = 2, PAD = 28, HEADER = 224, FOOTER = 110;

export function resultImageLayout(result: ShareResult) {
	const startHand = Math.max(0, result.handCount - 36);
	const visibleHands = result.handCount - startHand;
	const rows = Math.max(1, Math.ceil(visibleHands / 9));
	const rowHeight = 38 + rows * 50 + 20;
	const width = WIDTH * SCALE;
	const height = (HEADER + result.players.length * rowHeight + FOOTER + (result.adjusted ? 24 : 0)) * SCALE;
	if (width * height > 8_000_000) throw new Error('This image would be too large. Share the plain text version instead.');
	return { width, height, startHand, visibleHands, rowHeight,
		handLabel: startHand ? `Hand scores · ${startHand + 1}–${result.handCount} of ${result.handCount}` : `Hand scores · ${result.handCount ? `1–${result.handCount}` : 'totals only'}` };
}

/** Paints only an allowlisted public snapshot; no DOM screenshots or remote assets. */
export async function renderResultImage(result: ShareResult, names = true, site = 'justcards.app'): Promise<File> {
	const layout = resultImageLayout(result);
	const canvas = document.createElement('canvas');
	canvas.width = layout.width; canvas.height = layout.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Image sharing is unavailable. Use the plain text version instead.');
	ctx.scale(SCALE, SCALE);
	const height = layout.height / SCALE, right = WIDTH - PAD;
	const font = (size: number, weight = 400) => { ctx.font = `${weight} ${size}px system-ui, sans-serif`; };
	const text = (value: string, x: number, y: number, color: string = colors.text, size: number = type.md, weight = 400, align: CanvasTextAlign = 'left', maxWidth?: number) => {
		ctx.fillStyle = color; font(size, weight); ctx.textAlign = align; ctx.fillText(value, x, y, maxWidth);
	};
	const fit = (value: string, width: number, size: number, weight = 400) => {
		font(size, weight);
		if (ctx.measureText(value).width <= width) return value;
		const chars = Array.from(value);
		while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
		return chars.join('') + '…';
	};
	const box = (x: number, y: number, w: number, h: number, fill: string) => {
		ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
	};
	const divider = (y: number) => { ctx.strokeStyle = colors.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(right, y); ctx.stroke(); };
	ctx.fillStyle = colors.surface; ctx.fillRect(0, 0, WIDTH, height);
	text('♣ Just Cards', PAD, 46, colors.brand, type.lg, 700);
	text(fit(result.gameName, WIDTH - PAD * 2, type.lg, 700), PAD, 89, colors.text, type.lg, 700);
	text(`Final · ${result.handCount} ${result.handCount === 1 ? 'hand' : 'hands'} · ${result.lowWins ? 'Lower' : 'Higher'} wins`, PAD, 115, colors.textMuted, type.sm);
	let winner = winnerText(result, names);
	if (winner.length > 55) winner = result.players.filter(player => player.rank === 1).length > 1 ? 'Shared victory!' : result.partnerships ? 'Winning partnership!' : 'Winner!';
	text(winner, WIDTH / 2, 168, colors.brand, type.xl, 700, 'center', WIDTH - PAD * 2);
	text(layout.handLabel, PAD, 204, colors.textMuted, type.sm);
	const tileWidth = (WIDTH - PAD * 2 - 8 * 5) / 9;
	const bands = {
		best: { fill: colors.brand, ink: colors.textOnBrand },
		middle: { fill: colors.brandSoft, ink: colors.text },
		last: { fill: colors.surfaceMuted, ink: colors.textMuted },
		tied: { fill: colors.surfaceElevated, ink: colors.textMuted }
	};
	result.players.forEach((player, index) => {
		const top = HEADER + index * layout.rowHeight;
		text(String(player.rank), PAD, top + 24, colors.textMuted, type.sm);
		const color = player.rank === 1 ? colors.brand : colors.text;
		text(fit(names ? player.name : player.anonymousName, WIDTH - PAD * 2 - 176, type.lg, 700), PAD + 28, top + 24, color, type.lg, 700);
		text(String(player.total), right - 26, top + 24, color, type.xl, 700, 'right', 110);
		text('pts', right, top + 24, colors.textMuted, type.xs, 400, 'right');
		player.hands.slice(layout.startHand).forEach((value, i) => {
			const hand = layout.startHand + i;
			const peers = result.players.map(other => other.hands[hand]).filter((score): score is number => score !== null);
			const band = value === null ? bands.tied : bands[handBand(peers, value, result.lowWins)];
			const x = PAD + (i % 9) * (tileWidth + 5), y = top + 38 + Math.floor(i / 9) * 50;
			box(x, y, tileWidth, 44, band.fill);
			text(value === null ? '—' : String(value), x + tileWidth / 2, y + 28, band.ink, type.md, 700, 'center', tileWidth - 6);
		});
		if (index < result.players.length - 1) divider(top + layout.rowHeight - 7);
	});
	const foot = HEADER + result.players.length * layout.rowHeight + 8;
	(['best', 'middle', 'last', 'tied'] as const).forEach((band, i) => {
		const x = PAD + i * 91;
		box(x, foot, 15, 19, bands[band].fill);
		text(['Best', 'Middle', 'Last', 'All tied'][i], x + 21, foot + 15, colors.textMuted, type.xs);
	});
	if (result.adjusted) text('Totals include adjustments.', PAD, foot + 45, colors.textMuted, type.sm);
	divider(height - 47);
	text(site, right, height - 22, colors.textMuted, type.sm, 400, 'right', WIDTH - PAD * 2);
	const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to create the image. Use plain text instead.')), 'image/png'));
	const slug = result.gameName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'game';
	return new File([blob], `just-cards-${slug}-results.png`, { type: 'image/png' });
}
