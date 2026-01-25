import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';

const app = new Hono();

app.get('/stats', async (c) => {
    // access storage
    const storage = c.env.storage;

    // LOAD STATS
    // Initialize separate counters for AI and PVP
    let stats = (await storage.get('stats')) || {
        ai_wins: 0,
        ai_losses: 0,
        ai_score: 0,
        pvp_wins: 0,
        pvp_losses: 0,
        pvp_score: 0,
        rank: 'Novice',
    };
    stats.score = (stats.ai_score || 0) + (stats.pvp_score || 0);
    return c.json(stats);
});

app.post('/update', async (c) => {
    const storage = c.env.storage;
    const { result, type, hasWordBonus } = await c.req.json(); 

    // Retrieve existing or set defaults
    let stats = (await storage.get('stats')) || { 
        ai_wins: 0, ai_losses: 0, ai_score: 0, 
        pvp_wins: 0, pvp_losses: 0, pvp_score: 0, 
        rank: 'Novice' 
    };

    // 1. CALCULATE POINTS
    let pointsChange = 0;

    const baseWinValue = pointsChange || 10;

    if (result === 'win') {
        // Base points
        if (type === 'pvp') {
            stats.pvp_wins = (stats.pvp_wins || 0) + 1;
            pointsChange += 30; // high reward for beating human
        } else {
            stats.ai_wins = (stats.ai_wins || 0) + 1;
            pointsChange += baseWinValue; // variable reward based on Bot Difficulty
        }

        // Bonus
        if (hasWordBonus) pointsChange += 5;
    } else {
        // Handle Losses
        if (type === 'pvp') {
            stats.pvp_losses = (stats.pvp_losses || 0) + 1;
        } else {
            stats.ai_losses = (stats.ai_losses || 0) + 1;
        }
    }
    
    // 2. UPDATE SPECIFIC SCORE
    if (type === 'pvp') {
        stats.pvp_score = Math.max(0, (stats.pvp_score || 0) + pointsChange);
    } else {
        stats.ai_score = Math.max(0, (stats.ai_score || 0) + pointsChange);
    }

    // 3. UPDATE RANK (Based on TOTAL score)
    const totalScore = (stats.ai_score || 0) + (stats.pvp_score || 0);

    if (totalScore < 50) stats.rank = 'Novice';
    else if (totalScore < 200) stats.rank = 'Amateur';
    else if (totalScore < 1000) stats.rank = 'Pro';
    else stats.rank = 'Rap God';

    // 4. Update total wins
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