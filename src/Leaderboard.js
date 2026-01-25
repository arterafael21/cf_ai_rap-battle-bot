import { DurableObject } from 'cloudflare:workers';

export class Leaderboard extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.storage = ctx.storage;
    }

    async fetch(request) {
        const url = new URL(request.url)
        
        if (url.pathname === '/reset') {
            await this.storage.deleteAll();
            return new Response("Reset");
        }

        // --- SUBMIT SCORE ---
        if (request.method === 'POST' && url.pathname === '/submit') {
            const { username, score } = await request.json();
            
            // Get current list
            let list = (await this.storage.get('leaders')) || [];
            
            // Remove existing entry for this user
            list = list.filter(p => p.userId !== userId &&p.username !== username);
            
            // Add new entry
            if (username && username !== 'None') {
                list.push({ username, score });
            }
            
            // Sort by SCORE descending (Highest first)
            list.sort((a, b) => b.score - a.score);
            
            // Keep Top 10
            list = list.slice(0, 10);
            
            await this.storage.put('leaders', list);
            return new Response(JSON.stringify(list));
        }

        // --- GET LEADERBOARD ---
        const list = (await this.storage.get('leaders')) || [];
        return new Response(JSON.stringify(list));
    }
}