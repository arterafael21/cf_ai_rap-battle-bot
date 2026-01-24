import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClerkClient } from '@clerk/backend';
import { UserProfile } from './UserProfile';
import { Leaderboard } from './Leaderboard';
import { Challenge } from './Challenge';

const app = new Hono();

app.use('/*', cors());

const OPPONENTS = {
    'roboflow': {
        name: 'RoboFlow',
        system: 'You are RoboFlow, a basic battle rapper. Keep rhymes simple (AABB). Be mildly competitive but not too mean. Match the number of lines the User gives in their verse. CRITICAL FOR AUDIO: End every single line with a comma or period to ensure the voice pauses correctly.',
        difficultyModifier: 0 
    },
    'bytebeater': {
        name: 'ByteBeater',
        system: 'You are ByteBeater, an elite technical lyricist. Use multi-syllabic rhymes, complex metaphors, and aggressive flows. DESTROY your opponent. CRITICAL FOR AUDIO: Use commas frequently within lines to create a choppy, aggressive rhythm. End every line with a period.',
        difficultyModifier: 3
    },
    'ai-ce': {
        name: 'AI-CE',
        system: 'You are AI-CE, a goofy, clownish rapper. Your goal is to be funny. Roast the user but also make self-deprecating jokes. Use slang. Match the number of lines the User gives in their verse. CRITICAL FOR AUDIO: End every line with a comma or period to perfect your comedic timing.',
        difficultyModifier: -2 
    }
};

// --- 1. SINGLE PLAYER BATTLE ROUTE (SECURED) ---
app.post('/battle', async (c) => {
    // 1. Verify Auth Token
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
        return c.json({ error: "Missing Authorization Header" }, 401);
    }

    const token = authHeader.split(' ')[1];
    
    // Initialize Clerk with the secret from environment variables
    const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });

    let userId;
    try {
        const { payload } = await clerk.verifyToken(token);
        userId = payload.sub; 
    } catch (e) {
        console.error("Auth Error", e);
        return c.json({ error: "Invalid or Expired Token" }, 401);
    }

    // 2. Process Request
    const body = await c.req.json();
    const userRap = body.userRap || 'freestyle';
    const opponentID = body.opponent || 'roboflow';
    const opponentConfig = OPPONENTS[opponentID] || OPPONENTS['roboflow'];
    
    // 3. AI Rapper Generation
    const rapperRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
            { role : 'system', content: opponentConfig.system },
            { role: 'user', content: userRap }
        ]
    });
    const aiVerse = rapperRes.response;

    // 4. AI Judge
    const judgeRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
            { 
                role: 'system', 
                content: `You are a strict rap battle judge. Rate each 1-10 on Rhyme, Flow, Insults, Creativity.
                IMPORTANT RULES:
                1. Output ONLY valid JSON.
                2. Do NOT write any text before or after the JSON.
                3. Do NOT use double quotes (") inside your strings. Use single quotes (').
                
                Example format:
                { "user": { "rhyme": 5, "flow": 5, "creativity": 5 }, "ai": { "rhyme": 5, "flow": 5, "creativity": 5 }, "comment": "Good flow." }`
            },
            { role: 'user', content: `User: "${userRap}"\nAI: "${aiVerse}"`}
        ]
    });

    let scores = {
        user: { total: 0 },
        ai: { total: 0 },
        comment: "Judging Error"
    };

    try {
        const raw = judgeRes.response;
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            
            const u = parsed.user || {};
            const a = parsed.ai || {};
            
            scores.user = { ...u, total: (u.rhyme||0) + (u.flow||0) + (u.insults||0) + (u.creativity||0) };
            scores.ai = { ...a, total: (a.rhyme||0) + (a.flow||0) + (a.insults||0) + (a.creativity||0) };
            scores.comment = parsed.comment || "Close battle.";
            
            scores.ai.total += opponentConfig.difficultyModifier;
        }
    } catch (e) {
        console.error('Judge Error', e);
    }

    const result = scores.user.total > scores.ai.total ? "win" : "loss";
    
    // 5. Update Stats (Durable Objects) using Clerk User ID
    try {
        const id = c.env.USER_PROFILE.idFromName(userId); // Use userId instead of username
        const stub = c.env.USER_PROFILE.get(id);
        
        // Update Personal Stats
        const userUpdateRes = await stub.fetch('http://do/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: result, type: 'ai' }) // Explicitly type as AI battle
        });
        const userData = await userUpdateRes.json();
        
        if (result === 'win' && userData.wins_against_ai) {
            const lbId = c.env.LEADERBOARD.idFromName("GLOBAL");
            const lbStub = c.env.LEADERBOARD.get(lbId);
            
            await lbStub.fetch('http://do/submit', {
                method: 'POST',
                body: JSON.stringify({ username: userId, wins: userData.wins_against_ai })
            });
        }

    } catch (e) {
        console.error('Failed to update stats', e);
    }

    return c.json({ userRap, aiVerse, result, scores, opponent: opponentConfig.name });
});

