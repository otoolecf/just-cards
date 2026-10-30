import type { TableRules } from './table-rules';

export interface PlayGuideSection {
	title: string;
	steps: string[];
}
/** Player-facing instructions follow the room's rules, including saved house rules. */
export function buildPlayGuide(
	r: TableRules,
	values: Record<string, number>,
): PlayGuideSection[] {
	const section = (title: string, ...steps: string[]): PlayGuideSection => ({
		title,
		steps,
	});
 if(r.tileMahjong){const p=r.tileMahjong;return [
 section('Your goal','Build four groups and a pair. A group is three consecutive numbers in one suit, three identical tiles, or a declared group of four identical tiles. Winds and dragons cannot make sequences.',`Your hand must also earn at least ${p.minFan} faan (scoring points). The app offers a win only when both shape and value qualify. Thirteen orphans is a special winning hand; seven pairs is not enabled.`),
 section('Your tiles and turns','This preset uses 136 tiles: four copies of each numbered tile, wind and dragon. No flowers or jokers. The dealer starts with 14 tiles; everyone else gets 13.','On your turn, draw from the wall, then select a tile to discard. The dealer starts by discarding. Turn order follows the seats East, South, West, North. Guided mode explains each available action.'),
 section('Claiming a discard','Everyone gets time to respond. Choose a legal claim or Pass. Only the next player may claim a sequence (chow). Anyone may claim three matching tiles (pung), four matching tiles (kong), or a winning tile.','A win beats a matching group, which beats a sequence. If multiple people can win, the nearest player after the discarder wins this hand. The order in which phones respond never decides.','Claimed groups stay on the table. After a sequence or triplet, discard without drawing. You cannot immediately discard an equivalent tile to exchange that claimed group.'),
 section('Four matching tiles','A declared quad counts as one group, and you draw a replacement from the back of the wall. You may declare four tiles from your hand or add a fourth tile to your exposed triplet after drawing.','Other players may win using a tile that extends a triplet, before your replacement draw. A concealed quad can only be robbed for thirteen orphans. All declared quad faces are visible, but their concealed status is retained for scoring.'),
 section('Building a valuable hand','Dragon triplets and your seat/round wind triplets earn 1 faan each. All sequences, a fully concealed hand, self draw, a quad replacement, robbing a quad and drawing the last wall tile each earn 1. Declared concealed quads do not qualify for the concealed-hand bonus in this preset.','All triplets and one suit with honors earn 3 faan each; one suit without honors earns 7. Small dragons adds 3 plus the dragon triplets; big dragons adds 5 plus the three dragon triplets. Only terminals and honors adds 1 to an all-triplets hand.','All honors, all terminals, small/big winds, four concealed triplets (no quads; discard may complete only the pair), four quads, thirteen orphans, nine gates, heavenly/earthly hands, and winning after consecutive quad replacements reach the 10-faan limit. Nine gates on a discard requires the original nine-way wait. Bonuses stack, capped at 10.'),
 section('Scoring and finishing',`Payments use Hong Kong classical scoring. For 3–10 faan, each opponent pays 16, 32, 48, 64, 96, 128, 192 or 256 on a self draw. A discarder alone pays twice the listed amount. ${p.minFan<3?'For practice hands of 0/1/2 faan, the base amounts are 2/4/8.':''}`,p.liability?'Liability: feeding the fourth declared group or third dragon group makes that player pay all three shares if the recipient later self-draws. A newer liability replaces the older one. Discard wins are still paid only by the final discarder.':'Liability is disabled; self-draw payments are shared by all opponents.','An empty wall ends the hand as a draw after the last discard responses. The dealer stays after winning; otherwise the dealer moves, including after a draw.',`After ${p.prevailingWinds} full wind rotation${p.prevailingWinds===1?'':'s'}, the highest total wins. Keep seats fixed; use private recovery links when replacing a player. Physical scorekeeping uses the same scorer and payment rules.`)
 ];}
	if (r.patience)
		return [
			section(
				'Your goal',
				'Move all 52 cards into the four Foundation piles. Each pile holds one suit (♣, ♦, ♥ or ♠), starting with Ace, then 2, 3, and so on up to King.',
			),
			section(
				'Moving cards',
				'The seven columns are your working area. Stack cards one number lower and in the opposite color: for example, a red 6 goes on a black 7. J, Q and K come after 10.',
				'Tap a face-up card, then tap the destination: “To 3” moves it to column 3. Cards below the one you tapped move with it. Only a King (with or without cards below it) can fill an empty column. A newly uncovered card turns over automatically.',
				'To start a Foundation pile, tap an Ace, then a “Foundation” button. Add the next card of the same suit the same way. You can also move the top Foundation card back to a column.',
			),
			section(
				'Getting more cards',
				'Tap “Draw one” to turn over the next card from the draw pile. It appears in “Waste” — the pile of drawn cards. Only its top card is available to move.',
				'When the draw pile is empty, tap “Recycle waste” to turn the remaining drawn cards over and go through them again. You can do this as often as you like.',
			),
			section(
				'Scoring and finishing',
				'All 52 cards in the Foundation piles wins the deal and scores 1 point. If you want to stop, open “Stuck?” and tap “Concede deal”; that scores 0. “Play again” starts a new shuffled deal.',
				'Made a mistake? Open “Table controls” and choose “Undo last play”. Not every shuffled deal can be won.',
			),
		];
	if (r.shedding) {
		const s = r.shedding;
		const special: string[] = [];
		if (s.resetTwo)
			special.push(
				'2: Play it on anything. The next player can play any card on it.',
			);
		if (s.forcePickupThree)
			special.push(
				'3: The next player takes the whole pile into their hand and misses their turn. A 3 still has to follow the usual equal-or-higher rule, or the rule for playing on a 7 when enabled.',
			);
		if (s.lowSeven)
			special.push(
				`7: The next play must be 7 or lower. After that, the usual equal-or-higher rule returns.${s.resetTwo || s.burnTen ? ` ${[s.resetTwo ? '2' : '', s.burnTen ? '10' : ''].filter(Boolean).join(' and ')} can still be played on anything.` : ''}`,
			);
		if (s.burnTen)
			special.push(
				'10: Play it on anything to remove the entire pile from the game. You play again on an empty pile.',
			);
		if (s.fourBurn)
			special.push(
				'Four matching cards in a row at the top of the pile remove the pile from the game. The next player starts a new pile, unless a 10 gives you another turn.',
			);
		return [
			section(
				'Your goal',
				'Be the first to get rid of all your cards: the ones in your hand, the face-up cards on the table, and finally the face-down cards.',
			),
			section(
				'Before playing',
				`Choose ${s.tableCards} of your ${r.deal.cardsPerPlayer} hand cards and tap “Place three face up”. These stay on the table for later. Your ${s.tableCards} face-down cards stay hidden, even from you. Everyone must choose before play starts.`,
			),
			section(
				'On your turn',
				'Play a card equal to or higher than the top card of the pile. Ace is highest. Special cards can change this rule (see below). On an empty pile, any card works.',
				'Tap a card, or several cards with the same number or letter, then tap “Play selected”. If none of your available cards can be played, tap “Pick up pile”. Taking the pile ends your turn.',
				`While the draw pile has cards, your hand automatically refills to ${s.refill} after a play. Once it is empty, finish your hand, then use your face-up cards, then your face-down cards.`,
				'Tap “Reveal blind card” to try a face-down card. If it cannot be played, you take it and the whole pile into your hand. Finish those hand cards before trying another face-down card.',
			),
			...(special.length
				? [section('Special cards in this game', ...special)]
				: []),
			section(
				'Scoring and finishing',
				'The first player with no cards left wins the deal and scores 1 point. The deal stops then; the others score 0. The host can tap “Play again” for a new deal.',
			),
		];
	}
	if (r.contract)
		return [
			section(
				'Your goal',
				'Play in two teams: seats 1 and 3 are partners; seats 2 and 4 are partners. A trick is one card from each player. The strongest card wins that trick for its team. Each deal has 13 tricks.',
			),
			section(
				'First, bid for a target',
				'On your turn, use “Level” and “Strain”, then tap “Bid”, or choose “Pass”. Strain means the suit that will be trump (the strongest suit), or “No trump” if no suit gets that advantage.',
				'The level promises six tricks plus that number: 1 means 7 tricks, 2 means 8, up to 7 meaning all 13. A higher level beats a lower bid. At the same level, the order is clubs, diamonds, hearts, spades, then no trump.',
				'“Double” challenges the other team’s bid and raises the points at stake. “Redouble” raises them again when your own team has been doubled. Three passes after a bid end bidding. Four opening passes end the deal without a score.',
			),
			section(
				'Then, play the cards',
				'The final bid is the contract — the winning team’s target. The first person on that team who bid its final suit (or no trump) is the declarer. Their partner is called dummy.',
				'The player to the declarer’s left plays first. After that first card, dummy’s whole hand is shown to everyone. The declarer taps cards for both their own hand and dummy’s hand, each at its turn. Dummy watches.',
				'Tap a card to play it. You must play the same suit as the first card of the trick if you have one; unavailable choices are disabled. If you have none, you may play any card.',
				'The highest trump wins. With no trumps played, the highest card of the suit that started the trick wins. Ace is highest. Whoever wins starts the next trick.',
			),
			section(
				'Scoring and finishing',
				`After all 13 tricks, the app calculates the contract points, extra tricks, penalties, doubles and bonuses${r.contract.honors ? ', including honors (certain high cards held together in one hand)' : ''}. You do not need to enter points.`,
				'Making contracts builds your team’s game progress. Reach 100 contract points to win a game; progress then resets for both teams. A team that has won a game is “vulnerable”, which changes later bonuses and penalties.',
				'The first team to win two games ends the match (called a rubber). The higher total score wins. Tap “Deal next round” between deals. Ending the room early does not add bonuses for an unfinished rubber.',
			),
		];
	const scoring = r.scoring;
	const finish = `${scoring.lowWins ? 'Lowest' : 'Highest'} total wins${scoring.rounds ? ` after ${scoring.rounds} rounds` : scoring.target ? ` when someone reaches ${scoring.target} points` : ''}.`;
	const valueText = Object.entries(values)
		.map(([rank, value]) => `${rank} = ${value}`)
		.join(', ');
	const end = section('Scoring and finishing');
	if (r.layout) {
		end.steps.push(
			'The round ends as soon as one player has all their cards face up. Any remaining hidden cards are revealed and scored.',
		);
		if (scoring.columnPairs)
			end.steps.push(
				'Two cards with the same number or letter in the same column count as 0 together. Their suits do not matter.',
			);
	} else end.steps.push('The round ends as soon as someone has no cards left.');
	for (const z of scoring.zones)
		end.steps.push(
			`${z.zone === 'hand' ? 'Cards left in your hand' : 'Cards you played in groups on the table (including cards added to someone else’s group)'} ${z.multiplier === 1 ? 'add to' : 'subtract from'} your score.`,
		);
	if (valueText) end.steps.push(`Card points: ${valueText}.`);
	end.steps.push(
		'If the draw pile runs out, finish the current turn, then score the round.',
		finish,
		'The app adds up everyone’s points automatically.',
	);
	if (r.layout)
		return [
			section(
				'Your goal',
				`Finish with the ${scoring.lowWins ? 'lowest' : 'highest'} total score. Your cards sit in ${r.layout.rows} rows of ${r.layout.columns}.`,
			),
			section(
				'Before playing',
				`Tap ${r.layout.initialReveals} of your face-down cards to turn them over. Everyone does this before the first turn.`,
			),
			section(
				'On your turn',
				'Tap “Draw from stock” for an unknown card, or tap the top card in the discard pile to take that visible card.',
				'Then tap one of your own card positions to replace it with the card you took. The replacement stays face up; the old card goes onto the discard pile.',
				'If you do not want the card you took, tap “Discard drawn card” instead. That ends your turn without changing your own cards.',
			),
			end,
		];
	const m = r.meld!;
	const deal =
		[
			`Start with ${r.deal.cardsPerPlayer} cards each`,
			...Object.entries(r.deal.byPlayerCount ?? {}).map(
				([n, c]) => `${c} cards with ${n} players`,
			),
		].join('; ') + '.';
	return [
		section(
			'Your goal',
			`Put cards into matching groups on the table to ${scoring.lowWins ? 'lower' : 'build'} your score. ${deal}`,
		),
		section(
			'What counts as a group?',
			`A group (called a meld) is either ${m.minSet === m.maxSet ? m.minSet : `${m.minSet}–${m.maxSet}`} cards of the same number or letter in different suits, or at least ${m.minRun} cards in order in the same suit. For example: ${[
				'♣',
				'♦',
				'♥',
				'♠',
			]
				.slice(0, m.minSet)
				.map((suit) => `8${suit}`)
				.join(' ')}, or ${[
				'A',
				'2',
				'3',
				'4',
				'5',
				'6',
				'7',
				'8',
				'9',
				'10',
				'J',
				'Q',
				'K',
			]
				.slice(0, m.minRun)
				.map((rank) => `${rank}♥`)
				.join(' ')}.`,
			`Aces can come ${m.ace === 'both' ? 'before 2 or after King' : 'before 2 only'}. You cannot go around the end: K–A–2 is not allowed.`,
		),
		section(
			'On your turn',
			'First take a card: tap “Draw from stock”, or choose a card in the discard pile.',
			r.discard.pickup === 'suffix'
				? 'Taking a discard also takes every card above it — all the newer discards.'
				: 'Only the top card of the discard pile can be taken.',
			r.discard.immediateUse
				? 'You must use the chosen discard immediately in a group. Select the hand cards that go with it, then tap “Pick up & play new meld”, or “Pick up & add here” beside an existing group.'
				: 'A discard joins your hand. You can play it this turn or keep it for later.',
			'To put a new group on the table, tap its cards in your hand, then “Play new meld”. Those cards are now played and visible to everyone.',
			'To extend an existing group, select the cards to add and tap “Add to this meld” beside that group. This is called laying off. You may add to any player’s group, and your added cards score for you.',
			'You can play several groups or add cards to several groups in one turn. Finish by selecting one hand card and tapping “Discard selected”. If you use your last card, the round ends without another discard.',
		),
		end,
	];
}
