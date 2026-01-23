export class Challenge {
    constructor(state, env) {
        this.state = state;
        this.sessions = []; // keep track of everyone in the room (P1 + P2)
        this.env = env;
        this.p1 = null;
        this.p2 = null;
    }

    async fetch (request) {
        if (request.headers.get("Upgrade") === "websocket") {
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            this.handleSession(server);

            return new Response(null, { status: 101, webSocket: client });
        }

        return new Response("Expected WebSocket", { status: 400 });
    }

    handleSession(webSocket) {
        webSocket.accept();
        this.sessions.push(webSocket); // add player

        webSocket.addEventListener("message", async (msg) => {
            try {
                const event = JSON.parse(msg.data);

                if (event.type === 'CREATE') {
                    this.p1 = { username: event.username, verse: event.verse, socket: webSocket };
                    webSocket.send(JSON.stringify({ type: 'CREATED' }));
                }

                if (event.type === 'JOIN') {
                    if (!this.p1) {
                        webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Battle not found' }));
                        return;
                    }
                    this.p2 = { username: event.username, socket: webSocket };

                    this.p1.socket.send(JSON.stringify({
                        type: 'OPPONENT_JOINED',
                        username: this.p2.username
                    }));

                    webSocket.send(JSON.stringify({
                        type: 'BATTLE_START',
                        opponent: this.p1.username,
                        verse: this.p1.verse
                    }));
                }

                if (event.type === 'REPLY') {
                    this.broadcast({ type: 'JUDGING' });
                    const result = await this.runJudge(this.p1, this.p2);

                    this.broadcast({ type: 'RESULT', result});
                }
            } catch (err) {
                console.error("WS Error", err);
            }
        });

        webSocket.addEventListener('close', () => {
            this.sessions = this.sessions.filter(s => s !== webSocket);
        });
    }

    broadcast(message) {
        this.sessions.forEach(s => {
            try { s.send(JSON.stringify(message)); }  catch (e) {}
        });
    }

    async runJudge(p1, p2) {
        try {
            const prompt = `Judge this rap battle. Output JSON only: { "p1_score": 5, "p2_score": 5, "comment": "..." }
            P1 (${p1.username}): "${p1.verse}"
            P2 (${p2.username}): "${p2.verse}"`;

            const res = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
                messages: [{ role: 'user', content: prompt }]
            });

            const match = res.response.match(/\{[\s\S]*\}/);
            const scores = match ? JSON.parse(match[0]) : { p1_score: 5, p2_score: 5, comment: "AI Error" };

            const winner = scores.p1_score > scores.p2_score ? p1.username : p2.username;
            return { winner, scores } 
        } catch (e) {
            return { winner: 'Draw', scores: { comment: "Judge Glitched", p1_score: 0, p2_score: 0 } };
        }
    }
}