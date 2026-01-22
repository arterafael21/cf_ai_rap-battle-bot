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
	let username = "guest"; // Default

	// check content-type to see what user sent
	const contentType = c.req.header("content-type") || "";

	if (contentType.includes('application/json')) {
		// user sent text
		const body = await c.req.json();
		userRap = body.topic || 'freestyle'
		// if username in body, override
		if (body.username) username = body.username;
	} else {
		// user sent audio
		const audioData = await c.req.arrayBuffer();

		// transcribe audio -> text
		const transcription = await c.env.AI.run('@cf/openai/whisper', {
			audio: [...new Uint8Array(audioData)]
		});
		userRap = transcription.text;
	}

	// send text to Llama 3 for AI response
	const messages = [
		{
			role: 'system',
			content: "You are a battle rapper. Response to the user\'s verse with a 4-line aggressive comeback. Rhyme Scheme AABB, don't start with 'this is the rap'"
		},
		{
			role: 'user',
			content: userRap
		}
	];

	const rapResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
		messages: messages
	});

	// update stats 
	const result = userRap.length > 10 ? "win" : "loss"

	if (username !== "guest") {
		// get stub for this user
		const id = c.env.USER_PROFILE.idFromName(username);
		const stub = c.env.USER_PROFILE.get(id);

		// update do
		await stub.fetch('http://do/update', {
			method: 'POST',
			body: JSON.stringify({ result: result })
		});
	}

	return c.json({
		userRap: userRap,
		aiVerse: rapResponse.response,
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