import { Hono } from 'hono';
import { html } from './ui'

const app = new Hono();

// home page
app.get('/', (c) => {
	return c.html(html);
});

// battle route
app.post('/battle', async (c) => {
	let userRap = "";

	// get username
	let username = c.req.header('X-Username') || 'guest';

	const contentType = c.req.header('Content-Type') || '';

	if (contentType.includes('application/json')) {
		const body = await c.req.json();
		userRap = body.topic || 'freestyle';

		// if body has username, override header
		if (body.username) username = body.username;
	} else {
		// audio 
		const audioData = await c.req.arrayBuffer();
		const transcription = await c.env.AI.run('@cf/openai/whisper', {
			audio: [...new Uint8Array(audioData)]
		});
		userRap = transcription.text;
	}

	const messages = [
		{ role : 'system', content: "You are a battle rapper. Response to the user\'s verse with a 4-line aggressive comeback. Rhyme Scheme AABB, don't start with 'this is the rap'" },
		{ role: 'user', content: userRap }
	];

	const rapResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
		messages: messages
	});

	// if length > 10, win (TO FIX)
	const result = userRap.length > 10 ? "win" : "loss";

	if (username !== 'guest') {
		console.log(`Battle Result: ${result} for user: ${username}`);

		try {
			const id = c.env.USER_PROFILE.idFromName(username);
			const stub = c.env.USER_PROFILE.get(id);

			const updateReq = await stub.fetch('http://do/update', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ result: result })
			});

			// log success
			const updateData = await updateReq.json();
			console.log('Stats updated successfuly', updateData)
		} catch (e) {
			console.error('Failed to update stats', e);
		}
	}

	return c.json({
		user_said: userRap,
		ai_verse: rapResponse.response,
		result: result
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