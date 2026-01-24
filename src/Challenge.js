import { WORD_POOL, getRandomWord } from './constants';

export class Challenge {
    constructor(state, env) {
        this.state = state;
        this.sessions = []; 
        this.env = env;
        this.p1 = null;
        this.p2 = null;

        // Battle Config
        this.mandatoryWord = null; 
        this.rounds = 1;
        this.transcript = [];

        this.status = 'OPEN';
        this.finalResult = null;
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

                // --- 1. INIT ---
                if (event.type === 'INIT') {
                    const player = {
                        username: event.username,
                        userId: event.userId,
                        socket: webSocket
                    };

                    if (event.role === 'CREATE') {
                        this.p1 = player;
                    } else {
                        this.p2 = player;
                        // Notify P1 that P2 joined
                        if (this.p1) {
                            try {
                                this.p1.socket.send(JSON.stringify({
                                    type: 'OPPONENT_JOINED',
                                    username: this.p2.username,
                                    userId: this.p2.userId
                                }));
                            } catch (e) {}
                        }
                        // START MATCH IMMEDIATELY
                        this.startMatch();
                    }
                }

                // --- UPDATE SETTINGS ---
                if (event.type === 'UPDATE_SETTINGS' && this.p1 && this.p1.socket === webSocket) {
                    if (event.rounds) this.rounds = event.rounds;
                }

                // --- 2. TYPING INDICATOR ---
                if (event.type === 'TYPING') {
                    const other = (this.p1 && this.p1.socket === webSocket) ? this.p2 : this.p1;
                    if (other) other.socket.send(JSON.stringify({ type: 'OPPONENT_TYPING' }));
                }

                // --- 3. SUBMIT TURN ---
                if (event.type === 'SUBMIT_TURN') {
                    const isP1 = (this.p1 && this.p1.socket === webSocket);
                    const sender = isP1 ? this.p1 : this.p2;
                    const receiver = isP1 ? this.p2 : this.p1
                    
                    // Add to Transcript
                    this.transcript.push({
                        username: sender.username,
                        text: event.verse,
                        round: Math.ceil((this.transcript.length + 1) / 2)
                    });

                    // Forward to opponent immediately
                    if (receiver) {
                        receiver.socket.send(JSON.stringify({
                            type: 'NEW_VERSE',
                            verse: event.verse,
                            audioData: event.audioData
                        }));
                    }
                    
                    // Check Game End
                    // Total turns needed = rounds * 2
                    if (this.transcript.length >= this.rounds * 2) {
                        // END GAME
                        this.broadcast({ type: 'JUDGING' });

                        const result = await this.runJudge(this.transcript, this.mandatoryWord);

                        // Save result
                        const savedID = await this.saveBattleToDB(result);
                        result.battle_id = savedID;

                        this.broadcast({ type: 'RESULT', result });
                        await this.updateLeaderboard(result.winner)
                    }
                }

            } catch (err) { console.error("WS Error", err); }
        });

        webSocket.addEventListener('close', () => {
            this.sessions = this.sessions.filter(s => s !== webSocket);
            const other = (this.p1 && this.p1.socket === webSocket) ? this.p2 : this.p1;
            if (other) {
                try { other.socket.send(JSON.stringify({ type: 'OPPONENT_DISCONNECTED' })); } catch(e){}
            }
        });
    }

    startMatch() {
        if (!this.p1 || !this.p2) return;

        // Broadcast Start with Config
        const startMsg = { 
            type: 'MATCH_START', 
            mandatoryWord: this.mandatoryWord ,
            rounds: this.rounds
        };

        try {
            this.p1.socket.send(JSON.stringify({ ...startMsg, yourTurn: true }));
            this.p2.socket.send(JSON.stringify({ ...startMsg, yourTurn: false }));
        } catch (e) { console.log('Match error:', e); }
    }

    broadcast(message) {
        this.sessions.forEach(s => {
            try { s.send(JSON.stringify(message)); }  catch (e) {}
        });
    }

    async runJudge(transcript, word) {
        try {
            // 1. Only include word instructions if a real word exists
            let battleText = transcript.map(t => `${t.username}: "${t.text}"`).join('\n');

            if (word && word !== 'NONE') {
                wordInstructions = `
                MANDATORY CHALLENGE:
                - The word is: "${word}".
                - CHECK CAREFULLY: Did the rapper use this exact word?
                - If YES: Add +10 points to their total score.
                - If NO: 0 bonus points.
                `;
            }

            // 2. PROMPT
            const prompt = `
                You are the Supreme Battle Rap Judge. You must evaluate two verses based on this strict rubric. 
                
                TRANSCRIPT:
                ${battleText}

                ${wordInstructions}

                SCORING RUBRIC (0-10 per category):
                1. RHYME SCHEME (1-10): 
                - 1-3: No rhymes or very simple single-syllable rhymes (cat/hat).
                - 4-7: Standard end-rhymes, some multi-syllabic attempts.
                - 8-10: Complex multis, internal rhymes, and dense patterns.
                
                2. FLOW & METER (1-10):
                - 1-3: Clunky, too many/few syllables, hard to read.
                - 4-7: Standard readable rhythm.
                - 8-10: Excellent cadence, rides the beat perfectly in text form.

                3. BARS & CREATIVITY (1-10):
                - 1-3: Generic insults ("you are bad"), clichés.
                - 4-7: Good punchlines, standard metaphors.
                - 8-10: Double entendres, clever wordplay, original angles.

                4. AGGRESSION/DEFENSE (1-10):
                - Did they actually address the opponent or just rap generic lines?
                - 8-10 requires direct, relevant counters or brutal roasts.

                OUTPUT FORMAT:
                You must output ONLY valid JSON. Do not write anything else.
                {
                    "p1_score": number (total sum + bonus),
                    "p2_score": number (total sum + bonus),
                    "winner": "Username of Winner"
                    "comment": "A 2-sentence summary of why the winner won. Be critical and specific."
                }
            `;

            const res = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
                messages: [{ role: 'user', content: prompt }]
            });

            if (!res || !res.response) {
                throw new Error('Empty response from judge')
            }

            const match = res.response.match(/\{[\s\S]*\}/);
            if (!match) {
                console.error('Judge Output Invalid', res.response);
                return { winner: 'Draw', scores: { comment: 'Judge was confused.', p1_score: 5, p2_score: 5 } };
            }
            const data = JSON.parse(match[0]);

            return {
                winner: data.winner,
                p1_verse: transcript.filter((_, i) => i % 2 === 0).map(t => t.text).join('\n---\n'),
                p2_verse: transcript.filter((_, i) => i % 2 !== 0).map(t => t.text).join('\n---\n'),
                scores: data
            };
        } catch (e) {
            console.error("Judge Exception", e);
            return { winner: 'Draw', scores: { comment: "Judge Glitched", p1_score: 0, p2_score: 0 } };
        }
    }

    async updateLeaderboard(winnerUsername) {
        if (!winnerUsername || winnerUsername === "Draw") return;

        try {
            const hasWordBonus = !!this.mandatoryWord;
            const userId = this.env.USER_PROFILE.idFromName(winnerUsername);
            const userStub = this.env.USER_PROFILE.get(userId);

            // 1. UDPATE PROFILE
            const userRes = await userStub.fetch('http://do/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    result: 'win',
                    type: 'pvp',
                    hasWordBonus: hasWordBonus
                })
            });
            const userData = await userRes.json();

            // 2. SUBMIT TO PVP LEADERBOARD
            const id = this.env.LEADERBOARD.idFromName('GLOBAL_PVP');
            const stub = this.env.LEADERBOARD.get(id);
            await stub.fetch('http://do/submit', {
                method: 'POST',
                body: JSON.stringify({ username: winnerUsername, score: userData.pvp_score })
            });
            
        } catch (e) {
            console.error("Leaderboard update failed", e);
        }
    }

    async saveBattleToDB(result) {
        if (!this.env.DB) {
            console.error("D1 Database binding 'DB' not found");
            return null;
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