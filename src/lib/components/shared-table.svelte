<script lang="ts">
	import { onMount } from 'svelte';
	import PlayGuide from './play-guide.svelte';
	import {
		canMeldCards,
		findMeld,
		sortHand,
		reconcileHandOrder,
		moveHandCard,
		layoffBlockReason,
		type HandOrder
	} from '$lib/gameplay/table-presentation';
	import { goto } from '$app/navigation';
	import { rememberRoom, forgetRoom } from '$lib/gameplay/recent-rooms';
	import { dev } from '$app/environment';
	import type { RoomView, RoomMutation } from '$lib/server/room-service';
	import type { TableCommand, VisibleCard } from '$lib/gameplay/table-engine';
	import RoomControls from './room-controls.svelte';
 import ScoreButton from './score-button.svelte';
	import CardTile from './card-tile.svelte';
 import CapabilityTable from './capability-table.svelte';
	export let code: string;
	let room: RoomView | null = null,
		token = '',
		name = '',
		error = '',
		notice = '',
		connection = 'Connecting…',
		busy = false;
	let handOrder: HandOrder = 'dealt';
	let manualOrder: string[] = [];
	let arranging = false,
		movingCard = '';
	let arrangeNotice = '';
	let confirmingEnd = false;
 let recoveryToken='', recoveryRequest='', recoveryName='';
	let selected: string[] = [],
		pickupId = '';
	let stopped = false,
		reading = false;
	let socket: WebSocket | null = null;
	let retryAt = 0,
		backoff = 1000,
		lastMessage = 0;
	function connectSocket() {
		if (dev || stopped || !room?.selfId || socket || Date.now() < retryAt) return;
		const url = new URL(`/api/rooms/${code}/socket`, location.href);
		url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
		const ws = new WebSocket(url, ['jc-room-v1', `seat.${token}`]);
		socket = ws;
		ws.onopen = () => {
			backoff = 1000;
			lastMessage = Date.now();
			connection = 'Live';
		};
		ws.onmessage = (event) => {
			lastMessage = Date.now();
			if (event.data === 'pong') return;
			try {
				const message = JSON.parse(event.data);
				if (message.type === 'view' && !stopped) accept(message.room);
			} catch {
				ws.close();
			}
		};
		ws.onclose = () => {
			if (socket === ws) socket = null;
			if (!stopped) {
				connection = 'Reconnecting…';
				retryAt = Date.now() + backoff;
				backoff = Math.min(15000, backoff * 2);
				void refresh();
			}
		};
		ws.onerror = () => ws.close();
	}
	const suits = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
	const label = (c: VisibleCard) => (c.rank ? `${c.rank}${c.suit ? suits[c.suit] : ''}` : 'Hidden');
	$: table = room?.table;
	$: self = room?.selfId ?? '';
	$: myTurn = Boolean(table && table.players[table.turn] === self && !room?.paused && !room?.seats.find(s=>s.id===self)?.away);
 $: historySeats=room?[...room.seats,...room.pastSeats]:[];
	$: mine = table?.hands[self] ?? [];
	$: ended = table?.stage === 'round_end' || table?.stage === 'game_end';
	$: pickupIndex = table?.discard.findIndex((c) => c.id === pickupId) ?? -1;
	$: orderedMine = room?.rules.layout ? mine : sortHand(mine, handOrder, manualOrder);
	$: movingIndex = orderedMine.findIndex((c) => c.id === movingCard);
	$: pickupCards = pickupIndex >= 0 ? table!.discard.slice(pickupIndex) : [];
	$: choice = [...mine, ...pickupCards].filter((c) => selected.includes(c.id) || c.id === pickupId);
	$: legalMeld = room?.rules.meld ? canMeldCards(choice, room.rules.meld) : false;
	$: suggested = room?.rules.meld
		? findMeld([...mine, ...pickupCards], room.rules.meld, pickupId || undefined)
		: undefined;
	$: turnName = room?.seats.find((s) => s.id === table?.players[table.turn])?.name ?? '';
	$: additional=Boolean(room?.rules.patience||room?.rules.shedding||room?.rules.contract);
 $: instruction = additional ? (room?.paused?'Paused — use Table controls to continue.':ended?'Deal complete':table?.stage==='setup'?'Choose your starting face-up cards.':`Current turn: ${turnName}`) : room?.paused ? 'Paused — use Table controls to continue.' : arranging
		? 'Arrange your hand, then tap Done arranging to play.'
		: table?.stage === 'setup'
			? mine.filter((c) => c.faceUp).length < (room?.rules.layout?.initialReveals ?? 0)
				? `Choose ${room?.rules.layout?.initialReveals} starting cards to reveal.`
				: 'Waiting for everyone to reveal their starting cards.'
			: ended
				? table?.stage === 'game_end'
					? 'Game complete'
					: 'Round complete — scores saved'
				: !myTurn
					? `Waiting for ${turnName}.`
					: table?.stage === 'draw'
						? 'Your turn: draw from the stock or discard pile.'
						: room?.rules.layout
							? 'Tap a position to swap, or discard your drawn card.'
							: 'Play a new meld or add cards to a table meld. Discard one card to finish your turn.';

	function accept(next: RoomView) {
		if (!room || next.revision >= room.revision) {
			const changed = room?.revision !== next.revision;
			room = next;
			if (next.rules.meld && next.table && next.selfId) {
				manualOrder = reconcileHandOrder(next.table.hands[next.selfId] ?? [], manualOrder);
				if (!manualOrder.includes(movingCard)) movingCard = '';
				persistHandOrder();
			}
			if (next.closed || next.table?.stage === 'round_end' || next.table?.stage === 'game_end')
				arranging = false;
			if (changed) {
				selected = [];
				pickupId = '';
			}
		}
		connection = socket?.readyState === WebSocket.OPEN ? 'Live' : 'Connected';
		if (next.closed) {
			confirmingEnd = false;
			forgetRoom(localStorage, code);
		} else if (next.selfId)
			rememberRoom(localStorage, {
				code,
				name: next.name,
				player: next.seats.find((s) => s.id === next.selfId)?.name ?? '',
				updatedAt: Date.now()
			});
		connectSocket();
	}
	async function refresh() {
		if (stopped || reading || busy) return;
		reading = true;
		try {
			const response = await fetch(`/api/rooms/${code}`, {
				headers: { authorization: `Bearer ${token}` },
				cache: 'no-store'
			});
			const next = (await response.json()) as RoomView & { error?: string };
			if (!response.ok) throw new Error(next.error);
			if (!stopped) accept(next);
		} catch (e) {
			connection = 'Reconnecting…';
			if (!room) error = e instanceof Error ? e.message : 'Could not open room';
		} finally {
			reading = false;
		}
	}
	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(`jc-hand-order-${code}`) ?? 'null');
			if (saved && ['dealt', 'rank', 'suit', 'manual'].includes(saved.order)) {
				handOrder = saved.order;
				manualOrder = Array.isArray(saved.ids)
					? saved.ids.filter((id: unknown) => typeof id === 'string').slice(0, 52)
					: [];
			}
		} catch {
			/* A saved presentation preference must never block joining. */
		}
		token = localStorage.getItem(`jc-seat-${code}`) ?? crypto.randomUUID();
		localStorage.setItem(`jc-seat-${code}`, token);

  const fragment=new URLSearchParams(location.hash.slice(1));
  if(fragment.has('recover')) {
   recoveryToken=fragment.get('recover') ?? '';recoveryRequest=crypto.randomUUID();
   history.replaceState(history.state,'',location.pathname+location.search);
   sessionStorage.setItem(`jc-recovery-${code}`,JSON.stringify({token:recoveryToken,requestId:recoveryRequest}));
  } else {
   try {const pending=JSON.parse(sessionStorage.getItem(`jc-recovery-${code}`) ?? 'null');if(pending){recoveryToken=pending.token;recoveryRequest=pending.requestId;recoveryName=pending.name ?? '';}}catch{/* Ignore invalid recovery draft. */}
  }
  void refresh();
  const timer = setInterval(() => {
			if (socket?.readyState !== WebSocket.OPEN) void refresh();
		}, 1000);
		const heartbeat = setInterval(() => {
			if (socket?.readyState === WebSocket.OPEN) {
				if (Date.now() - lastMessage > 40000) socket.close();
				else socket.send('ping');
			}
		}, 15000);
		const resume = () => {
			if (!document.hidden) void refresh();
		};
		document.addEventListener('visibilitychange', resume);
		return () => {
			stopped = true;
			clearInterval(timer);
			clearInterval(heartbeat);
			document.removeEventListener('visibilitychange', resume);
			socket?.close();
		};
	});
	async function mutate(input: RoomMutation):Promise<boolean> {
		if (busy) return false;
		busy = true;
		error = '';
		notice = '';
		const originalRound = table?.round;
		try {
			for (let attempt = 0; attempt < 2; attempt++) {
				const response = await fetch(`/api/rooms/${code}`, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						authorization: `Bearer ${token}`
					},
					body: JSON.stringify(input)
				});
				const result = (await response.json()) as RoomView & { error?: string };
				if (
					response.status === 409 &&
					attempt === 0 &&
					input.type === 'command' &&
					input.command.type === 'reveal'
				) {
					// Different seats may choose their opening cards simultaneously. Rebase
					// only an unapplied reveal in the same setup; never retry a turn action.
					const latest = await fetch(`/api/rooms/${code}`, {
						headers: { authorization: `Bearer ${token}` },
						cache: 'no-store'
					});
					if (latest.ok) {
						const next = (await latest.json()) as RoomView;
						accept(next);
						const hand = next.table?.hands[next.selfId ?? ''];
						if (
							next.table &&
							next.table.round === originalRound &&
							next.table.stage === 'setup' &&
							hand?.[input.command.slot]?.faceUp === false &&
							hand.filter((c) => c.faceUp).length < (next.rules.layout?.initialReveals ?? 0)
						) {
							input = { ...input, revision: next.revision, requestId: crypto.randomUUID() };
							continue;
						}
					}
				}
				if (!response.ok) throw new Error(result.error);
				accept(result);
				selected = [];
				pickupId = '';
				return true;
			}
   return false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Connection lost. Refreshing the table.';
   return false;
		} finally {
			busy = false;
			void refresh();
		}
	}
	function command(command: TableCommand) {
		if (room && !room.paused && !room.seats.find(s=>s.id===self)?.away)
			void mutate({
				type: 'command',
				command,
				revision: room.revision,
				requestId: crypto.randomUUID()
			});
	}
	function deal(type: 'start' | 'next_round' | 'new_game') {
		if (room)
			void mutate({
				type,
				revision: room.revision,
				requestId: crypto.randomUUID()
			});
	}
	async function endGame() {
		if (!room) return;
		await mutate({ type: 'end_game', revision: room.revision, requestId: crypto.randomUUID() });
	}
	async function leaveClosedRoom() {
		forgetRoom(localStorage, code);
		await goto('/play');
	}
	async function lobbyAction(type: 'leave' | 'remove_seat', seatId?: string) {
		if (!room) return;
		await mutate(
			type === 'leave'
				? { type, revision: room.revision, requestId: crypto.randomUUID() }
				: { type, seatId: seatId!, revision: room.revision, requestId: crypto.randomUUID() }
		);
		if (!error && type === 'leave') {
			if(!room.paused) forgetRoom(localStorage, code);
			await goto('/play');
		}
	}
	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id];
	}
	function chooseCard(card: VisibleCard, slot: number) {
		if (arranging) {
			if (!movingCard || movingCard === card.id) movingCard = movingCard ? '' : card.id;
			else {
				moveCardTo(slot);
				movingCard = '';
			}
		} else if (table?.stage === 'setup') command({ type: 'reveal', slot });
		else if (room?.rules.layout) command({ type: 'swap', slot });
		else toggle(card.id);
	}
	function pickup(cardId: string) {
		if (room?.rules.discard.immediateUse) {
			pickupId = cardId;
			selected = [];
		} else command({ type: 'draw', source: 'discard', cardId });
	}
	function persistHandOrder() {
		try {
			localStorage.setItem(
				`jc-hand-order-${code}`,
				JSON.stringify({ order: handOrder, ids: manualOrder })
			);
		} catch {
			/* Arranging remains usable when browser storage is unavailable. */
		}
	}
	function toggleArranging() {
		if (!arranging) {
			manualOrder = orderedMine.map((c) => c.id);
			handOrder = 'manual';
		}
		arranging = !arranging;
		movingCard = '';
		selected = [];
		pickupId = '';
		arrangeNotice = '';
		persistHandOrder();
	}
	function moveCardTo(destination: number) {
		if (!arranging || !movingCard) return;
		manualOrder = moveHandCard(
			orderedMine.map((c) => c.id),
			movingCard,
			destination
		);
		handOrder = 'manual';
		arrangeNotice = `Card moved to position ${destination + 1}.`;
		persistHandOrder();
	}
	function suggest() {
		selected = suggested?.filter((id) => id !== pickupId) ?? [];
	}
	function meld(meldId?: string) {
		if (pickupId)
			command({
				type: 'draw',
				source: 'discard',
				cardId: pickupId,
				meldCardIds: [...new Set([pickupId, ...selected])],
				...(meldId ? { meldId } : {})
			});
		else if (meldId) command({ type: 'layoff', cardIds: selected, meldId });
		else command({ type: 'meld', cardIds: selected });
	}

 async function recover() {
  sessionStorage.setItem(`jc-recovery-${code}`,JSON.stringify({token:recoveryToken,requestId:recoveryRequest,name:recoveryName}));
  if(await mutate({type:'recover',recoveryToken,requestId:recoveryRequest,...(recoveryName.trim()?{name:recoveryName.trim()}:{})})) {
   recoveryToken='';sessionStorage.removeItem(`jc-recovery-${code}`);notice='Seat recovered. Your previous phone can no longer control it.';
  }
 }
 async function dismissRecovery(){recoveryToken='';sessionStorage.removeItem(`jc-recovery-${code}`);}
	async function copyInvite() {
		try {
			await navigator.clipboard.writeText(`${location.origin}/play/room/${code}`);
			notice = 'Invite link copied.';
		} catch {
			notice = `Share this room code: ${code}`;
		}
	}
