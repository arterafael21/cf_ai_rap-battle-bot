export class Challenge {
    constructor(state, env) {
        this.state = state;
    }

    async fetch(request) {
        // load current battle state
        let data = await this.state.storage.get('battle') || {
            satus: 'WAITING_FOR_P2',
            p1: { name: 'Player 1', verse: '' },
            p2: { name: 'Player 2', verse: '' },
            history: [] // judge results
        }

        const url = new URL(request.url);

        // GET /state (load the battle)
        if (request.method === 'GET') {
            return new Response(JSON.stringify(data));
        }

        // POST /create (Player 1 starts)
        if (url.pathname.endsWith('/create') && request.method === 'POST') {
            const { username, verse } = await request.json();
            data.p1 = { name: username, verse };
            data.status = "WAITING_FOR_P2";
            await this.state.storage.put("battle", data);
            return new Response(JSON.stringify(data));
        }

        // POST /join (Player 2 replies)
        if (url.endsWith('/join') && request.method === 'POST') {
            const { username, verse } = await request.json();
            if (data.status !== 'WAITING_FOR_P2') {
                return new Response("Battle already finished", { status: 400 });
            }

            data.p2 = { name: username, verse };
            data.status = "JUDGING";

            await this.state.storage.put("battle", data);
            return new Response(JSON.stringify(data));
        }

        if (url.pathname.endsWith('/finish') && request.pathname === 'POST') {
            const { result, scores } = await request.json();
            data.status = "FINISHED";
            data.result = result; // 'p1_win' or 'p2_win'
            data.scores = scores;
            await this.state.storage.put("battle", data);
            return new Response(JSON.stringify(data));
        }
        return new Response("OK");
    }
}