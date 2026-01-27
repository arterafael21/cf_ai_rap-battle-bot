import { DurableObject } from "cloudflare:workers";

export class Challenge extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.ctx = ctx;
        this.env = env;
        
        // --- GAME STATE ---
        // We store player metadata in the WebSocket attachments, 
        // but we keep track of the IDs here to manage game flow.
        this.p1Id = null;
        this.p2Id = null;
        this.p1Name = null;
        this.p2Name = null;
        
        this.transcript = [];
        this.status = 'OPEN'; // OPEN, ACTIVE, JUDGING, ABANDONED, FINISHED
        
        this.settings = {
            rounds: 1,
            turnTime: 30,
            battleMode: 'text', // 'text' or 'audio'
            mandatoryWord: null
        };

        this.votes = { p1: 0, p2: 0 };
        this.votedUsers = new Set(); // Track who voted to prevent duplicate votes
        
        this.currentTurnOwner = 'p1'; 
        this.isProcessingTurn = false; 
    }

    async fetch(request) {
        const upgrade = request.headers.get("Upgrade");
        if (!upgrade || !upgrade.toLowerCase().includes("websocket")) {
            return new Response("Expected WebSocket", { status: 426 });
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        // 1. Handle Hibernation
        this.ctx.acceptWebSocket(server);

        const responseHeaders = new Headers();
        responseHeaders.set('Upgrade', 'websocket');
        responseHeaders.set('Connection', 'Upgrade');

        const protocol = request.headers.get("Sec-WebSocket-Protocol");
        if (protocol) {
            responseHeaders.set("Sec-WebSocket-Protocol", protocol);
        }

        this.startHeartbeat();

        return new Response(null, { 
            status: 101, 
            webSocket: client,
            headers: responseHeaders
        });
    }

    // =========================================================
    //  WEBSOCKET EVENT HANDLERS (HIBERNATION API)
    // =========================================================

    startHeartbeat() {
        if (this.heartbeatTimer) return; // Already running

        this.heartbeatTimer = setInterval(() => {
            // If everyone left, stop the heartbeat to save resources
            if (this.ctx.getWebSockets().length === 0) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
                return;
            }

            // Send a tiny packet to keep the connection alive
            this.broadcast({ type: 'PING' });
        }, 5000); // 5 seconds for iOS
    }

    async webSocketMessage(ws, message) {
        try {
            const event = JSON.parse(message);
            
            // --- 1. INITIALIZATION ---
            if (event.type === 'INIT') {
                if (this.status === 'FINISHED' || this.status === 'ABANDONED') {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'This battle is closed.'}));
                    return;
                }

                // Store player metadata directly on the socket
                ws.serializeAttachment({
                    username: event.username,
                    userId: event.userId,
                    role: event.role
                });

                if (event.role === 'CREATE') {
                    this.p1Id = event.userId;
                    this.p1Name = event.username;
                    if (event.settings) {
                        console.log("Applying creator settings:", event.settings);
                        this.applySettings(event.settings);
                    }
                } 
                else if (event.role === 'JOIN') {
                    this.p2Id = event.userId;
                    this.p2Name = event.username;
                    // Notify P1 immediately
                    this.broadcast({ type: 'OPPONENT_JOINED', username: this.p2Name, userId: this.p2Id });
                }

                // Check Start Condition
                if (this.p1Id && this.p2Id && this.status === 'OPEN') {
                    this.startMatch();
                } else if (event.role === 'JOIN' && !this.p1Id) {
                    ws.send(JSON.stringify({ type: 'STATUS', message: "Waiting for host..." }));
                } else if (this.status === 'ACTIVE') {
                    // Reconnection Logic (Send current state to reconnecting user)
                    ws.send(JSON.stringify({
                        type: 'MATCH_START',
                        yourTurn: (this.currentTurnOwner === 'p1' && event.userId === this.p1Id) || (this.currentTurnOwner === 'p2' && event.userId === this.p2Id),
                        p1Info: { username: this.p1Name, id: this.p1Id },
                        p2Info: { username: this.p2Name, id: this.p2Id },
                        ...this.settings
                    }));
                }
                return;
            }

            // --- 2. SETTINGS SYNC ---
            if (event.type === 'UPDATE_SETTINGS') {
                // Only allow P1 (Host) to update settings
                const attachment = ws.deserializeAttachment();
                if (attachment && attachment.role === 'CREATE') {
                    this.applySettings(event);
                    // Broadcast new settings (e.g., Audio Mode toggle) to everyone
                    this.broadcast({ type: 'SETTINGS_UPDATE', settings: this.settings });
                }
                return;
            }

            // --- 3. GAMEPLAY ---
            if (event.type === 'SUBMIT_TURN') {
                const totalTurnsNeeded = this.settings.rounds * 2;

                // Prevent race conditions or spam
                if (this.isProcessingTurn || this.status === 'JUDGING' || this.transcript.length >= totalTurnsNeeded) {
                    return;
                }

                const attachment = ws.deserializeAttachment();
                if (!attachment) return;

                // VALIDATE TURN
                // Is it P1's turn and did P1 send this? Or P2?
                const isP1 = attachment.userId === this.p1Id;
                const isP2 = attachment.userId === this.p2Id;
                const expectedTurnId = this.currentTurnOwner === 'p1' ? this.p1Id : this.p2Id;

                if (attachment.userId !== expectedTurnId) {
                    // console.log("Rejected turn from wrong player");
                    return; 
                }

                // SET LOCK
                this.isProcessingTurn = true;

                try {
                    await this.processTurn(event, attachment.username);
                } catch (err) {
                    console.error("Turn Processing Error:", err);
                } finally {
                    // RELEASE LOCK
                    this.isProcessingTurn = false;
                }
            }

            // --- 4. TYPING INDICATOR ---
            if (event.type === 'TYPING') {
                // Broadcast to everyone EXCEPT the sender
                this.broadcast({ type: 'OPPONENT_TYPING' }, ws);
            }

            // --- 5. VOTING (Spectators) ---
            if (event.type === 'VOTE') {
                if (this.status !== 'JUDGING') return;
                                
                if (event.vote === 'p1') this.votes.p1++;
                if (event.vote === 'p2') this.votes.p2++;
            }

        } catch (e) {
            console.error("WS Message Error:", e);
        }
    }

    async webSocketClose(ws, code, reason, wasClean) {
        const attachment = ws.deserializeAttachment();
        if (!attachment) return;

        const isP1 = attachment.userId === this.p1Id;
        const isP2 = attachment.userId === this.p2Id;

        if ((isP1 || isP2) && (this.status === 'OPEN' || this.status === 'ACTIVE')) {
            this.status = 'ABANDONED';
            
            const winnerId = isP1 ? this.p2Id : this.p1Id;
            const winnerName = isP1 ? this.p2Name : this.p1Name;

            // Construct a result payload similar to a normal game end
            const forfeitResult = {
                winner: winnerName,
                winnerCode: isP1 ? 'p2_win' : 'p1_win',
                p1_verse: isP1 ? "DISCONNECTED" : (this.transcript.find(t => t.username === this.p1Name)?.text || "No verse"),
                p2_verse: !isP1 ? "DISCONNECTED" : (this.transcript.find(t => t.username === this.p2Name)?.text || "No verse"),
                scores: { 
                    comment: `Opponent (${attachment.username}) left the arena.`,
                    p1: { total: isP1 ? 0 : 20 },
                    p2: { total: !isP1 ? 0 : 20 }
                }
            };

            for (const socket of this.ctx.getWebSockets()) {
                const socketData = socket.deserializeAttachment();
                if (socketData && socketData.userId === winnerId) {
                    try {
                        socket.send(JSON.stringify({ 
                            type: 'OPPONENT_DISCONNECTED', 
                            result: forfeitResult 
                        }));
                    } catch(e) {}
                }
            }
        }
    }

    async webSocketError(ws, error) {
        console.error("WS Error:", error);
    }

    // =========================================================
    //  GAME LOGIC HELPERS
    // =========================================================

    applySettings(s) {
        if (s.rounds) this.settings.rounds = Number(s.rounds);
        if (s.turnTime) this.settings.turnTime = Number(s.turnTime);
        if (s.battleMode) this.settings.battleMode = String(s.battleMode); // 'audio' or 'text'
        if (s.mandatoryWord !== undefined) this.settings.mandatoryWord = s.mandatoryWord;
        
        console.log(`[Server] Room Configured: Mode=${this.settings.battleMode}, Rounds=${this.settings.rounds}`);
    }

    broadcast(msg, excludeWs = null) {
        const payload = JSON.stringify(msg);
        
        // Safety Check for Payload Size
        if (payload.length > 1000000) {
            console.error(`[CRITICAL] Payload too large to broadcast: ${(payload.length/1024).toFixed(2)}KB`);
            // Fallback: Send without audio data if it's too big
            if (msg.audioData) {
                const safeMsg = { ...msg, audioData: null, verse: msg.verse + " [Audio too large to send]" };
                this.broadcast(safeMsg, excludeWs);
                return;
            }
        }

        for (const ws of this.ctx.getWebSockets()) {
            if (ws !== excludeWs) {
                try { 
                    ws.send(payload); 
                } catch(e) {
                    console.error("Broadcast Failed to a client:", e);
                }
            }
        }
    }

    startMatch() {
        this.status = 'ACTIVE';
        this.transcript = [];
        this.currentTurnOwner = 'p1';
        this.votes = { p1: 0, p2: 0 };
        this.isProcessingTurn = false;

        const matchData = {
            type: 'MATCH_START',
            p1Info: { username: this.p1Name, id: this.p1Id },
            p2Info: { username: this.p2Name, id: this.p2Id },
            ...this.settings // This spreads rounds, turnTime, and battleMode
        };

        // Broadcast to P2 and Spectators (yourTurn: false)
        this.broadcast({ ...matchData, yourTurn: false });
        
        // Target P1 specifically (yourTurn: true)
        for (const ws of this.ctx.getWebSockets()) {
            const data = ws.deserializeAttachment();
            if (data && data.userId === this.p1Id) {
                try {
                    ws.send(JSON.stringify({ ...matchData, yourTurn: true }));
                } catch(e) {}
            }
        }
    }

    async processTurn(event, username) {
        console.log(`[Server] Processing turn for ${username}...`); 

        let text = event.verse || "Audio Verse";
        const totalTurnsNeeded = this.settings.rounds * 2;

        // 1. Add to transcript IMMEDIATELY (Synchronous)
        this.transcript.push({ 
            username: username, 
            text: text, 
            audioData: event.audioData 
        });

        const currentCount = this.transcript.length;

        // 2. Broadcast the verse to everyone
        const attachment = this.ctx.getWebSockets().find(ws => {
            const data = ws.deserializeAttachment();
            return data && data.username === username;
        })?.deserializeAttachment();
        const userId = attachment ? attachment.userId : null;
        this.broadcast({
            type: 'NEW_VERSE',
            verse: text, 
            audioData: event.audioData, 
            username: username,
            userId: userId, 
            totalRounds: this.settings.rounds,
            currentTurnCount: currentCount
        });

        // 3. Transcription (Background)
        // If it's an audio verse, we update the text in the transcript for the judge later.
        if (event.audioData && this.env.AI) {
            this.ctx.waitUntil((async () => {
                try {
                    const base64 = event.audioData.split(',')[1] || event.audioData;
                    const binaryString = atob(base64);
                    if (binaryString.length < 500000) { 
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                        const aiRes = await this.env.AI.run('@cf/openai/whisper', { audio: Array.from(bytes) });
                        if (aiRes.text) {
                            // Update the last entry in the transcript with the real text
                            this.transcript[currentCount - 1].text = aiRes.text;
                        }
                    }
                } catch(e) { console.error("BG Transcribe Error", e); }
            })());
        }

        // 4. CHECK END CONDITION
        // If we have reached the limit (e.g., 2 turns for 1 round), end the game.
        if (currentCount >= totalTurnsNeeded) {
            console.log("[Server] Match Complete. Broadcasting Judging...");
            
            // Small delay so the last verse UI finishes rendering on clients
            await new Promise(r => setTimeout(r, 1500)); 
            
            this.broadcast({ type: 'JUDGING' });
            await this.handleGameEnd();
        } else {
            // 5. SWAP TURN
            // Only swap if the game isn't over!
            this.currentTurnOwner = this.currentTurnOwner === 'p1' ? 'p2' : 'p1';
            console.log("[Server] Next turn:", this.currentTurnOwner);
        }
    }

    async handleGameEnd() {
        this.status = 'JUDGING';

        // 1. Prepare Promises
        const judgePromise = this.runJudge(this.transcript, this.settings.mandatoryWord);
        
        // Timeout protection (if AI hangs)
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ 
            winner: 'Draw', 
            scores: { comment: "The judges timed out.", p1: { total: 0 }, p2: { total: 0 } },
            timeout: true
        }), 20000)); // 20s timeout

        // Suspense (Min 3s wait so the "Judging" screen isn't just a blip)
        const suspensePromise = new Promise(r => setTimeout(r, 3000));
        
        const [aiResult] = await Promise.all([
            Promise.race([judgePromise, timeoutPromise]),
            suspensePromise
        ]);

        // 3. Add Audience Score
        const totalVotes = this.votes.p1 + this.votes.p2;
        if (totalVotes > 0 && !aiResult.timeout) {
            const p1Audience = Math.round((this.votes.p1 / totalVotes) * 10); // Max 10 pts
            const p2Audience = Math.round((this.votes.p2 / totalVotes) * 10);
            
            // Initialize if missing (safety)
            if (!aiResult.scores.p1) aiResult.scores.p1 = { total: 0 };
            if (!aiResult.scores.p2) aiResult.scores.p2 = { total: 0 };

            aiResult.scores.p1.audience = p1Audience;
            aiResult.scores.p2.audience = p2Audience;
            aiResult.scores.p1.total += p1Audience;
            aiResult.scores.p2.total += p2Audience;
        }

        // 4. Determine Winner
        const p1Score = aiResult.scores.p1?.total || 0;
        const p2Score = aiResult.scores.p2?.total || 0;
        let pointsEarned = 0;

        if (p1Score > p2Score) {
            aiResult.winner = this.p1Name;
            aiResult.winnerCode = 'p1_win';
            pointsEarned = 20 + p1Score;
        } else if (p2Score > p1Score) {
            aiResult.winner = this.p2Name;
            aiResult.winnerCode = 'p2_win';
            pointsEarned = 20 + p2Score;
        } else {
            aiResult.winner = "Draw";
            pointsEarned = 10 + p1Score;
        }
        
        aiResult.pointsEarned = pointsEarned;
        aiResult.p1_name = this.p1Name; // Explicitly send names for Result screen
        aiResult.p2_name = this.p2Name;
        aiResult.transcript = this.transcript; // Include audioData for replay

        // 5. Save & Update
        try {
            const savedID = await this.saveBattleToDB(aiResult);
            aiResult.battle_id = savedID;
            await this.updateLeaderboard(aiResult.winner, pointsEarned);
        } catch(e) { console.error("DB/Leaderboard Error", e); }

        // 6. Broadcast Result
        this.broadcast({ type: 'RESULT', result: aiResult });
        this.status = 'FINISHED';
    }

    async runJudge(transcript, word) {
        try {
            // 1. DATA PREP
            const cleanText = (txt) => txt.replace(/<[^>]*>/g, '').trim();
            
            const p1Data = transcript.find(t => t.username === this.p1Name);
            const p2Data = transcript.find(t => t.username === this.p2Name);
            
            const p1Text = p1Data ? cleanText(p1Data.text) : "";
            const p2Text = p2Data ? cleanText(p2Data.text) : "";

            // 2. GARBAGE COLLECTION (Auto-Fail if too short)
            // If less than 10 chars, don't even ask the AI.
            const p1Fail = p1Text.length < 10;
            const p2Fail = p2Text.length < 10;

            if (p1Fail && p2Fail) {
                return { 
                    winner: 'Draw', 
                    p1_verse: p1Text, p2_verse: p2Text,
                    scores: { 
                        comment: "Both rappers choked. No bars detected.", 
                        p1: { total: 0, rhyme:0, flow:0, bars:0, aggression:0 }, 
                        p2: { total: 0, rhyme:0, flow:0, bars:0, aggression:0 } 
                    } 
                };
            }

            // 3. CONSTRUCT PROMPT
            // We explicitly tag the verses so the AI knows who said what
            let battleText = `
                <p1_name>${this.p1Name}</p1_name>
                <p1_verse>${p1Text}</p1_verse>
                
                <p2_name>${this.p2Name}</p2_name>
                <p2_verse>${p2Text}</p2_verse>
            `;

            let wordInstructions = word ? `MANDATORY WORD: "${word}". If used correctly in a sentence, set "word_bonus": 10. If not used, 0.` : '';

            // 4. STRICTER SYSTEM PROMPT
            const prompt = `Act as a harsh, incorruptible Battle Rap Judge.
                
                BATTLE CONTEXT:
                ${battleText}
                ${wordInstructions}
                
                CRITICAL RULES:
                1. If a verse is less than 5 words long, score it 0 across the board.
                2. If a verse makes no sense or is just "Thank you" / "Hello", score it 0.
                3. High scores (8-10) are RESERVED for multi-syllable rhymes and complex wordplay only.
                
                RUBRIC (0-10 each): 
                - Rhyme (Complexity of rhyme scheme)
                - Flow (Rhythm and structure)
                - Bars (Punchlines/Roasts)
                - Aggression (Attitude)

                RETURN JSON ONLY (No markdown, no intro): 
                { 
                    "p1": { "rhyme": 0, "flow": 0, "bars": 0, "aggression": 0, "word_bonus": 0, "total": 0 }, 
                    "p2": { ... }, 
                    "winner": "${this.p1Name}" or "${this.p2Name}" or "Draw", 
                    "comment": "A 1-sentence summary of why." 
                }`;

            const res = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', { messages: [{ role: 'user', content: prompt }] });
            
            // 5. PARSE AI RESPONSE
            const match = res.response.match(/\{[\s\S]*\}/);
            if (!match) throw new Error("Invalid JSON from AI");
            const data = JSON.parse(match[0]);
            
            // 6. SANITY CHECK & TOTALS
            ['p1', 'p2'].forEach(p => {
                if (data[p]) {
                    // Recalculate total to ensure math is correct
                    data[p].total = (data[p].rhyme||0) + (data[p].flow||0) + (data[p].bars||0) + (data[p].aggression||0) + (data[p].word_bonus||0);
                }
            });

            return { 
                scores: data, 
                winner: data.winner,
                p1_verse: p1Text,
                p2_verse: p2Text
            };

        } catch (e) {
            console.error("Judge Exception", e);
            // Fallback result on error
            return { 
                winner: 'Draw', 
                scores: { 
                    comment: "The judges are confused (System Error).", 
                    p1: { total: 0 }, 
                    p2: { total: 0 } 
                },
                p1_verse: transcript.find(t => t.username === this.p1Name)?.text || "",
                p2_verse: transcript.find(t => t.username === this.p2Name)?.text || ""
            };
        }
    }

    async updateLeaderboard(winnerUsername, finalPoints) {
        if (!winnerUsername || winnerUsername === "Draw") return;
        
        let winnerId = (winnerUsername === this.p1Name) ? this.p1Id : (winnerUsername === this.p2Name ? this.p2Id : null);
        if (!winnerId) return;

        try {
            // Update User Profile
            const userStub = this.env.USER_PROFILE.get(this.env.USER_PROFILE.idFromName(winnerId));
            await userStub.fetch('http://do/update', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ result: 'win', type: 'pvp', pointsValue: finalPoints }) 
            });

            // Update Global Leaderboard
            const lbId = this.env.LEADERBOARD.idFromName('GLOBAL_PVP');
            await this.env.LEADERBOARD.get(lbId).fetch('http://do/submit', { 
                method: 'POST', 
                body: JSON.stringify({ username: winnerUsername, userId: winnerId, score: finalPoints }) 
            });
        } catch (e) { console.error("PvP Leaderboard Update Failed:", e); }
    }

    async saveBattleToDB(result) {
        if (!this.env.DB) return null;
        const battleID = crypto.randomUUID();
        try {
            await this.env.DB.prepare(`
                INSERT INTO battles (id, p1_name, p2_name, p1_verse, p2_verse, winner, timestamp) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
                battleID, 
                this.p1Name, 
                this.p2Name, 
                result.p1_verse, 
                result.p2_verse, 
                result.winner, 
                Date.now()
            ).run();
            return battleID;
        } catch (e) { 
            console.error("DB Save Failed", e); 
            return null; 
        }
    }
}