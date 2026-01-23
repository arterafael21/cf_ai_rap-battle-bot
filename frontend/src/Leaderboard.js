export class Leaderboard {
    constructor(state, env) {
        this.state = state;
    }

    async fetch(request) {
        let url = new URL(request.url);

        // GET: return top list
        if (request.method === 'GET') {
            const scores = await this.state.storage("scores") || [];
            return new Response(JSON.stringify(scores), {
                headers: { 'Content-Type': 'application/json'}
            });
        }

        // POST: submit
        if (request.method === 'POST') {
            const { username, wins } = await request.json();
            let scores = await this.state.storage.get("scores") || [];

            // check if user exists
            const index = scores.findIndex(s => s.username === username);
            if (index !== -1) {
                // only update if they have more wins
                if (wins > scores[index].wins) scores[index].wins = wins;
            } else {
                scores.push({ username, wins });
            }

            // sort high to low and keep top 10
            scores.sort((a, b) => b.wins - a.wins);
            scores = scores.slice(0, 10);

            await this.state.storage.put("scores", scores);
            return new Response(JSON.stringify(scores));
        }

        return new Response("Method not allowed", { status: 405 });
    }
}