</script>

<main class="shared-table">
	<header class="table-header">
		<div>
			<a class="home-link" href="/play">Just Cards</a>
			<h1>{room?.name ?? 'Opening table…'}</h1>
		</div>
		<a class="home-link" href="/">Score</a>
	</header>
	<div class="room-strip">
		<p>Room <strong data-testid="room-code">{code}</strong></p>
		<ScoreButton onPress={copyInvite}>Copy invite</ScoreButton><span class="jc-subtle"
			>{connection}</span
		>
	</div>
	{#if error}<p class="jc-status-error" role="alert">{error}</p>{/if}
	{#if notice}<p role="status">{notice}</p>{/if}

 {#if recoveryToken && room && !room.closed}<section class="jc-panel lobby-panel" aria-label="Recover a seat">
  <h2>Recover a seat</h2><p>This private link transfers a player's cards and score to this phone. The previous phone will lose access.</p>
  <label for="recovery-name">Replacement player's name (optional)</label><input class="jc-control" id="recovery-name" maxlength="30" bind:value={recoveryName} />
  <div class="action-row"><ScoreButton disabled={busy} onPress={recover}>Recover my seat</ScoreButton><ScoreButton onPress={dismissRecovery}>Dismiss link</ScoreButton></div>
 </section>{/if}
 {#if room && self && !room.closed}<RoomControls {room} {busy} {mutate} onLeave={()=>lobbyAction('leave')} />{/if}
	{#if room && !room.closed && self === room.hostId}
		{#if confirmingEnd}
			<section class="jc-panel lobby-panel" aria-label="End game confirmation">
				<p>
					End this game for everyone? Completed round scores stay saved. An unfinished round won’t
					count.
				</p>
				<div class="action-row">
					<ScoreButton disabled={busy} onPress={endGame}>End game for everyone</ScoreButton>
					<ScoreButton disabled={busy} onPress={() => (confirmingEnd = false)}
						>Keep playing</ScoreButton
					>
				</div>
			</section>
		{:else}
			<ScoreButton disabled={busy} onPress={() => (confirmingEnd = true)}>End game</ScoreButton>
		{/if}
	{/if}
	{#if room?.closed}
		<section class="jc-panel results" aria-live="polite">
			<h2>Game ended</h2>
			<p>
				The host closed this game. Completed round scores are saved; any unfinished round was not
				scored.
			</p>
			{#if table?.scores.length}
				<table>
					<thead><tr><th>Player</th><th>Saved total</th></tr></thead>
					<tbody
						>{#each historySeats as seat}<tr
								><th>{seat.name}</th><td>{table.totals[seat.id] ?? 0}</td></tr
							>{/each}</tbody
					>
				</table>
			{/if}
			<div class="action-row">
				<ScoreButton onPress={leaveClosedRoom}>Leave room</ScoreButton>
				<ScoreButton variant="primary" onPress={leaveClosedRoom}>Create new room</ScoreButton>
			</div>
		</section>
	{/if}
	{#if room && !self && !room.closed}
		<section class="jc-panel lobby-panel">
			<h2>Join this table</h2>
			{#if !room.canJoin}<p>
					New players can join between rounds when a seat is available. To recover an existing seat, use your original browser or a private link from your host.
				</p>
			{:else}<form on:submit|preventDefault={() => mutate({ type: 'join', name })}>
					<label for="join-name">Your name</label><input
						id="join-name"
						class="jc-control"
						bind:value={name}
						required
						maxlength="30"
					/><ScoreButton type="submit" variant="primary" disabled={busy || !name.trim()}
						>Join room</ScoreButton
					>
				</form>{/if}
		</section>
	{/if}
	{#if room}
		<section class="seats" aria-label="Players">
			{#each room.seats as seat}<div
					class="jc-panel seat"
					class:active={table?.players[table.turn] === seat.id && !ended && !room.closed}
				>
					<strong>{seat.name}</strong><span class="jc-subtle"
						>{seat.id === self ? 'You' : seat.id === room.hostId ? 'Host' : ''}</span
					>
					{#if (!room.started || ended) && !room.closed && self === room.hostId && seat.id !== self}<ScoreButton
							disabled={busy}
							onPress={() => lobbyAction('remove_seat', seat.id)}>Remove {seat.name}</ScoreButton
						>{/if}
					<span class="jc-subtle">{seat.away?'Away':seat.connection==='online'?'Connected':seat.connection==='offline'?'Disconnected':'Present'}</span>
					{#if table}<span
							>{table.patience?`${table.patience.foundations.reduce((n,p)=>n+p.length,0)} / 52 home`:`${table.hands[seat.id]?.length ?? 0} cards`} · {table.totals[seat.id] ?? 0} pts</span
						>{/if}
				</div>{/each}
		</section>
		{#if self && !room.started && !room.closed}<section class="jc-panel lobby-panel">
				<h2>Gather around</h2>
				{#if room.seats.length > 1}<ScoreButton disabled={busy} onPress={() => lobbyAction('leave')}
						>Leave lobby</ScoreButton
					>{/if}
				<p>
					Share the invite and deal when everyone has joined. {room.rules.players.min}–{room.rules
						.players.max} players.
				</p>
				{#if self === room.hostId}<ScoreButton
						variant="primary"
						disabled={busy || room.paused || room.seats.length < room.rules.players.min}
						onPress={() => deal('start')}>Deal cards</ScoreButton
					>{:else}<p>Waiting for the host to deal.</p>{/if}
			</section>{/if}
	{/if}
	{#if room && table && !room.closed}
		<section class="turn-banner" aria-live="polite">
			<span
				>Round {table.round}{room.rules.scoring.rounds
					? ` of ${room.rules.scoring.rounds}`
					: ''}</span
			><strong>{instruction}</strong>
		</section>
		{#if ended}
			<section class="jc-panel results">
				<h2>{table.stage === 'game_end' ? 'Final scores' : 'Round scores'}</h2>
				{#if table.winners.length}<p>
						Winner: {historySeats
							.filter((s) => table?.winners.includes(s.id))
							.map((s) => s.name)
							.join(' & ')}
					</p>{/if}
				<table>
					<thead><tr><th>Player</th><th>This round</th><th>Total</th></tr></thead><tbody
						>{#each historySeats as seat}<tr
								><th>{seat.name}</th><td>{table.scores.at(-1)?.[seat.id] ?? '—'}</td><td
									>{table.totals[seat.id]}</td
								></tr
							>{/each}</tbody
					>
				</table>
				{#if self === room.hostId && table.stage === 'game_end'}<ScoreButton
						variant="primary"
						disabled={busy || room.paused || room.seats.length < room.rules.players.min}
						onPress={() => deal('new_game')}>Play again</ScoreButton
					>{/if}
				{#if self === room.hostId && table.stage === 'round_end'}<ScoreButton
						variant="primary"
						disabled={busy || room.paused || room.seats.length < room.rules.players.min}
						onPress={() => deal('next_round')}>Deal next round</ScoreButton
					>{/if}
			</section>
		{/if}
		{#if additional}<CapabilityTable {room} {busy} onCommand={command}/>{:else}
		<section class="piles" aria-label="Card piles">
			<div class="jc-panel pile stock">
				<h2>Stock</h2>
				<p class="jc-subtle">{table.stockCount} cards · face down</p>
				<ScoreButton
					variant="primary"
					disabled={room.paused || busy || arranging || !myTurn || table.stage !== 'draw' || !table.stockCount}
					onPress={() => command({ type: 'draw', source: 'stock' })}
					>Draw from stock ({table.stockCount})</ScoreButton
				>
			</div>
			<div class="jc-panel pile">
				<h2>Discard pile</h2>
				<p class="jc-subtle">
					{room.rules.discard.pickup === 'suffix'
						? 'Oldest → newest. Pick a card and take everything after it.'
						: 'Top card'}
				</p>
				<div class="card-row discard-row">
					{#each room.rules.discard.pickup === 'suffix' ? table.discard : table.discard.slice(-1) as card, i}<CardTile
							{card}
							label={`Pick up ${label(card)}`}
							selected={pickupCards.some((c) => c.id === card.id)}
							disabled={room.paused || busy || arranging || !myTurn || table.stage !== 'draw'}
							onPress={() => pickup(card.id)}
						/>{/each}
				</div>
				{#if !table.discard.length}<p class="jc-subtle">No discards yet</p>{/if}
			</div>
		</section>
		{#if pickupId}<section class="jc-panel pickup">
				<h2>Use your pickup</h2>
				<p>
					Select cards from your hand to use the first card below in a meld or layoff. You also take
					the other {Math.max(0, pickupCards.length - 1)} cards.
				</p>
				<div class="card-row">
					{#each pickupCards as card}<CardTile
							{card}
							selected={card.id === pickupId || selected.includes(card.id)}
							disabled={room.paused || busy || card.id === pickupId}
							onPress={() => toggle(card.id)}
						/>{/each}
				</div>
				<div class="action-row">
					<ScoreButton variant="primary" disabled={room.paused || busy || !legalMeld} onPress={() => meld()}
						>Pick up &amp; play new meld</ScoreButton
					><ScoreButton
						onPress={() => {
							pickupId = '';
							selected = [];
						}}>Cancel pickup</ScoreButton
					>
				</div>
			</section>{/if}
		<section class="jc-panel hand-panel">
			<div class="section-heading">
				<h2>{room.rules.layout ? 'Your layout' : 'Your hand'}</h2>
				<span class="jc-subtle">{mine.length} cards</span>
			</div>
			{#if room.rules.meld}
				<p class="jc-subtle">
					Starting hand: {room.rules.deal.byPlayerCount?.[room.seats.length] ??
						room.rules.deal.cardsPerPlayer} cards each for {room.seats.length} players.
				</p>
				<p class="jc-subtle">
					Drawing adds cards; playing or discarding removes them. A discard pickup may add several
					cards.
				</p>
				<p class="jc-subtle">
					<strong>Play new meld</strong> puts a complete group from your hand onto the table.
					<strong>Add to this meld</strong> extends a group already on the table.
				</p>
			{/if}
			{#if room.rules.meld}<div class="hand-tools">
					<label for="hand-order">Sort hand</label>
					<select
						id="hand-order"
						class="jc-control"
						value={handOrder}
						disabled={arranging}
						on:change={(event) => {
							handOrder = event.currentTarget.value as HandOrder;
							persistHandOrder();
						}}
						><option value="dealt">As dealt</option><option value="rank">Rank</option><option
							value="suit">Suit</option
						><option value="manual">My order</option></select
					>
					<ScoreButton disabled={room.paused || busy || ended} onPress={toggleArranging}
						>{arranging ? 'Done arranging' : 'Arrange hand'}</ScoreButton
					>
					<ScoreButton
						disabled={room.paused || busy ||
							arranging ||
							!myTurn ||
							ended ||
							(table.stage !== 'play' && !pickupId) ||
							!suggested}
						onPress={suggest}>Find a meld</ScoreButton
					>
				</div>{/if}
			{#if arranging}
				<p class="jc-subtle">
					Tap a card, then its destination, or drag it. Arranging only changes your view.
				</p>
				<div class="action-row">
					<ScoreButton disabled={movingIndex <= 0} onPress={() => moveCardTo(movingIndex - 1)}
						>Move left</ScoreButton
					>
					<ScoreButton
						disabled={movingIndex < 0 || movingIndex >= orderedMine.length - 1}
						onPress={() => moveCardTo(movingIndex + 1)}>Move right</ScoreButton
					>
				</div>
				<p class="jc-subtle" role="status">
					{arrangeNotice ||
						(movingCard
							? 'Choose a destination or use Move left / Move right.'
							: 'Select a card to move.')}
				</p>
			{/if}
			{#if table.pending?.card && myTurn}<div class="drawn" data-testid="drawn-card">
					<p>Drawn card</p>
					<CardTile card={table.pending.card} /><ScoreButton
						disabled={room.paused || busy}
						onPress={() => command({ type: 'discard' })}>Discard drawn card</ScoreButton
					>
				</div>{/if}
			<div
				class:card-grid={Boolean(room.rules.layout)}
				class="card-row your-cards"
				style={`--columns:${room.rules.layout?.columns ?? 3}`}
				data-testid="my-hand"
			>
				{#each orderedMine as card, i}<CardTile
						{card}
						label={`Your card ${i + 1}: ${label(card)}`}
						selected={arranging ? movingCard === card.id : selected.includes(card.id)}
						draggable={arranging && !busy && !ended}
						onDragStart={() => (movingCard = card.id)}
						onDropCard={() => {
							moveCardTo(i);
							movingCard = '';
						}}
						disabled={room.paused || busy ||
							ended ||
							(!arranging &&
								(table.stage === 'setup'
									? card.faceUp ||
										mine.filter((c) => c.faceUp).length >= room.rules.layout!.initialReveals
									: !myTurn ||
										(room.rules.layout
											? table.stage !== 'play'
											: table.stage !== 'play' && !pickupId)))}
						onPress={() => chooseCard(card, i)}
					/>{/each}
			</div>
			{#if room.rules.meld && choice.length > 0 && !ended}<p aria-live="polite" class="jc-subtle">
					{legalMeld
						? 'Valid meld selected.'
						: 'Select a complete group for a new meld, or cards to add to a table meld below.'}
				</p>{/if}
			{#if !room.rules.layout && !ended}<div class="action-row">
					<ScoreButton
						disabled={room.paused || busy || arranging || !myTurn || table.stage !== 'play' || !legalMeld}
						onPress={() => meld()}>Play new meld</ScoreButton
					><ScoreButton
						variant="primary"
						disabled={room.paused || busy ||
							arranging ||
							!myTurn ||
							table.stage !== 'play' ||
							selected.length !== 1}
						onPress={() => command({ type: 'discard', cardId: selected[0] })}
						>Discard selected</ScoreButton
					>
				</div>{/if}
		</section>
		{#if room.rules.layout || ended}<section class="opponents" aria-label="Other player cards">
				{#each room.seats.filter((s) => s.id !== self) as seat}<div class="jc-panel opponent">
						<h2>{seat.name}'s {room.rules.layout ? 'layout' : 'remaining cards'}</h2>
						<div
							class="card-row"
							class:card-grid={Boolean(room.rules.layout)}
							style={`--columns:${room.rules.layout?.columns ?? 3}`}
						>
							{#each table.hands[seat.id] as card}<CardTile
									{card}
									label={`${seat.name}: ${label(card)}`}
								/>{/each}
						</div>
					</div>{/each}
			</section>{/if}
		{#if room.rules.meld}<section class="jc-panel meld-panel">
				<h2>Table melds</h2>
				<p class="jc-subtle">
					These cards have been played face up for everyone. After drawing on your turn, select
					cards from your hand and add them to a matching meld. Your added cards score for you.
				</p>
				{#if !table.melds.length}<p class="jc-subtle">
						Melds and layoffs will appear here for everyone.
					</p>{/if}
				{#each table.melds as meldGroup}
					{@const blocked = layoffBlockReason({
						stage: table.stage,
						myTurn,
						arranging,
						pickup: Boolean(pickupId),
						selected: choice,
						meld: meldGroup.cards,
						policy: room.rules.meld
					})}
					<div class="meld-group">
						<div class="card-row">
							{#each meldGroup.cards as card}<div class="owned-card">
									<CardTile {card} /><small
										>{room.seats.find((s) => s.id === card.ownerId)?.name}</small
									>
								</div>{/each}
						</div>
						<ScoreButton
							disabled={room.paused || busy || Boolean(blocked)}
							describedBy={`layoff-${meldGroup.id}`}
							onPress={() => meld(meldGroup.id)}
							>{pickupId ? 'Pick up & add here' : 'Add to this meld'}</ScoreButton
						>
						<p id={`layoff-${meldGroup.id}`} class="jc-subtle" aria-live="polite">
							{blocked || 'Selected cards can be added to this meld.'}
						</p>
					</div>{/each}
			</section>{/if}
	{/if}
	{/if}
	{#if room && table?.scores.length}<details class="jc-panel history-panel">
			<summary>Round history</summary>
			<div class="history-scroll">
				<table>
					<thead
						><tr
							><th>Round</th>{#each historySeats as seat}<th>{seat.name}</th>{/each}</tr
						></thead
					>
					<tbody
						>{#each table.scores as scores, i}<tr
								><th>{i + 1}</th>{#each historySeats as seat}<td>{scores[seat.id] ?? '—'}</td
									>{/each}</tr
							>{/each}</tbody
					>
				</table>
			</div>
		</details>{/if}
	{#if room}<details class="jc-panel history-panel">
			<summary>How to play</summary>
            <PlayGuide rules={room.rules} cardValues={room.cardValues} />
        </details>{/if}

	{#if room?.diagnostics.length && !additional}<details>
			<summary>Rules and defaults</summary>{#each room.diagnostics as line}<p>
					{line}
				</p>{/each}
		</details>{/if}
</main>

<style>
	.hand-tools {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		margin: 12px 0;
	}
	.hand-tools select {
		width: auto;
	}
	.history-panel {
		padding: 16px;
		margin-top: 16px;
	}
	.history-scroll {
		overflow-x: auto;
	}
	.history-panel summary {
		min-height: 44px;
		cursor: pointer;
		font-weight: 700;
	}
	.shared-table {
		max-width: 1040px;
		margin: auto;
		padding: 16px 12px 48px;
	}
	.table-header,
	.room-strip,
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	.home-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--jc-brand);
		font-weight: 700;
	}
	h1 {
		font-size: clamp(1.5rem, 5vw, 2.2rem);
		margin: 0;
	}
	h2 {
		font-size: var(--jc-type-lg);
		margin: 0 0 8px;
	}
	p {
		margin: 8px 0 14px;
	}
	.room-strip {
		margin: 10px 0 20px;
		font-size: var(--jc-type-sm);
	}
	.seats {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}
	.seat {
		padding: 10px 14px;
		display: grid;
		gap: 2px;
		min-width: 100px;
	}
	.seat.active {
		border: 2px solid var(--jc-brand);
		background: var(--jc-brand-soft);
	}
	.seat span {
		font-size: var(--jc-type-sm);
	}
	.lobby-panel,
	.results,
	.pile,
	.hand-panel,
	.opponent,
	.meld-panel,
	.pickup {
		padding: 18px;
		min-width: 0;
	}
	.lobby-panel form {
		display: grid;
		gap: 12px;
		max-width: 350px;
	}
	.turn-banner {
		display: grid;
		gap: 4px;
		background: var(--jc-brand-soft);
		padding: 16px;
		border-radius: 12px;
		margin: 16px 0;
	}
	.turn-banner span {
		font-size: var(--jc-type-sm);
	}
	.piles {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 12px;
		margin: 16px 0;
	}
	.stock {
		align-content: start;
	}
	.card-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.discard-row {
		flex-wrap: nowrap;
		overflow-x: auto;
		padding: 4px 3px 10px;
	}
	.card-grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(44px, 1fr));
		max-width: 360px;
		gap: 10px;
	}
	.hand-panel {
		margin: 16px 0;
	}
	.your-cards {
		margin: 16px 0;
	}
	.drawn {
		display: flex;
		gap: 12px;
		align-items: center;
		flex-wrap: wrap;
		padding: 12px;
		background: var(--jc-surface-muted);
		border-radius: 12px;
	}
	.drawn p {
		margin: 0;
	}
	.opponents {
		display: grid;
		gap: 12px;
	}
	.action-row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		margin-top: 14px;
	}
	.owned-card {
		display: grid;
		gap: 4px;
		text-align: center;
	}
	.owned-card small {
		max-width: 70px;
		overflow-wrap: anywhere;
		color: var(--jc-text-muted);
	}
	.meld-panel {
		margin-top: 16px;
	}
	.meld-group {
		display: grid;
		gap: 12px;
		padding: 16px 0;
		border-top: 1px solid var(--jc-line);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin: 16px 0;
	}
	th,
	td {
		text-align: left;
		padding: 10px 4px;
		border-bottom: 1px solid var(--jc-line);
	}
	summary {
		cursor: pointer;
		min-height: 44px;
		padding: 12px 0;
	}
	details {
		margin-top: 16px;
		color: var(--jc-text-muted);
	}
	@media (min-width: 650px) {
		.piles {
			grid-template-columns: 230px 1fr;
		}
		.opponents {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
