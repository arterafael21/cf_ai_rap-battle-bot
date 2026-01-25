import { getRandomWord } from './constants';

export class Matchmaker {
    constructor(state, env) {
        this.state = state;
        this.sessions = []; // Queue of waiting sockets/players
    }

    async fetch(request) {
        if (request.headers.get("Upgrade") !== "websocket") {
            return new Response("Expected WebSocket", { status: 400 });
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        this.handleSession(server);

        return new Response(null, { status: 101, webSocket: client });
    }

    handleSession(socket) {
        socket.accept();
        this.sessions.push(socket);

        console.log(`Queue Update: ${this.sessions.length} player(s) waiting.`);

        // Check if we have a pair
        if (this.sessions.length >= 2) {
            this.matchPlayers();
        }

        // Handle disconnects (remove from queue)
        socket.addEventListener('close', () => {
            this.sessions = this.sessions.filter(s => s !== socket)
            console.log(`Queue Update: Player left. ${this.sessions.length} player(s) waiting.`);
        });
    }

    matchPlayers() {
        const p1 = this.sessions.shift();
        const p2 = this.sessions.shift();

        if (!p1 || !p2) return;

        const battleId = crypto.randomUUID();
        
        // --- RANDOMIZED MATCH SETTINGS ---
        const rounds = Math.floor(Math.random() * 3) + 1; // 1 to 3 rounds
        const turnTime = Math.floor(Math.random() * 16) + 15; // 15 to 30 seconds
        const mandatoryWord = Math.random() > 0.5 ? getRandomWord() : null; // 50% chance of word
        
        const config = {
            rounds,
            turnTime,
            mandatoryWord,
            battleMode: 'text' 
        };

        try {
            // Send config to Creator (P1) so they can init the room with it
            p1.send(JSON.stringify({ type: 'MATCH_FOUND', battleId, role: 'CREATE', config }));
            // Send config to Joiner (P2) just for their info (optional)
            p2.send(JSON.stringify({ type: 'MATCH_FOUND', battleId, role: 'JOIN', config }));
        } catch (e) { console.error("Match send failed", e); }
        
        setTimeout(() => {
            try { p1.close(); } catch (e) {}
            try { p2.close(); } catch (e) {}
        }, 100);
    }
}