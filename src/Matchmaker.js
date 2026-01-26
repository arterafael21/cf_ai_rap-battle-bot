import { getRandomWord } from './constants';
import { DurableObject } from "cloudflare:workers";

export class Matchmaker extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.ctx = ctx;
        this.env = env;
        this.sessions = [];
    }

    async fetch(request) {
        const upgrade = request.headers.get("Upgrade");
        if (!upgrade || upgrade.toLowerCase() !== "websocket") {
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
        while (this.sessions.length >= 2) {
            const p1 = this.sessions.shift();
            const p2 = this.sessions.shift();

            // Validate sockets are open before matching
            if (p1.readyState !== WebSocket.OPEN) {
                if (p2.readyState === WebSocket.OPEN) this.sessions.unshift(p2);
                continue;
            }
            if (p2.readyState !== WebSocket.OPEN) {
                if (p1.readyState === WebSocket.OPEN) this.sessions.unshift(p1);
                continue;
            }

            const battleId = crypto.randomUUID();
            
            // Random Config
            const rounds = Math.floor(Math.random() * 3) + 1;
            const turnTime = 30; 
            const words = ["FIRE", "POWER", "SKILL", "LEGEND", "KING", "MICROPHONE"];
            const mandatoryWord = Math.random() > 0.5 ? words[Math.floor(Math.random() * words.length)] : null;
            
            const config = { rounds, turnTime, mandatoryWord, battleMode: 'text' };

            try {
                p1.send(JSON.stringify({ type: 'MATCH_FOUND', battleId, role: 'CREATE', config }));
                p2.send(JSON.stringify({ type: 'MATCH_FOUND', battleId, role: 'JOIN', config }));
            } catch (e) { console.error("Match send failed", e); }
            
            // Close sockets shortly after match found
            setTimeout(() => {
                try { p1.close(); } catch (e) {}
                try { p2.close(); } catch (e) {}
            }, 1000);
        }
    }
}