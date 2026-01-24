import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';

const app = new Hono();

app.get('/stats', async (c) => {
	// access storage
	const storage = c.env.storage;

	// LOAD STATS
	let stats = (await storage.get('stats')) || {
		wins_against_ai: 0,
		losses_against_ai: 0,
		pvp_wins: 0,
		pvp_losses: 0,
		rank: 'Novice',
		style: 'Freestyle',
	};

	// calc total wins
	const totalWins = (stats.wins_against_ai || 0) + (stats.pvp_wins || 0);
	const totalLosses = (stats.losses_against_ai || 0) + (stats.pvp_losses || 0);
	const netLosses = totalWins - totalLosses;

	let rank = 'Novice';
	if (netLosses > 5) rank = 'Amateur';
	if (netLosses > 20) rank = 'Pro';
	if (netLosses > 50) rank = 'Rap God';
	stats.rank = rank;
	return c.json(stats);
});

app.post('/update', async (c) => {
	const storage = c.env.storage;
	const { result, type } = await c.req.json(); 

	let stats = (await storage.get('stats')) || { wins: 0, losses: 0, pvp_wins: 0, pvp_losses: 0 };

	if (type === 'pvp') {
		if (result === 'win') stats.pvp_wins = (stats.pvp_wins || 0) + 1;
		if (result === 'loss') stats.pvp_losses = (stats.pvp_losses || 0) + 1;
	} else {
		if (result === 'win') stats.wins_against_ai = (stats.wins_against_ai || 0) + 1;
		if (result === 'loss') stats.losses_against_ai = (stats.losses_against_ai || 0) + 1;
	}

	await storage.put('stats', stats);
	return c.json(stats);
});

export class UserProfile extends DurableObject {
	constructor(ctx, env) {
		super(ctx, env);
		this.storage = ctx.storage;
	}

	fetch(request) {
		return app.fetch(request, { storage: this.storage });
	}
}
