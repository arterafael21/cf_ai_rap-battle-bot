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
	return c.json(stats);
});

app.post('/update', async (c) => {
	const storage = c.env.storage;
	const { result, type, hasWordBonus } = await c.req.json(); 

	let stats = (await storage.get('stats')) || { wins: 0, losses: 0, score: 0, rank: 'Novice' };

	// 1. CALCULATE POINTS
	let pointsChange = 0;

	if (result === 'win') {
		stats.win += 1;
		// Base points
		if (type === 'pvp') pointsChange += 25;
		else pointsChange += 10;

		// Bonus
		if (hasWordBonus) pointsChange += 5;
	} else {
		stats.losses += 1;
		pointsChange -= 5;
	}
	
	// 2. UPDATE SCORE
	stats.score = Math.max(0, (stats.score || 0) + pointsChange);

	// 3. UPDATE RANK
	if (stats.score > 50) stats.rank = 'Amateur';
    if (stats.score > 200) stats.rank = 'Pro';
    if (stats.score > 1000) stats.rank = 'Rap God';

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
