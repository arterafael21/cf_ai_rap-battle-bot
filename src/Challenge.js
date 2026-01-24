export class Challenge {
    constructor(state, env) {
        this.state = state;
        this.sessions = []; // keep track of everyone in the room (P1 + P2)
        this.env = env;
        this.p1 = null;
        this.p2 = null;
        this.status = 'OPEN' // 'OPEN' or 'FINISHED'
        this.finalResult = null; // store result to show late-joiners
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

                // --- CREATE ---
                if (event.type === 'CREATE') {
                    this.p1 = { username: event.username, verse: event.verse, socket: webSocket };
                    webSocket.send(JSON.stringify({ type: 'CREATED' }));
                }

                // --- JOIN ---
                if (event.type === 'JOIN') {
                    // Check if battle is over
                    if (this.status === 'FINISHED') {
                        webSocket.send(JSON.stringify({
                            type: 'RESULT',
                            result: this.finalResult,
                            message: 'This battle has already ended'
                        }));
                        return;
                    }

                    if (!this.p1) {
                        webSocket.send(JSON.stringify({ type: 'ERROR', message: 'Battle not found' }));
                        return;
                    }
                    this.p2 = { username: event.username, socket: webSocket };

                    // notify p1
                    if (this.p1.socket.readyState === WebSocket.READY_STATE_OPEN) {
                        this.p1.socket.send(JSON.stringify({
                            type: 'OPPONENT_JOINED',
                            username: this.p2.username
                        }));
                    }

                    // start game for p2
                    webSocket.send(JSON.stringify({
                        type: 'BATTLE_START',
                        opponent: this.p1.username,
                        verse: this.p1.verse
                    }));
                }

                // --- REPLY ---
                if (event.type === 'REPLY') {
                    this.p2.verse = event.verse;
                    this.broadcast({ type: 'JUDGING' });
                    const result = await this.runJudge(this.p1, this.p2);

                    // save state
                    this.status = 'FINISHED';
                    this.finalResult = result;

                    this.broadcast({ type: 'RESULT', result});

                    // update PVP leaderboard
                    await this.updateLeaderboard(result.winner);
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

            const winnerName = scores.p1_score > scores.p2_score ? p1.username : p2.username;
            const winnerCode = scores.p1_score > scores.p2_score ? 'p1_win' : 'p2_win'

            return { winner: winnerName, winnderCode, scores } 
        } catch (e) {
            return { winner: 'Draw', scores: { comment: "Judge Glitched", p1_score: 0, p2_score: 0 } };
        }
    }

    async updateLeaderboard(winnerUsername) {
        if (!winnerUsername || winnerUsername === "Draw") return;

        try {
            const id = this.env.LEADERBOARD.idFromName('GLOBAL_PVP');
            const stub = this.env.LEADERBOARD.get(id);

            await stub.fetch('http://do/submit', {
                method: 'POST',
                body: JSON.stringify({ username: winnerUsername })
            });
        } catch (e) {
            console.error("Leaderboard update failed", e);
        }
    }
}