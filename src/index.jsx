/** @jsx jsx */
import { Hono } from 'hono';
import { MainPage } from './ui';
import { clientScript } from './client'
import { jsx } from 'hono/jsx'
import { UserProfile } from './UserProfile'

const app = new Hono();

// home page
app.get('/', (c) => {
	return c.html(<MainPage />);
});

app.get('/client.js', (c) => {
	return c.text(clientScript, 200, {
		'Content-Type': 'application/javascript',
	});
});

// battle route
app.post('/battle', async (c) => {
	console.log("--- NEW BATTLE REQUESET STARTED ---");
	let userRap = "";

	// get username
	let username = c.req.header('X-Username') || 'guest';

	const contentType = c.req.header('Content-Type') || '';

	if (contentType.includes('application/json')) {
		const body = await c.req.json();
		console.log("[Input] JSON Body received:", JSON.stringify(body));
		userRap = body.userRap || 'freestyle';

		// if body has username, override header
		if (body.username) username = body.username;
	} else {
		// audio 
		console.log("--- Processing Audio Input ---");
		const audioData = await c.req.arrayBuffer();
		const transcription = await c.env.AI.run('@cf/openai/whisper', {
			audio: [...new Uint8Array(audioData)]
		});
		userRap = transcription.text;
		console.log("--- Audio Transcribed:", userRap);
	}
	
	const rapperPrompt = [
		{ role : 'system', content: "You are a battle rapper. Response to the user\'s verse with a 4-line aggressive comeback. Rhyme Scheme AABB, don't start with 'this is the rap'" },
		{ role: 'user', content: userRap }
	];

	const rapperRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
		messages: rapperPrompt
	});

	const aiVerse = rapperRes.response;
	console.log("--- [AI Rapper] Verse generated:", aiVerse);

	// run judge
	const judgeSystemPrompt = `
	You are a rap battle judge. Compare tehse two verses. Rate each 1-10 on Rhyme, Flow, Insults, Rhetoric, and Creativity/Novelty.
	Output ONLY valid JSON like this:
	{
		"user": { "rhyme": 5, "flow": 5", "creativity": 5 },
		"ai": "user": { "rhyme": 5, "flow": 5", "creativity": 5 },
		"comment": "The AI had a better flow"
	}
	`

	const judgeRes = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
		messages: [
			{ role: 'system', content: judgeSystemPrompt },
			{ role: 'user', content: `User Verse: "${userRap}"\n\nAI Verse: "${aiVerse}"`}
		]
	});

	console.log("--- Judge Raw Response:", judgeRes.response);

	// parse scores
	let scores = {
		user: { total: 0, rhyme: 0, flow: 0, insults: 0, creativity: 0 },
		ai: { total: 0, rhyme: 0, flow: 0, insults: 0, creativity: 0 },
		comment: "Judging Error"
	};

	try {
		const raw = judgeRes.response;
		const jsonMatch = raw.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			console.log("--- AI Judge Parsed JSON:", JSON.stringify(parsed));

			// calc totals
			const u = parsed.user || {};
			const a = parsed.ai || {};

			scores.user = { ...u, total: (u.rhyme || 0) + (u.flow || 0) + (u.insults || 0) + (u.creativity || 0 ) };
			scores.ai = { ...a, total: (a.rhyme || 0) + (a.flow || 0) + (a.insults || 0) + (a.creativity || 0) };
			scores.comment = parsed.comment || "Close battle.";
		}
	} catch (e) {
		console.error('Judge Error', e);
	}

	const result = scores.user.total > scores.ai.total ? "win" : "lose";
	console.log(`--- 6. Winner Calculated: ${result} (User: ${scores.user.total} vs AI: ${scores.ai.total})`);
	// update database
	if (username !== 'guest') {
		console.log(`Battle Result: ${result} for user: ${username}`);

		try {
			console.log(`--- DB Updating Stats for ${username}...`);
			const id = c.env.USER_PROFILE.idFromName(username);
			const stub = c.env.USER_PROFILE.get(id);

			const updateReq = await stub.fetch('http://do/update', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ result: result })
			});

			// log success
			const updateData = await updateReq.json();
			console.log('--- DB Stats updated successfully:', updateData);
		} catch (e) {
			console.error('Failed to update stats', e);
		}
	}

	return c.json({
		userRap: userRap,
		aiVerse: aiVerse,
		result: result,
		scores: scores
	});
});

// voice transcription route
app.post('/transcribe', async (c) => {
	// get raw audio data from upload
	const audioData = await c.req.arrayBuffer();

	// validte 
	if (!audioData || audioData.byteLength === 0) {
		return c.json({ error: 'No audio data received' }, 400);
	}

	// run whisper model
	const response = await c.env.AI.run('@cf/openai/whisper', {
		audio: [...new Uint8Array(audioData)]
	});

	// return text
	return c.json({
		text: response.text
	});
});

app.get('/profile/:username', async (c) => {
	const username = c.req.param('username');

	// generate unique ID based on username
	const id = c.env.USER_PROFILE.idFromName(username);

	// get the stub
	const obj = c.env.USER_PROFILE.get(id);

	// call the do
	const response = await obj.fetch('http://do/stats');

	const stats = await response.json();

	return c.json({
		user: username,
		data: stats
	});
});

export default app;
export { UserProfile } from './UserProfile'