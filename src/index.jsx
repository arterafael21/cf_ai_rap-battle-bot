import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verifyToken } from '@clerk/backend';
import { UserProfile } from './UserProfile';
import { Leaderboard } from './Leaderboard';
import { Challenge } from './Challenge';
import { getRandomWord, OPPONENTS } from '../src/constants'; 
import { Matchmaker } from './Matchmaker'

const app = new Hono();

app.use('/*', cors());

// --- HELPER: VERIFY AUTH ---
async function verifyAuth(c) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) throw new Error("Missing Authorization Header");

    if (!c.env.CLERK_SECRET_KEY) {
        console.error("CRITICAL: CLERK_SECRET_KEY is missing in backend env!");
        throw new Error("Server Configuration Error");
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = await verifyToken(token, {
            secretKey: c.env.CLERK_SECRET_KEY
        });
        return payload.sub; // The User ID
    } catch (e) {
        console.error("Clerk Verify Failed:", e.message);
        throw new Error("Invalid Token");
    }
}

// --- 1. BATTLE ROUTE ---
app.post('/battle', async (c) => {
    let userId;
    try { userId = await verifyAuth(c); } 
    catch (e) { return c.json({ error: e.message }, 401); }

    const body = await c.req.json();
    const userRap = body.userRap || 'freestyle';
	const mandatoryWord = body.mandatoryWord;
    const opponentID = body.opponent || 'roboflow';
    const opponentConfig = OPPONENTS[opponentID] || OPPONENTS['roboflow'];
    
    // FETCH USER CONTEXT
    let visualContext = "";
    if (c.env.DB) {
        try {
            const userRow = await c.env.DB.prepare('SELECT roast_context FROM users WHERE id = ?').bind(userId).first();
            if (userRow && userRow.roast_context) {
                visualContext = `\nVISUAL CONTEXT FOR ROASTING: The user looks like this: "${userRow.roast_context}". USE THIS TO ROAST THEM.`;
            } else {
				visualContext = `\nVISUAL CONTEXT: The user has NO profile photo. OPTIONAL: Mock them for being anonymous or scared to show their face.`;
			}
        } catch(e) { console.log("DB Roast Fetch Error", e); }
    }

    const systemPrompt = opponentConfig.system + visualContext;

    // AI RAPPER
    const rapperRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
            { role : 'system', content: systemPrompt },
            { role: 'user', content: userRap }
        ]
    });
    const aiVerse = rapperRes.response;

	let judgeSystemPrompt = `
		You are a strict rap battle judge.
		RUBRIC (Score 0-40 total):
		1. Rhymes (1-10): Multis get high scores, simple rhymes get low.
		2. Flow (1-10): Rhythm and readability.
		3. Roasts (1-10): Direct insults vs generic filler.
		4. Creativity (1-10): Wordplay and metaphors.
		
		RETURN JSON ONLY, nothing else: { "user": { "rhyme": 5, "flow": 5, "roast": 5, "creativity": 5, "word_bonus": 0 }, "ai": { "rhyme": 5, ... }, "comment": "..." }
    `;

    // Only add mandatory rule if it is NOT null
    if (mandatoryWord && mandatoryWord !== 'NONE') {
        judgeSystemPrompt += ` 
			MANDATORY RULE: Check if they used the word "${mandatoryWord}". 
			If used, set "word_bonus": 10. If not, 0.
        `;   
    }

    // AI JUDGE
    const judgeRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
			{ role: 'system', content: judgeSystemPrompt },
			{ role: 'user', content: `User: "${userRap}"\nAI: "${aiVerse}"`}
        ]
    });

    let scores = { user: { total: 0 }, ai: { total: 0 }, comment: "Judging Error" };

    try {
        const raw = judgeRes.response;
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const u = parsed.user || {};
            const a = parsed.ai || {};
            scores.user = { ...u, total: (u.rhyme||0) + (u.flow||0) + (u.insults||0) + (u.creativity||0) + (u.word_bonus||0) };
            scores.ai = { ...a, total: (a.rhyme||0) + (a.flow||0) + (a.insults||0) + (a.creativity||0) };
            scores.comment = parsed.comment || "Close battle.";
            
            scores.ai.total += opponentConfig.difficultyModifier;
        }
    } catch (e) { console.error('Judge Error', e); }

    const result = scores.user.total > scores.ai.total ? "win" : "loss";
    
    // UPDATE STATS
    try {
        const id = c.env.USER_PROFILE.idFromName(userId);
        const stub = c.env.USER_PROFILE.get(id);
		const hasWordBonus = scores.user.word_bonus > 0;

		// 1. UPDATE PROFILE
        const userUpdateRes = await stub.fetch('http://do/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: result, type: 'ai', hasWordBonus: hasWordBonus })
        });
        const userData = await userUpdateRes.json();

		// 2. SUBMIT TO LEADERBOARD
        if (result === 'win' && userData.ai_score > 0) {
            const lbId = c.env.LEADERBOARD.idFromName("GLOBAL");
            const lbStub = c.env.LEADERBOARD.get(lbId);
            await lbStub.fetch('http://do/submit', {
                method: 'POST',
                body: JSON.stringify({ username: userId, wins: userData.ai_score })
            });
        }
    } catch (e) { console.error('Failed to update stats', e); }

    return c.json({ userRap, aiVerse, result, scores, opponent: opponentConfig.name });
});

