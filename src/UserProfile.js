import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';

const app = new Hono();

app.get('/stats', async (c) => {
    const storage = c.env.storage;
    let stats = (await storage.get('stats')) || {
        ai_wins: 0, ai_losses: 0, ai_score: 0,
        pvp_wins: 0, pvp_losses: 0, pvp_score: 0,
        rank: 'Novice',
    };
    stats.score = (stats.ai_score || 0) + (stats.pvp_score || 0);
    return c.json(stats);
});

app.post('/update', async (c) => {
    const storage = c.env.storage;
    const { result, type, pointsValue } = await c.req.json(); 

    let stats = (await storage.get('stats')) || { 
        ai_wins: 0, ai_losses: 0, ai_score: 0, 
        pvp_wins: 0, pvp_losses: 0, pvp_score: 0, 
        rank: 'Novice' 
    };

    const pointsChange = pointsValue || 0;

    if (result === 'win') {
        if (type === 'pvp') {
            stats.pvp_wins = (stats.pvp_wins || 0) + 1;
        } else {
            stats.ai_wins = (stats.ai_wins || 0) + 1;
        }
    } else if (result === 'loss' || result === 'draw') {
        if (type === 'pvp') {
            stats.pvp_losses = (stats.pvp_losses || 0) + 1;
        } else {
            stats.ai_losses = (stats.ai_losses || 0) + 1;
        }
    }
    
    // Apply the points change to the correct category
    if (type === 'pvp') {
        stats.pvp_score = Math.max(0, (stats.pvp_score || 0) + pointsChange);
    } else {
        stats.ai_score = Math.max(0, (stats.ai_score || 0) + pointsChange);
    }

    // UPDATE RANK
    const totalScore = (stats.ai_score || 0) + (stats.pvp_score || 0);

    if (totalScore < 100) stats.rank = 'Novice';
    else if (totalScore < 500) stats.rank = 'Amateur';
    else if (totalScore < 2500) stats.rank = 'Pro';
    else stats.rank = 'Rap God';

    stats.wins = (stats.ai_wins || 0) + (stats.pvp_wins || 0);
    stats.losses = (stats.ai_losses || 0) + (stats.pvp_losses || 0);
    stats.score = totalScore;

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