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
        // Get first two players
        const p1 = this.sessions.shift();
        const p2 = this.sessions.shift();

        if (!p1 || !p2) return;

        // Generate Unique Battle Room ID
        const battleId = crypto.randomUUID();
        console.log(`Match Found! Starting Battle ID: ${battleId}`);

        // Assign roles
        try {
            const msgP1 = JSON.stringify({ type: 'MATCH_FOUND', battleId, role: 'CREATE'});
            const msgP2 = JSON.stringify({ type: 'MATCH_FOUND', battleId, role: 'JOIN'});

            p1.send(msgP1);
            p2.send(msgP2);

        } catch (e) { console.error("Match send failed", e); }
        

        setTimeout(() => {
            try { p1.close(); } catch (e) {}
            try { p2.close(); } catch (e) {}
        }, 100);
    }
}