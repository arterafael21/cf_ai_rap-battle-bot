import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createClerkClient } from '@clerk/backend';
import { UserProfile } from './UserProfile';
import { Leaderboard } from './Leaderboard';
import { Challenge } from './Challenge';
import { auth } from 'hono/utils/basic-auth';

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
    
	// Fetch User Context
	let visualContext = "";
	if (c.env.DB) {
		const userRow = await c.env.DB.prepare('SELECT roast_context, mc_name FROM users WHERE id = ?').bind(userId).first();
		if (userRow && userRow.roast_context) {
			visualContext = `\nVISUAL CONTEXT FOR ROASTING: The user looks like this: "${userRow.roast_context}". USE THIS TO ROAST THEM.`;
		}
	}

	const systemPrompt = opponentConfig.system + visualContext;

    // 3. AI Rapper Generation
    const rapperRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
            { role : 'system', content: systemPrompt },
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

	// Fetch Stats (DO)
    const id = c.env.USER_PROFILE.idFromName(userId);
    const obj = c.env.USER_PROFILE.get(id);
    const response = await obj.fetch('http://do/stats');
    const stats = await response.json();

	// Fetch Identity (D1)
	let identity = { mc_name: null, roast_context: null };
	if (c.env.DB) {
		const userRow = await c.env.DB.prepare('SELECT mc_name, roast_context FROM users WHERE id=?').bind(userId).first();
		if (userRow) identity = userRow;
	}
    return c.json({ user: userId, data: stats, identity });
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

// ONBOARDING - UPDATE PROFILE
app.post('/onboarding/update', async (c) => {
	const authHeader = c.req.header('Authorization');
	if (!authHeader) return c.json({ error: 'Unauthorized' }, 401);

	// 1. Verify User
	const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
	const token = authHeader.split(' ')[1];
	let userId;
	try {
		const { payload } = await clerk.verifyToken(token);
		userId = payload.sub;
	} catch (e) {
		return c.json({ error: "Invalid Token" }, 401 );
	}

	const { mcName } = await c.req.json();

	// 2. Upsert into D1
	try {
		// Check if user exists
		const existing = await c.env.DB.prepare('SELECT * FROM users WEHRE id=?').bind(userId).first();

		if (existing) {
			await c.env.DB.prepare('UPDATE users SET mc_name=? WHERE id=?')
				.bind(mcName, userId).run();
		} else {
			await c.env.DB.prepare('INSERT INTO USERS (id, mc_name, created_at) VALUES (? ? ?)')
				.bind(userId, mcName, Date.now()).run()
		}
		return c.json({ success: true });
	} catch (e) {
		console.error(e);
		return c.json({ error: "Database error" }, 500);
	}
});

// ONBOARDING - UPLOAD IMAGE & ANALYZE
app.post('/onboarding/upload', async (c) => {
	// Verify Auth
	const authHeader = c.req.header('Authorization');
	if (!authHeader) return c.json({ error: 'Unauthorized' }, 401);
	const token = authHeader.split(' ')[1];
	const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
	let userId;
	try {
		const { payload } = await clerk.verifyToken;
		userId = payload.sub;
	} catch (e) {
		return c.json({ error: "Invalid Token" }, 401);
	}

	// 1. Parse Form Data
	const formData = await c.req.parseBody();
	const imageFile = formData['image'];

	if (!imageFile) return c.json({ error: 'No image provided' }, 400);

	// 2. AI Analysis
	const arrayBuffer = await imageFile.arrayBuffer();
	const inputs = {
		image: [...new Uint8Array(arrayBuffer)],
		prompt: "Describe this person's appearance specifically for a roast battle. Focus on their clothing style, hair, accessosries, and facial expression. Be descriptive. Be like a caricature artist but with words."
	};

	let roastContext = "";
	try {
		const aiRes = await c.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', inputs);
		roastContext = aiRes.response || 'A mystery rapper';
	} catch (e) {
		console.error("Vision AI Failed", e);
		roastContext = 'A rapepr with an undescriable aura';
	}

	// 3. Upload to R2
	await c.env.AVATAR_BUCKET.put(userId + ".png", arrayBuffer);

	// 4. Save Context to D1
	try {
		const existing = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(userId).first();
		if (existing) {
			await c.env.DB.prepare('UPDATE users SET roast_context=? WHERE id=?')
				.bind(roastContext, userId).run();
		} else {
			await c.env.DB.prepare('INSERT INTO users (id, roast_context, created_at) VALUES (?, ?, ?)')
                .bind(userId, roastContext, Date.now()).run();
		}
	} catch (e) {
		return c.json({ error: "DB Error"}, 500);
	}

	return c.json({ success: true, description });
})

export default app;
export { UserProfile, Leaderboard, Challenge };