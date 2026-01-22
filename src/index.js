import { Hono } from 'hono';

const app = new Hono();

// home page
app.get('/', (c) => {
	return c.text('Rap Battle Bot is Online! Ready to drop bars.');
});

export default app;