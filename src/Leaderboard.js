export class Leaderboard {
    constructor(state, env) {
        this.state = state;
    }

    async fetch(request) {
        const headers = { 'Content-Type': 'application/json' };

        if (request.method === 'GET') {
            const scores = await this.state.storage.get("scores") || [];
            return new Response(JSON.stringify(scores), { headers });
        }

        if (request.method === 'POST') {
            const { username, wins } = await request.json();
            let scores = await this.state.storage.get("scores") || [];

            const index = scores.findIndex(s => s.username === username);
            if (index !== -1) {
                if (wins > scores[index].wins) scores[index].wins = wins;
            } else {
                scores.push({ username, wins });
            }

            scores.sort((a, b) => b.wins - a.wins);
            scores = scores.slice(0, 10);

            await this.state.storage.put("scores", scores);
            return new Response(JSON.stringify(scores), { headers });
        }

        return new Response(JSON.stringify({ error: "Method not allowed" }), { 
            status: 405, 
            headers 
        });
    }
}