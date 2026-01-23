import { Hono } from 'hono';
import { cors } from 'hono/cors'; // Important for separate frontend
import { UserProfile } from './UserProfile';

const app = new Hono();

// ALLOW FRONTEND TO TALK TO BACKEND
app.use('/*', cors());

// CONFIG
const OPPONENTS = {
    'roboflow': {
        name: 'RoboFlow',
        system: 'You are RoboFlow, a basic battle rapper. Keep rhymes simple (AABB). Be mildly competitive but not too mean. CRITICAL FOR AUDIO: End every single line with a comma or period.',
        difficultyModifier: 0 
    },
    'bytebeater': {
        name: 'ByteBeater',
        system: 'You are ByteBeater, an elite technical lyricist. Use multi-syllabic rhymes, complex metaphors, and aggressive flows. DESTROY your opponent. CRITICAL FOR AUDIO: Use commas frequently within lines.',
        difficultyModifier: 3
    },
    'ai-ce': {
        name: 'AI-CE',
        system: 'You are AI-CE, a goofy, clownish rapper. Your goal is to be funny. Roast the user but also make self-deprecating jokes. Use slang. CRITICAL FOR AUDIO: End every line with a comma.',
        difficultyModifier: -2 
    }
};

// --- ROUTES ---

// 1. Battle Route
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

    // AI Judge
    const judgeRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
            { role: 'system', content: `You are a rap battle judge. Rate each 1-10 on Rhyme, Flow, Insults, Creativity. Output JSON: { "user": { "rhyme": 5, "flow": 5 }, "ai": { "rhyme": 5, "flow": 5 }, "comment": "..." }` },
            { role: 'user', content: `User: "${userRap}"\nAI: "${aiVerse}"`}
        ]
    });

    let scores = { user: { total: 0 }, ai: { total: 0 }, comment: "Judge Error" };
    try {
        const jsonMatch = judgeRes.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const u = parsed.user || {}; 
            const a = parsed.ai || {};
            
            scores.user = { ...u, total: (u.rhyme||0) + (u.flow||0) + (u.insults||0) };
            scores.ai = { ...a, total: (a.rhyme||0) + (a.flow||0) + (a.insults||0) };
            scores.comment = parsed.comment || "Close battle.";
            scores.ai.total += opponentConfig.difficultyModifier;
        }
    } catch (e) { console.error('Judge Error', e); }

    const result = scores.user.total > scores.ai.total ? "win" : "loss";
    
    // Update DB
    if (username !== 'guest') {
        try {
            const id = c.env.USER_PROFILE.idFromName(username);
            const stub = c.env.USER_PROFILE.get(id);
            await stub.fetch('http://do/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ result })
            });
        } catch (e) { console.error('Stats Error', e); }
    }

    return c.json({ userRap, aiVerse, result, scores, opponent: opponentConfig.name });
});

// 2. TTS Route
app.post('/speak', async (c) => {
    const { text } = await c.req.json();
    try {
        const response = await c.env.AI.run('@cf/myshell-ai/melotts', {
            prompt: text, lang: 'en'
        });
        
        const base64Audio = response.audio;
        if (!base64Audio) throw new Error('No audio returned');

        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

        return new Response(bytes.buffer, { headers: { 'Content-Type': 'audio/mpeg' } });
    } catch(e) {
        return c.json({ error: 'TTS Failed' }, 500);
    }
});

// 3. Stats Route
app.get('/profile/:username', async (c) => {
    const username = c.req.param('username');
    const id = c.env.USER_PROFILE.idFromName(username);
    const obj = c.env.USER_PROFILE.get(id);
    const response = await obj.fetch('http://do/stats');
    const stats = await response.json();
    return c.json({ user: username, data: stats });
});

export default app;
export { UserProfile } from './UserProfile';