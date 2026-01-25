import { WORD_POOL, getRandomWord } from './constants';

export class Challenge {
    constructor(state, env) {
        this.state = state;
        this.sessions = []; 
        this.env = env;
        this.p1 = null;
        this.p2 = null;

        // Default Config
        this.mandatoryWord = null; 
        this.rounds = 1; 
        this.turnTime = 30; 
        this.transcript = [];
        this.turnStartTime = Date.now();
        this.battleMode = 'text';

        // Initialize turn owner
        this.currentTurnOwner = 'p1'; 
        this.status = 'OPEN';
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
                        this.resetState();
                        this.p1 = player;
                        // APPLY SETTINGS IMMEDIATELY
                        if (event.settings) {
                            this.applySettings(event.settings);
                        }
                    } else {
                        this.p2 = player;
                        if (this.p1) {
                            try {
                                this.p1.socket.send(JSON.stringify({
                                    type: 'OPPONENT_JOINED',
                                    username: this.p2.username,
                                    userId: this.p2.userId
                                }));
                            } catch (e) {}
                        }
                        this.startMatch();
                    }
                }

                if (event.type == 'UPDATE_SETTINGS') {
                    this.applySettings(event);
                }

                // --- 2. SUBMIT TURN ---
                // --- 2. SUBMIT TURN ---
                if (event.type === 'SUBMIT_TURN') {
                    // 1. Check if we should even accept this turn
                    const totalTurnsNeeded = this.rounds * 2;
                    if (this.status === 'JUDGING' || this.transcript.length >= totalTurnsNeeded) {
                        return; // Ignore extra clicks
                    }

                    const isP1 = (this.p1 && this.p1.socket === webSocket);
                    const expectedTurn = isP1 ? 'p1' : 'p2';
                    if (this.currentTurnOwner !== expectedTurn) return;

                    // 2. Process Input (Text/Audio)
                    let finalVerseText = event.verse || "";
                    if (event.audioData && this.env.AI) {
                        try {
                            const base64 = event.audioData.split(',')[1] || event.audioData;
                            const binaryString = atob(base64);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }
                            const aiResponse = await this.env.AI.run('@cf/openai/whisper', { audio: [...bytes] });
                            if (aiResponse.text) finalVerseText = aiResponse.text;
                        } catch (e) {
                            console.error("Transcription Failed", e);
                            finalVerseText += " [Audio Transcription Failed]";
                        }
                    }

                    const timeTaken = (Date.now() - this.turnStartTime) / 1000;
                    const isLate = timeTaken > (this.turnTime + 5); 
                    const sender = isP1 ? this.p1 : this.p2;
                    const receiver = isP1 ? this.p2 : this.p1;

                    // 3. Update State
                    this.transcript.push({
                        username: sender.username,
                        text: finalVerseText, 
                        originalAudio: !!event.audioData,
                        isLate: isLate,
                        round: Math.ceil((this.transcript.length + 1) / 2)
                    });

                    // 4. BRANCH: Is the Battle Over?
                    if (this.transcript.length >= totalTurnsNeeded) {
                        // --- A. BATTLE ENDED ---
                        this.status = 'JUDGING';
                        this.currentTurnOwner = null;

                        // Send the final verse to the opponent so they can see it
                        if (receiver) {
                            receiver.socket.send(JSON.stringify({
                                type: 'NEW_VERSE',
                                verse: finalVerseText, 
                                audioData: event.audioData,
                                isTranscribed: !!event.audioData
                            }));
                        }

                        // Broadcast "Judging" state to show loading screen
                        this.broadcast({ type: 'JUDGING' });

                        // Run AI Judge
                        const result = await this.runJudge(this.transcript, this.mandatoryWord);
                        const savedID = await this.saveBattleToDB(result);
                        result.battle_id = savedID;

                        this.broadcast({ type: 'RESULT', result });
                        await this.updateLeaderboard(result.winner);
                        
                    } else {
                        // --- B. BATTLE CONTINUES ---
                        this.currentTurnOwner = isP1 ? 'p2' : 'p1';
                        this.turnStartTime = Date.now();

                        // Send verse to opponent and tell them it's their turn
                        if (receiver) {
                            receiver.socket.send(JSON.stringify({
                                type: 'NEW_VERSE',
                                verse: finalVerseText, 
                                audioData: event.audioData,
                                isTranscribed: !!event.audioData
                            }));
                        }
                    }
                }

                if (event.type === 'TYPING') {
                    const other = (this.p1 && this.p1.socket === webSocket) ? this.p2 : this.p1;
                    if (other) other.socket.send(JSON.stringify({ type: 'OPPONENT_TYPING' }));
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

    resetState() {
        this.transcript = [];
        this.p2 = null;
        this.currentTurnOwner = 'p1';
        this.status = 'OPEN';
    }

    applySettings(settings) {
        if (settings.rounds) this.rounds = parseInt(settings.rounds);
        if (settings.turnTime) this.turnTime = parseInt(settings.turnTime);
        if (settings.battleMode) this.battleMode = settings.battleMode;
        if (settings.mandatoryWord) this.mandatoryWord = settings.mandatoryWord;
    }

    startMatch() {
        if (!this.p1 || !this.p2) return;

        const startMsg = { 
            type: 'MATCH_START', 
            mandatoryWord: this.mandatoryWord,
            rounds: this.rounds,
            turnTime: this.turnTime,
            battleMode: this.battleMode
        };

        this.currentTurnOwner = 'p1'; 
        this.turnStartTime = Date.now(); 

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
            let battleText = transcript.map(t => {
                const penaltyNote = t.isLate ? " [PENALTY: LATE]" : "";
                return `MC ${t.username}: "${t.text}"${penaltyNote}`;
            }).join('\n');

            let wordInstructions = '';
            if (word && word !== 'NONE') {
                wordInstructions = `MANDATORY WORD: "${word}". If used +10 points. If not 0 bonus.`;
            }

            const prompt = `
                Act as a professional Battle Rap Judge.
                
                TRANSCRIPT:
                ${battleText}

                ${wordInstructions}

                RUBRIC (0-10 each):
                1. Rhyme Scheme (Complexity)
                2. Flow (Readability/Rhythm)
                3. Bars (Punchlines/Creativity)
                4. Aggression (Direct attacks)

                RETURN JSON STRUCTURE ONLY, NO OTEHR TEXT EXCEPT JSON:
                {
                    "p1_score": number,
                    "p2_score": number,
                    "winner": "Username or 'Draw'",
                    "comment": "Critical 2-sentence summary."
                }
            `;

            const res = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
                messages: [{ role: 'user', content: prompt }]
            });

            console.log("--- [DEBUG] RAW AI RESPONSE ---");
            console.log(res.response);

            const match = res.response.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("Invalid JSON");
            const data = JSON.parse(match[0]);

            console.log("--- [DEBUG] EXTRACTED STRING ---");
            console.log(match[0]);

            return {
                winner: data.winner,
                p1_verse: transcript.filter((_, i) => i % 2 === 0).map(t => t.text).join('\n---\n'),
                p2_verse: transcript.filter((_, i) => i % 2 !== 0).map(t => t.text).join('\n---\n'),
                scores: data
            };
        } catch (e) {
            console.error("Judge Exception", e);
            return { winner: 'Draw', scores: { comment: "Judging Error", p1_score: 0, p2_score: 0 } };
        }
    }
    
    async updateLeaderboard(winnerUsername) {
        if (!winnerUsername || winnerUsername === "Draw") return;

        let winnerId = null;
        if (this.p1 && this.p1.username === winnerUsername) winnerId = this.p1.userId;
        else if (this.p2 && this.p2.username === winnerUsername) winnerId = this.p2.userId;

        try {
            const hasWordBonus = !!this.mandatoryWord;
            const id = this.env.USER_PROFILE.idFromName(winnerUsername);
            const userStub = this.env.USER_PROFILE.get(id);

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

            const lbId = this.env.LEADERBOARD.idFromName('GLOBAL_PVP');
            const lbStub = this.env.LEADERBOARD.get(lbId);
            await stub.fetch('http://do/submit', {
                method: 'POST',
                body: JSON.stringify({ 
                    username: winnerUsername, 
                    userId: winnerId,
                    score: userData.pvp_score 
                })
            });
            
        } catch (e) {
            console.error("Leaderboard update failed", e);
        }
    }

    async saveBattleToDB(result) {
        if (!this.env.DB) return null;
        const battleID = crypto.randomUUID();
        try {
            const query = `INSERT INTO battles (id, p1_name, p2_name, p1_verse, p2_verse, winner, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            await this.env.DB.prepare(query)
                .bind(battleID, this.p1.username, this.p2.username, this.p1.verse, this.p2.verse, result.winner, Date.now())
                .run();
            return battleID;
        } catch (e) { return null; }
    }
}