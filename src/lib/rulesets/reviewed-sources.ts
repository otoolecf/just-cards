// Reviewed paraphrases of Bicycle's rules; presets run through the same compiler as URLs.
export const reviewedSources = [
	{
		id: 'six-card-golf',
		name: 'Six Card Golf',
		text: `Six Card Golf. 2 to 4 players. Standard 52 card deck.
Each player is dealt 6 cards face down, in 2 rows of 3 in front of them. Turn 2 of these cards face up.
The remaining layout cards cannot be looked at. Draw a single card from stock or discard, then swap it for a layout card or discard it.
Replacements are face up. The round ends when one layout is entirely face up. Play nine deals; lowest total score wins.
Each ace counts 1 point. Each 2 counts minus 2 points. Each jack or queen scores 10 points. Each king scores zero points.
Numerals 3 to 10 score face value. Equal cards in the same column score zero points.`
	},
	{
		id: '500-rum',
		name: '500 Rum',
		text: `500 Rum. 2 to 7 players. Standard 52-card pack.
Deal seven cards to each player except in the two player game, in which each player receives 13 cards.
Meld matching sets of 3 or 4 or sequences of 3 or more cards of the same suit. Ace may be high or low; sequences cannot wrap.
Draw from stock or any card from the discard pile. Take all the cards above the selected card.
The selected card must immediately be used in a meld or layoff. After drawing but before discarding, players may lay down more melds or lay off onto existing melds.
Laid-off cards belong to their contributor. An empty hand immediately ends play.
Score table card values minus remaining hand card values. Reach 500 total net points; highest score wins.`
	}
];

export function reviewedSource(url: string) {
	const parsed = new URL(url);
	if (!['bicyclecards.com', 'www.bicyclecards.com'].includes(parsed.hostname)) return undefined;
	return reviewedSources.find(
		(source) => parsed.pathname.replace(/\/$/, '') === `/how-to-play/${source.id}`
	);
}