app.post('/transcribe', async (c) => {
    const audioData = await c.req.arrayBuffer();
    if (!audioData || audioData.byteLength === 0) return c.json({ error: 'No audio' }, 400);
    const response = await c.env.AI.run('@cf/openai/whisper', { audio: [...new Uint8Array(audioData)] });
    return c.json({ text: response.text });
});

app.get('/profile/:userId', async (c) => {
    const userId = c.req.param('userId');
    const id = c.env.USER_PROFILE.idFromName(userId);
    const obj = c.env.USER_PROFILE.get(id);
    const response = await obj.fetch('http://do/stats');
    const stats = await response.json();

    let identity = { mc_name: null, roast_context: null };
    if (c.env.DB) {
        try {
            const userRow = await c.env.DB.prepare('SELECT mc_name, roast_context FROM users WHERE id=?').bind(userId).first();
            if (userRow) identity = userRow;
        } catch(e) {}
    }
    return c.json({ user: userId, data: stats, identity });
});

app.post('/speak', async (c) => {
    const { text } = await c.req.json();
    try {
        const response = await c.env.AI.run('@cf/myshell-ai/melotts', { prompt: text, lang: 'en' });
        const binaryString = atob(response.audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        return new Response(bytes.buffer, { headers: { 'Content-Type': 'audio/mpeg' } });
    } catch(e) { return c.json({ error: 'TTS Failed' }, 500); }
});

// --- CHALLENGE HELPERS ---
app.post('/challenge/create', async (c) => {
    const { username, verse } = await c.req.json();
    const id = c.env.CHALLENGE.newUniqueId();
    const stub = c.env.CHALLENGE.get(id);
    await stub.fetch('http://do/create', {
        method: 'POST',
        headers: { 'Content-Type' : 'application/json' },
        body: JSON.stringify({ username, verse })
    });
    return c.json({ battleId: id.toString() });
})

app.get('/challenge/:id', async (c) => {
    try {
        const id = c.env.CHALLENGE.idFromString(c.req.param('id'));
        const stub = c.env.CHALLENGE.get(id);
        const res = await stub.fetch('http://do/state');
        return c.json(await res.json());
    } catch (e) { return c.json({ error: "Battle Not Found" }, 404); }
})

app.get('/leaderboard', async (c) => {
    const id = c.env.LEADERBOARD.idFromName("GLOBAL");
    const stub = c.env.LEADERBOARD.get(id);
    const response = await stub.fetch(c.req.raw); 
    return c.json(await response.json());
});

app.get('/leaderboard/pvp', async (c) => {
    const id = c.env.LEADERBOARD.idFromName("GLOBAL_PVP");
    const stub = c.env.LEADERBOARD.get(id);
    const response = await stub.fetch('http://do/');
    return c.json(await response.json());
})

app.get('/ws/battle/:id', async (c) => {
    if (c.req.header('Upgrade') !== 'websocket') return c.text('Expected websocket', 426);
    let id;
    try { id = c.env.CHALLENGE.idFromName(c.req.param('id')); } 
    catch { id = c.env.CHALLENGE.newUniqueId(); }
    return c.env.CHALLENGE.get(id).fetch(c.req.raw);
})

app.get('/replay/:id', async (c) => {
    if (!c.env.DB) return c.json({ error: 'DB not configured' }, 500);
    const result = await c.env.DB.prepare('SELECT * FROM battles WHERE id=?').bind(c.req.param('id')).first();
    if (!result) return c.json({ error: "Battle not found" }, 404);
    return c.json(result);
});

// --- ONBOARDING: UPDATE NAME ---
app.post('/onboarding/update', async (c) => {
    let userId;
    try { userId = await verifyAuth(c); } 
    catch (e) { return c.json({ error: e.message }, 401); }

    const { mcName } = await c.req.json();

	if (!mcName || mcName.length < 3) {
		return c.json({ error: "Name must be at leasat 3 chars" }, 400);
	}

    try {
		const taken = await c.env.DB.prepare('SELECT id FROM users WHERE mc_name=? AND id !=?')
			.bind(mcName, userId)
			.first();
		
		if (taken) {
			return c.json({ error: "Username already taken" }, 409);
		}

        const existing = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first();
        if (existing) {
            await c.env.DB.prepare('UPDATE users SET mc_name=? WHERE id=?').bind(mcName, userId).run();
        } else {
            await c.env.DB.prepare('INSERT INTO users (id, mc_name, created_at) VALUES (?, ?, ?)')
                .bind(userId, mcName, Date.now()).run();
        }
        return c.json({ success: true });
    } catch (e) {
        console.error("DB Error", e);
        return c.json({ error: "Database error" }, 500);
    }
});

// --- ONBOARDING: UPLOAD IMAGE ---
app.post('/onboarding/upload', async (c) => {
    let userId;
    try { 
        userId = await verifyAuth(c); 
    } catch (e) { 
        return c.json({ error: e.message }, 401); 
    }

    // 1. CRITICAL: Use parseBody() for Multipart Form Data (Images)
    const formData = await c.req.parseBody();
    const imageFile = formData['image'];

    if (!imageFile || !(imageFile instanceof File)) {
        return c.json({ error: 'No valid image provided' }, 400);
    }

    try {
        const arrayBuffer = await imageFile.arrayBuffer();
        
        // 2. Size Check (D1 has a 1MB limit per row by default)
        if (arrayBuffer.byteLength > 1024 * 1024) {
            return c.json({ error: 'Image too large. Max 1MB.' }, 400);
        }

        const bytes = new Uint8Array(arrayBuffer);
        
        // 3. Convert to Base64 for DB Storage
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64String = `data:${imageFile.type};base64,${btoa(binary)}`;

        // 4. Save to Database
        const query = `
            INSERT INTO users (id, avatar_base64, created_at) 
            VALUES (?, ?, ?) 
            ON CONFLICT(id) DO UPDATE SET avatar_base64 = excluded.avatar_base64
        `;
        
        await c.env.DB.prepare(query)
            .bind(userId, base64String, Date.now())
            .run();

        return c.json({ success: true });

    } catch (e) {
        console.error("Upload Logic Error:", e.message);
        return c.json({ error: "Failed to process image: " + e.message }, 500);
    }
});

app.get('/ws/queue', async (c) => {
	const id = c.env.MATCHMAKER.idFromName('GLOBAL_QUEUE');
	const stub = c.env.MATCHMAKER.get(id);
	return stub.fetch(c.req.raw);
});

app.get('/avatar/:userId', async (c) => {
	const userId = c.req.param('userId');
	if (!c.env.AVATAR_BUCKET) return c.text('No Bucket', 500);

    const user = await c.env.DB.prepare('SELECT avatar_base64 FROM users WHERE id=?').bind(userId).first();

    if (!user) {
        return c.text('No avatar', 404);
    }

	const matches = user.avatar_base64.match(/^data:(.+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return c.text('Invalid Image Data', 500);

	const contentType = matches[1];
    const b64Data = matches[2];
    const binaryStr = atob(b64Data);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);

	return new Response(bytes.buffer, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=604800'
        }
    });
})

// --- ADMIN RESET ROUTE ---
app.get('/admin/nuke', async (c) => {
    try {
        // 1. CLEAR D1 DATABASE (Identity & History)
        if (c.env.DB) {
            await c.env.DB.prepare('DELETE FROM battles').run();
            await c.env.DB.prepare('DELETE FROM users').run(); 
        }

        // 2. RESET GLOBAL LEADERBOARDS (Durable Objects)
        const resetDO = async (namespace, idName) => {
            try {
                const id = namespace.idFromName(idName);
                const stub = namespace.get(id);
                
                await stub.fetch('http://do/reset'); 
            } catch(e) { console.log("DO Reset Error", e); }
        };

        await resetDO(c.env.LEADERBOARD, "GLOBAL");
        await resetDO(c.env.LEADERBOARD, "GLOBAL_PVP");

        return c.json({ status: "System Wiped. Now go delete users in Clerk Dashboard." });
    } catch (e) {
        return c.json({ error: e.message }, 500);
    }
});

export default app;
export { UserProfile, Leaderboard, Challenge, Matchmaker };