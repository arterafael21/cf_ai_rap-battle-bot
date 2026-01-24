import { WORD_POOL, getRandomWord } from './constants';

export class Challenge {
    constructor(state, env) {
        this.state = state;
        this.sessions = []; 
        this.env = env;
        this.p1 = null;
        this.p2 = null;
        this.status = 'OPEN';
        this.finalResult = null; 
        this.mandatoryWord = null; 
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
        this.sessions.push(webSocket); 

        webSocket.addEventListener("message", async (msg) => {
            try {
                const event = JSON.parse(msg.data);

                // --- CREATE ---
                if (event.type === 'CREATE') {
                    this.mandatoryWord = event.mandatoryWord;
                    
                    this.status = 'OPEN';
                    this.finalResult = null;
                    this.battleMode = event.battleMode || 'text';

                    this.p1 = { 
                        username: event.username, 
                        verse: event.verse, 
                        socket: webSocket,
                        audioData: event.audioData || null
                    };
                    webSocket.send(JSON.stringify({ type: 'CREATED' }));
                }

                // --- JOIN ---
                if (event.type === 'JOIN') {
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

                    // Notify P1
                    if (this.p1.socket.readyState === WebSocket.READY_STATE_OPEN) {
                        this.p1.socket.send(JSON.stringify({
                            type: 'OPPONENT_JOINED',
                            username: this.p2.username
                        }));
                    }

                    // Start game for P2
                    webSocket.send(JSON.stringify({
                        type: 'BATTLE_START',
                        opponent: this.p1.username,
                        verse: this.p1.verse,
                        battleMode: this.battleMode,
                        audioData: this.p1.audioData,
                        mandatoryWord: this.mandatoryWord // Send the shared word
                    }));
                }

                // --- REPLY ---
                if (event.type === 'REPLY') {
                    this.p2.verse = event.verse;
                    this.p2.audioData = event.audioData || null;

                    this.broadcast({ type: 'JUDGING' });
                    
                    const result = await this.runJudge(this.p1, this.p2, this.mandatoryWord);

                    this.status = 'FINISHED';
                    this.finalResult = result;

                    result.p1_verse = this.p1.verse;
                    result.p2_verse = this.p2.verse;
                    result.p2_audio = this.p2.audioData;

                    const savedID = await this.saveBattleToDB(result);
                    result.battle_id = savedID;

                    this.broadcast({ type: 'RESULT', result});
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

    async runJudge(p1, p2, word) {
        try {
            const prompt = `Judge this rap battle. 
                MANDATORY WORD: "${word || 'NONE'}". If a word is specified, give +10 points if used.
                Output JSON: { "p1_score": 5, "p2_score": 5, "comment": "..." }
                P1: "${p1.verse}"
                P2: "${p2.verse}"`;

            const res = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
                messages: [{ role: 'user', content: prompt }]
            });

            const match = res.response.match(/\{[\s\S]*\}/);
            const scores = match ? JSON.parse(match[0]) : { p1_score: 5, p2_score: 5, comment: "AI Error" };

            const winnerName = scores.p1_score > scores.p2_score ? p1.username : p2.username;
            const winnerCode = scores.p1_score > scores.p2_score ? 'p1_win' : 'p2_win'

            return { winner: winnerName, winnerCode, scores } 
        } catch (e) {
            console.error("Judge Exception", e);
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

            const userId = this.env.USER_PROFILE.idFromName(winnerUsername);
            const userStub = this.env.USER_PROFILE.get(userId);

            await userStub.fetch('http://do/update', {
                method: 'POST',
                headers: { 'CONTENT-TYPE': 'application/json' },
                body: JSON.stringify({ result: 'win', type: 'pvp' })
            });
        } catch (e) {
            console.error("Leaderboard update failed", e);
        }
    }

    async saveBattleToDB(result) {
        if (!this.env.DB) {
            console.error("D1 Database binding 'DB' not found");
            return;
        }

        const battleID = crypto.randomUUID();

        try {
            const query = `
                INSERT INTO battles (id, p1_name, p2_name, p1_verse, p2_verse, winner, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            await this.env.DB.prepare(query)
                .bind(
                    battleID,
                    this.p1.username,
                    this.p2.username,
                    this.p1.verse,
                    this.p2.verse,
                    result.winner,
                    Date.now()
                )
                .run();
            return battleID;
        } catch (e) {
            console.error('Failed to save battle to D1', e);
            return null;
        }
    }
}