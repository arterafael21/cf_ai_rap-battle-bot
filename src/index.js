import { Hono } from 'hono';

const app = new Hono();

// home page
app.get('/', (c) => {
	return c.text('Rap Battle Bot is Online! Ready to drop bars.');
});

// battle route
app.post('/battle', async (c) => {
	// extract user input, expecting { topic: Apple }
	const body = await c.req.json();
	const topic = body.topic || "freestyle";

	// construct prompt
	const messages = [
		{
			role: 'system',
			content: 'You are a skilled battle rapper. Write a 4-line aggressive rap verse about the given topic. Rhyme scheme AABB. Skip introductions like "here is the verse"'
		},
		{
			role: 'user',
			content: `Topic: ${topic}`
		}
	];

	// run AI model
	const response = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct-fast', {
		messages: messages
	});

	// return result
	return c.json({
		topic: topic,
		verse: response.response
	});
});

export default app;