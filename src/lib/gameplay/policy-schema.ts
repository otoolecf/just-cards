/** Small JSON Schema subset used by the executable contract. No executable model output. */
export interface JsonSchema {
	type?: string;
	description?: string;
	enum?: readonly unknown[];
	properties?: Record<string, JsonSchema>;
	required?: string[];
	additionalProperties?: false;
	items?: JsonSchema;
	anyOf?: JsonSchema[];
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	minItems?: number;
	maxItems?: number;
}
export const objectSchema = (
	properties: Record<string, JsonSchema>,
	description?: string
): JsonSchema => ({
	type: 'object',
	properties,
	required: Object.keys(properties),
	additionalProperties: false,
	...(description ? { description } : {})
});
export const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, { type: 'null' }] });
export const integer = (minimum: number, maximum: number, description?: string): JsonSchema => ({
	type: 'integer',
	minimum,
	maximum,
	description
});
export const textSchema = (description?: string): JsonSchema => ({
	type: 'string',
	minLength: 1,
	maxLength: 1200,
	description
});
export const arraySchema = (items: JsonSchema, maxItems = 64): JsonSchema => ({
	type: 'array',
	items,
	maxItems
});
const choice = (...values: string[]): JsonSchema => ({ type: 'string', enum: values });

/** Canonical policy, including primitive descriptions. Nullable fields are omitted in runtime storage. */
export const tableRulesSchema = objectSchema(
	{
		schemaVersion: choice('table-rules/v1'),
		players: objectSchema(
			{ min: integer(1, 8), max: integer(1, 8) },
			'Supported seats: layout/meld use one deck; patience requires one seat; contract requires four; shedding uses two decks from three seats.'
		),
		deal: objectSchema({
			cardsPerPlayer: integer(
				1,
				25,
				'Cards per hand for layout/meld (deal left of dealer); use 13 for contract, 6 for shedding, or the unused placeholder 1 for patience. Each capability defines its own stock/table setup.'
			),
			byPlayerCount: nullable(
				objectSchema(
					Object.fromEntries(
						Array.from({ length: 7 }, (_, i) => [String(i + 2), nullable(integer(1, 25))])
					),
					'Optional deal overrides by number of players.'
				)
			)
		}),
		layout: nullable(
			objectSchema(
				{ rows: integer(1, 5), columns: integer(1, 5), initialReveals: integer(0, 24) },
				'Mutually exclusive with meld: set meld=null. Requires roundEnd=all_revealed, discard.pickup=top and discard.immediateUse=false. Fixed face-down row-major grid. Each player chooses initial reveals. Draw then swap any slot (revealing it), or discard the drawn card without revealing another slot.'
			)
		),
		discard: objectSchema(
			{ pickup: choice('top', 'suffix'), immediateUse: { type: 'boolean' } },
			'top takes only the last discard; suffix takes the chosen card and all above it. immediateUse is only available with meld (false for grids); it requires that chosen card in a legal new meld or layoff in the same atomic action (including top pickups).'
		),
		meld: nullable(
			objectSchema(
				{
					minSet: integer(3, 4),
					maxSet: integer(3, 4),
					minRun: integer(3, 13),
					ace: choice('low', 'both')
				},
				'Mutually exclusive with layout: set layout=null and scoring.columnPairs=null. Requires roundEnd=empty_hand. Private hand. Sets match rank with distinct suits; runs use one suit and consecutive ranks. Aces low or low/high, never wrapping. Multiple melds and layoffs onto any player meld allowed after draw. Each card scores for its contributor. Discard ends turn; going out by melding also ends round.'
			)
		),
		tileMahjong: nullable(objectSchema({scoring:choice('hk-classical/v1'),flowers:{type:'boolean',enum:[false]},minFan:integer(0,3),maxFan:{type:'integer',enum:[10]},prevailingWinds:{type:'integer',enum:[1,4]},liability:{type:'boolean'}}, 'Four-seat tile capability: 136 tiles, no flowers. Complete four groups and pair or thirteen orphans; Hong Kong classical scoring. Everyone responds to discard claims; win > pung/kong > chow, equal wins nearest next seat. No timers. Minimum faan and one/four wind rotations are explicit. Liability applies on fourth meld or third dragon meld.')) ,
		patience: nullable(objectSchema({ columns: {type:'integer',enum:[7]}, draw:{type:'integer',enum:[1]}, recycle:{type:'boolean',enum:[true]} }, 'Single-player Klondike: descending alternating colors, empty King, suited A–K foundations, draw one and unlimited recycling.')),
		shedding: nullable(objectSchema({tableCards:{type:'integer',enum:[3]}, refill:{type:'integer',enum:[3]}, multiDeckFrom:{type:'integer',enum:[3]}, burnTen:{type:'boolean'}, resetTwo:{type:'boolean'}, forcePickupThree:{type:'boolean'}, lowSeven:{type:'boolean'}, fourBurn:{type:'boolean'}}, 'Hand then face-up then blind cards. Same-rank multiples, replenish three, mandatory legal play; pickup if unable. Ten burns and repeats; two resets; optional three forces next pickup/skip, seven requires next rank <=7. Four same ranks burn and pass. First out wins.')),
		contract: nullable(objectSchema({format:choice('rubber'), honors:{type:'boolean'}}, 'Four fixed partnership seats, full Bridge auction and follow-suit tricks. Declarer controls exposed dummy; rubber scoring with vulnerability, games, penalties and bonuses.')),
		roundEnd: choice('all_revealed', 'empty_hand', 'foundations_complete', 'empty_all', 'contract_complete', 'tile_win'),
		stockExhaustion: {
			...choice('end_round', 'recycle', 'continue'),
			description: 'end_round: layout/meld end after the turn that empties stock. recycle: patience recycles waste in order. continue: shedding/contract continue without stock.'
		},
		scoring: objectSchema(
			{
				zones: {
					...arraySchema(
						objectSchema({
							zone: choice('hand', 'meld'),
							multiplier: { type: 'integer', enum: [1, -1] }
						}),
						2
					),
					minItems: 0
				},
				columnPairs: nullable(
					integer(
						1,
						5,
						'Cancel equal ranks in each two-row column regardless of suit; column count must match layout.'
					)
				),
				lowWins: { type: 'boolean' },
				rounds: nullable(integer(1, 99, 'End game after this many rounds.')),
				target: nullable(
					integer(
						1,
						100000,
						'End when a total reaches or exceeds this target. Highest/lowest total wins according to lowWins; ties shared.'
					)
				)
			},
			'Each zone may appear once at most. Grid layouts score only the hand zone; do not add a meld zone when meld=null. Sum signed card values by zone at round end. All hands become visible; scores accumulate. all_revealed ends immediately after a completed turn reveals a whole player grid, without extra opponent turns.'
		)
	},
	'Choose exactly one capability: layout, meld, patience, shedding, contract, or tileMahjong. No jokers. New capabilities require empty scoring.zones: their outcome/contract scoring is independent of card values. Never approximate unsupported mechanics silently.'
);

