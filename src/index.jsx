import { Hono } from 'hono';
import { cors } from 'hono/cors';
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

// 1. BATTLE ROUTE (Single Player)
app.post('/battle', async (c) => {
    let userRap = "";
    let username = c.req.header('X-Username') || 'guest';
    const body = await c.req.json();
    
    userRap = body.userRap || 'freestyle';
    const opponentID = body.opponent || 'roboflow';
    const opponentConfig = OPPONENTS[opponentID] || OPPONENTS['roboflow'];
    
    // AI Rapper
    const rapperRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
            { role : 'system', content: opponentConfig.system },
            { role: 'user', content: userRap }
        ]
    });
    const aiVerse = rapperRes.response;

    // AI Judge (FIX: Stricter Prompt to prevent JSON crashes)
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
    
    // FIX: Update DB AND Leaderboard
    if (username !== 'guest') {
        try {
            const id = c.env.USER_PROFILE.idFromName(username);
            const stub = c.env.USER_PROFILE.get(id);
            
            // 1. Update Personal Stats
            const userUpdateRes = await stub.fetch('http://do/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ result: result })
            });
            const userData = await userUpdateRes.json();

            // 2. Update Global Leaderboard
            if (result === 'win' && userData.wins) {
                const lbId = c.env.LEADERBOARD.idFromName("GLOBAL");
                const lbStub = c.env.LEADERBOARD.get(lbId);
                await lbStub.fetch('http://do/submit', {
                    method: 'POST',
                    body: JSON.stringify({ username, wins: userData.wins })
                });
            }

        } catch (e) {
            console.error('Failed to update stats', e);
        }
    }

    return c.json({ userRap, aiVerse, result, scores, opponent: opponentConfig.name });
});

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

app.get('/profile/:username', async (c) => {
    const username = c.req.param('username');
    const id = c.env.USER_PROFILE.idFromName(username);
    const obj = c.env.USER_PROFILE.get(id);
    const response = await obj.fetch('http://do/stats');
    const stats = await response.json();
    return c.json({ user: username, data: stats });
});

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

// CREATE CHALLENGE (P1)
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

// GET
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

// REPLY TO CHALLENGE (P2 submits)
app.post('/challenge/:id/reply', async (c) => {
    const hexId = c.req.param('id');
    const { username, verse } = await c.req.json();
    const id = c.env.CHALLENGE.idFromString(hexId);
    const stub = c.env.CHALLENGE.get(id);

    // SAVE P2 VERSE
    const joinRes = await stub.fetch('http://do/join', {
        method: 'POST',
        body: JSON.stringify({ username, verse })
    });

    if (!joinRes.ok) return c.json({ error: "Cannot join battle"}, 400);
    const battleState = await joinRes.json();

    // AI JUDGE (P1 vs P2)
    const judgeRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
            {
                role: 'system',
                content: `Judge this rap battle between ${battleState.p1.name} and ${battleState.p2.name}. 
                Output JSON only: { "p1_score": 5, "p2_score": 5, "comment": "..." }`
            },
            { 
                role: 'user', 
                content: `${battleState.p1.name}: "${battleState.p1.verse}"\n${battleState.p2.name}: "${battleState.p2.verse}"` 
            },
        ],
    });

    let resultData = { p1_score: 0, p2_score: 0, comment: "Error" };
    try {
        const match = judgeRes.response.match(/\{[\s\S]*\}/);
        if (match) resultData = JSON.parse(match[0]);
    } catch (e) {
        console.error("Judge Error", e);
    }

    const winner = resultData.p1_score > resultData.p2_score ? 'p1_win' : 'p2_win';

    await stub.fetch('http://do/finish', {
        method: 'POST',
        body: JSON.stringify({ result: winner, scores: resultData })
    });

    return c.json({ winner, scores: resultData });
})

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


// WEBSOCKET ROUTE
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

export default app;
export { UserProfile, Leaderboard, Challenge };