import { Hono } from 'hono';

const app = new Hono();

// home page
app.get('/', (c) => {
	return c.text('Rap Battle Bot is Online! Ready to drop bars.');
});

// battle route
app.post('/battle', async (c) => {
	let userRap = "";

	// check content-type to see what user sent
	const contentType = c.req.header("content-type") || "";

	if (contentType.includes('application/json')) {
		// user sent text
		const body = await c.req.json();
		userRap = body.topic || 'freestyle'
	} else {
		// user sent audio
		const audioData = await c.req.arrayBuffer();

		// transcribe audio -> text
		const transcription = await c.env.AI.run('@cf/openai/whisper', {
			audio: [...new Uint8Array(audioData)]
		});
		userRap = transcription.text;
	}

	// send text to Llama 3
	const messages = [
		{
			role: 'system',
			content: "You are a battle rapper. Response to the user\'s verse with a 4-line aggressive comeback. Rhyme Scheme AABB, don't start with 'this is the rap'"
		},
		{
			role: 'user',
			content: `My verse: ${userRap}`
		}
	];

	const rapResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
		messages: messages
	});

	return c.json({
		userSaid: userRap,
		aiVerse: rapResponse.response
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

export default app;