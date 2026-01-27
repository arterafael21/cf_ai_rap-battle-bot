import { DurableObject } from "cloudflare:workers";

export class Matchmaker extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
    }

    async fetch(request) {
        const upgrade = request.headers.get("Upgrade");
        if (!upgrade || upgrade.toLowerCase() !== "websocket") {
            return new Response("Expected WebSocket", { status: 426 });
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        // 1. Handle Hibernation
        this.ctx.acceptWebSocket(server); 

        // 2. Prepare Headers for Safari/iOS
        // Safari can be strict about needing these headers explicitly in the 101 response.
        const responseHeaders = new Headers();
        responseHeaders.set('Upgrade', 'websocket');
        responseHeaders.set('Connection', 'Upgrade');

        // 3. Protocol Echo (Crucial for iOS stability)
        // If the client sends a protocol, we MUST echo it back or iOS drops the connection.
        const protocol = request.headers.get("Sec-WebSocket-Protocol");
        if (protocol) {
            responseHeaders.set("Sec-WebSocket-Protocol", protocol);
        }

        this.startHeartbeat();

        try {
            server.send(JSON.stringify({ type: 'CONNECTED', ts: Date.now() }));
        } catch (e) {
            console.error("Initial send failed:", e);
        }


        // 4. Trigger Matching Logic
        setTimeout(() => this.matchPlayers(), 100);

        return new Response(null, { 
            status: 101, 
            webSocket: client,
            headers: responseHeaders
        });
    }

    startHeartbeat() {
        if (this.heartbeatTimer) return;

        this.heartbeatTimer = setInterval(() => {
            const sockets = this.ctx.getWebSockets();
            
            if (sockets.length === 0) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
                return;
            }

            for (const ws of sockets) {
                try {
                    ws.send(JSON.stringify({ type: 'PING', ts: Date.now() }));
                } catch (e) {
                    // Socket closing, ignore
                }
            }
        }, 3000); // 3s is safer for mobile than 5s
    }


    async webSocketMessage(ws, message) {
        console.log("Queue received:", message);
    }

    async webSocketClose(ws, code, reason, wasClean) {
        console.log("Queue Disconnect:", code, reason);
    }

    async webSocketError(ws, error) {
        console.log("Queue Error:", error);
    }

    matchPlayers() {
        // Get all active sockets securely
        const sockets = [...this.ctx.getWebSockets()];
        
        while (sockets.length >= 2) {
            const p1 = sockets.shift();
            const p2 = sockets.shift();

            const battleId = crypto.randomUUID();
            
            // Default config - will be overridden by Private Match settings later if strictly following protocol
            const config = { 
                rounds: 1, 
                turnTime: 30, 
                battleMode: 'text', 
                mandatoryWord: null
            };

            const msg = { type: 'MATCH_FOUND', battleId, config };

            try {
                // Attach roles so we can track them
                p1.serializeAttachment({ role: 'CREATE' });
                p2.serializeAttachment({ role: 'JOIN' });

                p1.send(JSON.stringify({ ...msg, role: 'CREATE' }));
                p2.send(JSON.stringify({ ...msg, role: 'JOIN' }));
                
                // Don't close immediately. Let the client close it.
                // But if they don't disconnect in 5s, we boot them to clear the queue.
                setTimeout(() => {
                    try { p1.close(); p2.close(); } catch(e){}
                }, 5000);

            } catch (e) {
                console.error("Match error", e);
            }
        }
    }
}