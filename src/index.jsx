/** @jsx jsx */
import { Hono } from 'hono';
import { MainPage } from './ui';
import { clientScript } from './client';
import { jsx } from 'hono/jsx';
import { UserProfile } from './UserProfile';

const app = new Hono();

const OPPONENTS = {
    'roboflow': {
        name: 'RoboFlow',
        system: 'You are RoboFlow, a basic battle rapper. Keep rhymes simple (AABB). Be mildly competitive but not too mean.',
        difficultyModifier: 0 
    },
    'bytebeater': {
        name: 'ByteBeater',
        system: 'You are ByteBeater, an elite technical lyricist. Use multi-syllabic rhymes, complex metaphors, and aggresive flows. DESTROY your opponent.',
        difficultyModifier: 3
    },
    'ai-ce': {
        name: 'AI-CE',
        system: 'You are AI-CE, a goofy, clownish rapper. Your goal is to be funny. Roast the user but also make self-deprecating jokes. Use slang.',
        difficultyModifier: -2 
    }
};

app.get('/', (c) => c.html(<MainPage />));

app.get('/client.js', (c) => {
    return c.text(clientScript, 200, {
        'Content-Type': 'application/javascript',
    });
});

app.post('/battle', async (c) => {
    let userRap = "";
    let username = c.req.header('X-Username') || 'guest';
    const contentType = c.req.header('Content-Type') || '';
    let opponentID = 'roboflow';

    if (contentType.includes('application/json')) {
        const body = await c.req.json();
        userRap = body.userRap || 'freestyle';
        if (body.username) username = body.username;
        if (body.opponent) opponentID = body.opponent;
    } else {
        const audioData = await c.req.arrayBuffer();
        opponentID = c.req.header('X-Opponent') || 'roboflow';
        const transcription = await c.env.AI.run('@cf/openai/whisper', {
            audio: [...new Uint8Array(audioData)]
        });
        userRap = transcription.text;
    }

    const opponentConfig = OPPONENTS[opponentID] || OPPONENTS['roboflow'];
    
    const rapperPrompt = [
        { role : 'system', content: opponentConfig.system },
        { role: 'user', content: userRap }
    ];

    const rapperRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: rapperPrompt
    });

    const aiVerse = rapperRes.response;

    // FIX: Corrected JSON example to prevent LLM confusion
    const judgeSystemPrompt = `
    You are a rap battle judge. Compare these two verses. Rate each 1-10 on Rhyme, Flow, Insults, and Creativity.
    Output ONLY valid JSON like this:
    {
        "user": { "rhyme": 5, "flow": 5, "creativity": 5 },
        "ai": { "rhyme": 5, "flow": 5, "creativity": 5 },
        "comment": "The AI had a better flow"
    }
    `;

    const judgeRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
            { role: 'system', content: judgeSystemPrompt },
            { role: 'user', content: `User Verse: "${userRap}"\nAI (${opponentConfig.name}) Verse: "${aiVerse}"`}
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
    
    if (username !== 'guest') {
        try {
            const id = c.env.USER_PROFILE.idFromName(username);
            const stub = c.env.USER_PROFILE.get(id);
            await stub.fetch('http://do/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ result: result })
            });
        } catch (e) {
            console.error('Failed to update stats', e);
        }
    }

    return c.json({
        userRap: userRap,
        aiVerse: aiVerse,
        result: result,
        scores: scores,
        opponent: opponentConfig.name 
    });
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
            prompt: text,
        });
        
        return new Response(response, {
            headers: { 'Content-Type': 'audio/mpeg' }
        });
    } catch(e) {
        console.error('TTS Error:', e);
        return c.json({ error: 'TTS Failed' }, 500);
    }
});

export default app;
export { UserProfile } from './UserProfile';