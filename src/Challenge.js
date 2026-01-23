export class Challenge {
    constructor(state, env) {
        this.state = state;
    }

    async fetch(reqeust) {
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
    }
}