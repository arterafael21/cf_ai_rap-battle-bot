import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { verifyToken } from '@clerk/backend';
import { UserProfile } from './UserProfile';
import { Leaderboard } from './Leaderboard';
import { Challenge } from './Challenge';
import { getRandomWord, OPPONENTS } from '../src/constants'; 

const app = new Hono();

app.use('/*', cors());

const OPPONENTS = {
    'roboflow': {
        name: 'RoboFlow',
        system: 'You are RoboFlow, a basic battle rapper. Keep rhymes simple (AABB). Be mildly competitive but not too mean. Match the number of lines the User gives in their verse. Format your response as a rap song with line breaks. CRITICAL FOR AUDIO: End every single line / rhyme / bar with a comma or period to ensure the voice pauses correctly.',
        difficultyModifier: 0 
    },
    'bytebeater': {
        name: 'ByteBeater',
        system: 'You are ByteBeater, an elite technical lyricist. Use multi-syllabic rhymes, complex metaphors, and aggressive flows. DESTROY your opponent. Format your response as a rap song with line breaks. CRITICAL FOR AUDIO: Use commas frequently within lines to create a choppy, aggressive rhythm. End every line with a period.',
        difficultyModifier: 3
    },
    'ai-ce': {
        name: 'AI-CE',
        system: 'You are AI-CE, a goofy, clownish rapper. Your goal is to be funny. Roast the user but also make self-deprecating jokes. Use slang. Match the number of lines the User gives in their verse. Format your response as a rap song with line breaks. CRITICAL FOR AUDIO: End every line with a comma or period to perfect your comedic timing.',
        difficultyModifier: -2 
    }
};

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

	let judgeSystemPrompt = `You are a strict rap battle judge. Rate each 1-10 on Rhyme, Flow, Insults, Creativity.`;

	if (mandatoryWord) {
		judgeSystemPrompt += ` MANDATORY RULE: The user MUST use the word "${mandatoryWord}". If they do, +10 points to 'word_bonus'. If not, 0 points.`;	
	}

	judgeSystemPrompt += ` Output JSON only: { "user": { "rhyme": 5, "word_bonus": 0 }, "ai": { "rhyme": 5 }, "comment": "..." }`;

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
        const userUpdateRes = await stub.fetch('http://do/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result: result, type: 'ai' })
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

    try {
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
    if (!imageFile) return c.json({ error: 'No image provided' }, 400);

    const arrayBuffer = await imageFile.arrayBuffer();
    const inputs = {
        image: [...new Uint8Array(arrayBuffer)],
        prompt: "Describe this person's appearance specifically for a roast battle. Focus on clothing, hair, and style. Be brief but specific."
    };

    let roastContext = "";
    try {
        const aiRes = await c.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', inputs);
        roastContext = aiRes.response || 'A mystery rapper';
    } catch (e) {
        console.error("Vision AI Failed", e);
        roastContext = 'A rapper with an indescribable aura';
    }

    try {
        if (c.env.AVATAR_BUCKET) await c.env.AVATAR_BUCKET.put(userId + ".png", arrayBuffer);
        
        const existing = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first();
        if (existing) {
            await c.env.DB.prepare('UPDATE users SET roast_context=? WHERE id=?').bind(roastContext, userId).run();
        } else {
            await c.env.DB.prepare('INSERT INTO users (id, roast_context, created_at) VALUES (?, ?, ?)')
                .bind(userId, roastContext, Date.now()).run();
        }
    } catch (e) { return c.json({ error: "DB Error" }, 500); }

    return c.json({ success: true, description: roastContext });
})

export default app;
export { UserProfile, Leaderboard, Challenge };