export function validateSchema(value: unknown, schema: JsonSchema, path = '$'): void {
	if (schema.anyOf) {
		if (
			schema.anyOf.some((s) => {
				try {
					validateSchema(value, s, path);
					return true;
				} catch {
					return false;
				}
			})
		)
			return;
		throw new Error(`${path}: does not match an allowed value`);
	}
	if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}: unsupported value`);
	switch (schema.type) {
		case 'null':
			if (value !== null) throw new Error(`${path}: expected null`);
			break;
		case 'object': {
			if (!value || typeof value !== 'object' || Array.isArray(value))
				throw new Error(`${path}: expected object`);
			const obj = value as Record<string, unknown>;
			for (const key of schema.required ?? [])
				if (!(key in obj)) throw new Error(`${path}.${key}: required`);
			for (const [key, val] of Object.entries(obj)) {
				const child = schema.properties?.[key];
				if (!child) throw new Error(`${path}.${key}: unknown field`);
				validateSchema(val, child, `${path}.${key}`);
			}
			break;
		}
		case 'array':
			if (
				!Array.isArray(value) ||
				value.length < (schema.minItems ?? 0) ||
				value.length > (schema.maxItems ?? Infinity)
			)
				throw new Error(`${path}: invalid array`);
			value.forEach((v, i) => validateSchema(v, schema.items!, `${path}.${i}`));
			break;
		case 'string':
			if (
				typeof value !== 'string' ||
				value.length < (schema.minLength ?? 0) ||
				value.length > (schema.maxLength ?? Infinity)
			)
				throw new Error(`${path}: invalid text`);
			break;
		case 'boolean':
			if (typeof value !== 'boolean') throw new Error(`${path}: expected boolean`);
			break;
		case 'integer':
			if (
				!Number.isInteger(value) ||
				Number(value) < (schema.minimum ?? -Infinity) ||
				Number(value) > (schema.maximum ?? Infinity)
			)
				throw new Error(`${path}: invalid integer`);
			break;
		default:
			throw new Error(`Unsupported schema type at ${path}`);
	}
}
/** Fill omitted optional policy fields, preserving unknown keys so validation can reject them. */
export function toWire(value: unknown, schema: JsonSchema): unknown {
	if (schema.anyOf) return value == null ? null : toWire(value, schema.anyOf[0]);
	if (schema.type === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
		const result = { ...value } as Record<string, unknown>;
		for (const [key, child] of Object.entries(schema.properties ?? {}))
			result[key] = toWire(result[key], child);
		return result;
	}
	if (Array.isArray(value) && schema.items) return value.map((v) => toWire(v, schema.items!));
	return value;
}
export function omitNulls(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(omitNulls);
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, v]) => v !== null)
				.map(([k, v]) => [k, omitNulls(v)])
		);
	return value;
}