// --- 2. TRANSCRIPTION ---
app.post('/transcribe', async (c) => {
    const audioData = await c.req.arrayBuffer();
    if (!audioData || audioData.byteLength === 0) {
        return c.json({ error: 'No audio data received' }, 400);
    }
    const response = await c.env.AI.run('@cf/openai/whisper', {
        audio: [...new Uint8Array(audioData)]
    });
    return c.json({ text: response.text });
});

// --- 3. GET PROFILE ---
app.get('/profile/:userId', async (c) => {
    const userId = c.req.param('userId');
    const id = c.env.USER_PROFILE.idFromName(userId);
    const obj = c.env.USER_PROFILE.get(id);
    const response = await obj.fetch('http://do/stats');
    const stats = await response.json();
    return c.json({ user: userId, data: stats });
});

// --- 4. TTS (SPEAK) ---
app.post('/speak', async (c) => {
    const { text } = await c.req.json();
    try {
        const response = await c.env.AI.run('@cf/myshell-ai/melotts', {
            prompt: text, lang: 'en',
        });
        
        const base64Audio = response.audio;
        if (!base64Audio) throw new Error('No audio data returned from model');

        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return new Response(bytes.buffer, {
            headers: { 'Content-Type': 'audio/mpeg' }
        });
        
    } catch(e) {
        return c.json({ error: 'TTS Failed' }, 500);
    }
});

// --- 5. MULTIPLAYER CHALLENGE HELPERS ---
// (Note: Most logic is now handled via WebSocket in Challenge.js)

app.post('/challenge/create', async (c) => {
    const { username, verse } = await c.req.json();

    const id = c.env.CHALLENGE.newUniqueId();
    const hexId = id.toString();

    const stub = c.env.CHALLENGE.get(id);
    await stub.fetch('http://do/create', {
        method: 'POST',
        headers: { 'Content-Type' : 'application/json' },
        body: JSON.stringify({ username, verse })
    });

    return c.json({ battleId: hexId });
})

app.get('/challenge/:id', async (c) => {
    const hexId = c.req.param('id');
    try {
        const id = c.env.CHALLENGE.idFromString(hexId);
        const stub = c.env.CHALLENGE.get(id);
        const res = await stub.fetch('http://do/state');
        const data = await res.json();
        return c.json(data);
    } catch (e) {
        return c.json({ error: "Battle Not Found" }, 404);
    }
})

// --- 6. LEADERBOARDS ---
app.get('/leaderboard', async (c) => {
    try {
        const id = c.env.LEADERBOARD.idFromName("GLOBAL");
        const stub = c.env.LEADERBOARD.get(id);
        const response = await stub.fetch(c.req.raw); 
        const data = await response.json();
        return c.json(data);
    } catch (e) {
        console.error('Leaderboard Error:', e);
        return c.json([], 200);
    }
});

app.get('/leaderboard/pvp', async (c) => {
    try {
        const id = c.env.LEADERBOARD.idFromName("GLOBAL_PVP");
        const stub = c.env.LEADERBOARD.get(id);

        const response = await stub.fetch('http://do/');
        const data = await response.json();
        return c.json(data);
    } catch (e) {
        console.error(e);
        return c.json([], 200);
    }
})

// --- 7. WEBSOCKET ROUTE ---
app.get('/ws/battle/:id', async (c) => {
    const upgradeHeader = c.req.header('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return c.text('Expected Upgrade: websocket', 426);
    }

    const idStr = c.req.param('id');

    let id;
    try {
        id = c.env.CHALLENGE.idFromName(idStr);
    } catch {
        id = c.env.CHALLENGE.newUniqueId();
    }

    const stub = c.env.CHALLENGE.get(id);
    return stub.fetch(c.req.raw);
})

// --- 8. REPLAY (D1 DATABASE) ---
app.get('/replay/:id', async (c) => {
    const id = c.req.param('id')

    if (!c.env.DB) {
        return c.json({ error: 'Database not configured' }, 500);
    }

    try {
        // Fetch battle from D1
        const result = await c.env.DB.prepare('SELECT * FROM battles WHERE id=?')
            .bind(id)
            .first();

        if (!result) {
            return c.json({ error: "Battle not found" }, 404);
        }

        return c.json(result);
    } catch (e) {
        console.error("D1 Error", e);
        return c.json({ error: 'Database error' }, 500);
    }
});

export default app;
export { UserProfile, Leaderboard, Challenge };