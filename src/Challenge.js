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

                // -- INIT ---
                if (event.type === 'INIT') {
                    if (event.role === 'CREATE') {
                        this.p1 = { username: event.username, socket: webSocket, verse: null };
                    } else {
                        this.p2 = { username: event.username, socket: webSocket}

                        if (this.p1) {
                            try {
                                this.p1.socket.send(JSON.stringify({
                                    type: 'OPPONENT_JOINED',
                                    username: this.p2.username
                                }));
                            } catch (e) { console.log('Failed to notify p1', e); }
                        }
                        if (this.status === 'P1_READY') {
                            this.sendBattleStartToP2();
                        } else {
                            webSocket.send(JSON.stringify({ type: 'WAITING_FOR_OPPONENT' }));
                        }
                    }
                }

                // --- TYPING RELAY ---
                if (event.type === 'TYPING') {
                    const otherPlayer = (this.p1 && this.p1.socket === webSocket) ? this.p2 : this.p1;
                    if (otherPlayer) {
                        otherPlayer.socket.send(JSON.stringify({ type: 'OPPONENT_TYPING' }));
                    }
                }

                // --- P1 SUBMITS VERSE ---
                if (event.type === 'SUBMIT_VERSE') {
                    if (!this.p1) return;
                    this.p1.verse = event.verse;
                    this.p1.audioData = event.audioData;
                    if (event.mandatoryWord) this.mandatoryWord = event.mandatoryWord;

                    this.status = 'P1_READY';
                    this.p1.socket.send(JSON.stringify({ type: 'VERSE_ACCEPTED' }));

                    if (this.p2) {
                        this.sendBattleStartToP2();
                        this.p1.socket.send(JSON.stringify({ type: 'OPPONENT_JOINED', username: this.p2.username }));
                    }
                }

                // --- REPLY ---
                if (event.type === 'REPLY') {
                    if (!this.p2) return;
                    this.p2.verse = event.verse;
                    this.p2.audioData = event.audioData || null;

                    this.broadcast({ type: 'JUDGING' });
                    
                    const result = await this.runJudge(this.p1, this.p2, this.mandatoryWord);

                    this.status = 'FINISHED';

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

            // check if p1 left
            if (this.p1 && this.p1.socket === webSocket) {
                this.p1 = null;
                if (this.p2) {
                    try {
                        this.p2.socket.send(JSON.stringify({ type: 'OPPONENT_DISCONNECTED' }));
                    } catch (e) {console.log('Failed to notify p2', e); }
                } 
            } else if (this.p2 && this.p2.socket === webSocket) {
                this.p2 = null; // Wipe data
                if (this.p1) {
                    try { 
                        this.p1.socket.send(JSON.stringify({ type: 'OPPONENT_DISCONNECTED' })); 
            } catch(e) { console.log("Failed to notify p1", e); }
        }
    }
        });
    }

    sendBattleStartToP2() {
        if (!this.p2 || !this.p1) return;
        this.p2.socket.send(JSON.stringify({
            type: 'BATTLE_START',
            opponent: this.p1.username,
            verse: this.p1.verse,
            audioData: this.p1.audioData,
            mandatoryWord: this.mandatoryWord
        }))
    }

    broadcast(message) {
        this.sessions.forEach(s => {
            try { s.send(JSON.stringify(message)); }  catch (e) {}
        });
    }

    async runJudge(p1, p2, word) {
        try {
            // 1. LOGIC: Only include word instructions if a real word exists
            let wordInstructions = "";

            if (word && word !== 'NONE') {
                wordInstructions = `
                MANDATORY CHALLENGE:
                - The word is: "${word}".
                - CHECK CAREFULLY: Did the rapper use this exact word?
                - If YES: Add +10 points to their total score.
                - If NO: 0 bonus points.
                `;
            }

            // 2. PROMPT: Detailed Rubric
            const prompt = `
                You are the Supreme Battle Rap Judge. You must evaluate two verses based on this strict rubric. 
                
                VERSES TO JUDGE:
                Player 1 (${p1.username}): "${p1.verse}"
                Player 2 (${p2.username}): "${p2.verse}"

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
            const scores = match ? JSON.parse(match[0]) : { p1_score: 5, p2_score: 5, comment: "AI Error" };

            const winnerName = scores.p1_score > scores.p2_score ? p1.username : p2.username;
            const winnerCode = scores.p1_score > scores.p2_score ? 'p1_win' : 'p2_win';

            if (scores.p1_score === scores.p2_score) {
                return { winner: 'Draw', winnerCode: 'draw', scores };
            }

            return { winner: winnerName, winnerCode, scores } 
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
            
            const id = this.env.LEADERBOARD.idFromName('GLOBAL_PVP');
            const stub = this.env.LEADERBOARD.get(id);
            await stub.fetch('http://do/submit', {
                method: 'POST',
                body: JSON.stringify({ username: winnerUsername, score: userData.score })
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