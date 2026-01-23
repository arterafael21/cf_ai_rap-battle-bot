import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';

const app = new Hono();

app.get('/stats', async (c) => {
    // access storage 
    const storage = c.env.storage;

    let stats = await storage.get("stats") || {
        wins: 0,
        losses: 0,
        rank: "Novice",
        style: "Freestyle"
    };

    let rank = "Novice";
    if (stats.wins > 5) rank = "Amateur";
    if (stats.wins > 20) rank = "Pro";
    if (stats.wins > 50) rank = "Rap God";
    stats.rank = rank;
    return c.json(stats);
});

app.post('/update', async (c) => {
    const storage = c.env.storage;
    const body = await c.req.json();
    
    let stats = await storage.get("stats") || { wins: 0, losses: 0, rank: "Novice"};

    if (body.result === "win") stats.wins += 1;
    if (body.result === "loss") stats.losses += 1;

    await storage.put("stats", stats);
    return c.json(stats);
});

// class wrapper
export class UserProfile extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.storage = ctx.storage;
    }

    fetch(request) {
        return app.fetch(request, { storage: this.storage });
    }
}