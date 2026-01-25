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
                visualContext = `\nVISUAL CONTEXT: The opponent is a HUMAN who looks like: "${userRow.roast_context}". Roast their appearance.`;
            } else {
                visualContext = `\nVISUAL CONTEXT: The opponent is a HUMAN. They have no profile picture, so roast them for being anonymous.`;
            }
        } catch(e) { console.log("DB Roast Fetch Error", e); }
    }

    const systemPrompt = `
        ${opponentConfig.system}
        ${visualContext}
        CRITICAL INSTRUCTION: You are battling a REAL HUMAN. Do NOT call them a bot, AI, or computer. Treat them as an opponent in a rap battle.
    `;

    // AI RAPPER
    const rapperRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
            { role : 'system', content: systemPrompt },
            { role: 'user', content: userRap }
        ]
    });
    const aiVerse = rapperRes.response;

	let judgeSystemPrompt = `
        Act as a professional Battle Rap Judge.
        
        TRANSCRIPT:
        User (Human): "${userRap}"
        Opponent (AI): "${aiVerse}"

        RUBRIC (Score 0-10 each):
        1. Rhymes (Multis/Complexity)
        2. Flow (Rhythm/Readability)
        3. Roasts (Direct Insults)
        4. Creativity (Wordplay)

        MANDATORY FORMAT:
        Return ONLY valid JSON. 
        Do not use markdown.
        Escape all double quotes inside the "comment" string (e.g. "He said \\"hello\\"").
        
        Example Output:
        {
            "user": { "rhyme": 5, "flow": 5, "insults": 5, "creativity": 5, "word_bonus": 0 },
            "ai": { "rhyme": 5, "flow": 5, "insults": 5, "creativity": 5 },
            "comment": "The user had good bars but the AI flowed better."
        }
    `;

    // Only add mandatory rule if it is NOT null
    if (mandatoryWord && mandatoryWord !== 'NONE') {
        judgeSystemPrompt += ` 
            RULE: Check if USER used the word "${mandatoryWord}". 
            If yes, set "user.word_bonus": 10. If no, 0.
        `;   
    }

    // AI JUDGE
    const judgeRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [{ role: 'user', content: judgeSystemPrompt }]
    });

    let scores = { user: { total: 0 }, ai: { total: 0 }, comment: "Judging Error" };

    try {
        const raw = judgeRes.response;
        console.log("RAW JUDGE OUTPUT:", raw);
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
    } catch (e) { 
        console.error('Judge Parse Error', e);
        // Fallback so app doesn't crash
        scores.comment = "The judge is drunk (AI Error). Defaulting to Draw.";
        scores.user.total = 20;
        scores.ai.total = 20;
    }

    const result = scores.user.total > scores.ai.total ? "win" : "loss";
    
    // UPDATE STATS
    try {
        const id = c.env.USER_PROFILE.idFromName(userId);
        const stub = c.env.USER_PROFILE.get(id);
		const hasWordBonus = scores.user.word_bonus > 0;
        const potentialPoints = opponentConfig.points || 0;

		// 1. UPDATE PROFILE
        const userUpdateRes = await stub.fetch('http://do/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: result, type: 'ai', hasWordBonus: hasWordBonus, pointsValue: potentialPoints })
        });
        const userData = await userUpdateRes.json();

		// 2. SUBMIT TO LEADERBOARD
        if (result === 'win' && userData.ai_score > 0) {
            let displayName = "Unknown Rapper";
            if (c.env.DB) {
                const u = await c.env.DB.prepare('SELECT mc_name FROM users WHERE id = ?').bind(userId).first();
                if (u && u.mc_name) displayName = u.mc_name;
            }

            const lbId = c.env.LEADERBOARD.idFromName("GLOBAL");
            const lbStub = c.env.LEADERBOARD.get(lbId);

            await lbStub.fetch('http://do/submit', {
                method: 'POST',
                body: JSON.stringify({ 
                    username: displayName,
                    userId: userId, 
                    wins: userData.ai_score 
                })
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
    try { userId = await verifyAuth(c); } 
    catch (e) { return c.json({ error: e.message }, 401); }

    const formData = await c.req.parseBody();
    const imageFile = formData['image'];

    if (!imageFile || !(imageFile instanceof File)) {
        return c.json({ error: 'No valid image provided' }, 400);
    }

    // 1. Prepare Image Data
    let base64String = '';
    let bytes = null;

    try {
        const arrayBuffer = await imageFile.arrayBuffer();
        if (arrayBuffer.byteLength > 1024 * 1024) {
            return c.json({ error: 'Image too large. Max 1MB.' }, 400);
        }
        bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        base64String = `data:${imageFile.type};base64,${btoa(binary)}`;
    } catch (e) {
        return c.json({ error: "Failed to process image file" }, 500);
    }

    // 2. Generate Description (Safe Mode)
    let description = "A mysterious rapper hiding their face.";
    
    try {
        const input = {
            image: [...bytes],
            prompt: "Describe the person in this image in one sentence. Focus on their appearance (hair, glasses, clothing, expression) so I can roast them later. Be brief.",
            max_tokens: 100
        };
        const aiRes = await c.env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', input);
        if (aiRes && aiRes.description) {
            description = aiRes.description;
        }
    } catch (aiError) {
        console.error("AI Generation Failed (Non-fatal):", aiError);
        // We continue anyway so the image still saves!
    }

    // 3. Save to D1 Database
    try {
        const query = `
            INSERT INTO users (id, avatar_base64, roast_context, created_at) 
            VALUES (?, ?, ?, ?) 
            ON CONFLICT(id) DO UPDATE SET 
                avatar_base64 = excluded.avatar_base64,
                roast_context = excluded.roast_context
        `;
        
        await c.env.DB.prepare(query)
            .bind(userId, base64String, description, Date.now())
            .run();

        return c.json({ success: true, description: description });

    } catch (dbError) {
        console.error("Database Save Failed:", dbError);
        return c.json({ error: "Database error: " + dbError.message }, 500);
    }
});

app.get('/ws/queue', async (c) => {
	const id = c.env.MATCHMAKER.idFromName('GLOBAL_QUEUE');
	const stub = c.env.MATCHMAKER.get(id);
	return stub.fetch(c.req.raw);
});

app.get('Id', async (c) => {
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

app.get('/avatar/:userId', async (c) => {
    const userId = c.req.param('userId');
    if (!c.env.DB) return c.text('No DB', 500);

    try {
        const user = await c.env.DB.prepare('SELECT avatar_base64 FROM users WHERE id=?').bind(userId).first();

        if (!user || !user.avatar_base64) {
            return c.text('No avatar', 404);
        }

        const matches = user.avatar_base64.match(/^data:(.*);base64,(.+)$/);
        if (!matches || matches.length !== 3) return c.text('Invalid Data', 500);

        const contentType = matches[1];
        const b64Data = matches[2];
        const binaryStr = atob(b64Data);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);

        return new Response(bytes.buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=60', // Cache for 60s
            }
        });
    } catch (e) {
        return c.text('Error fetching avatar', 500);
    }
})

export default app;
export { UserProfile, Leaderboard, Challenge, Matchmaker };