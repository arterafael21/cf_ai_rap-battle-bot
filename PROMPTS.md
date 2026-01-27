# Prompt Engineering & Development Strategy
Below are the key prompts used to architect the system, ordered by the development lifecycle: System Architecture, Frontend Implementation, State Management, Optimization & Debugging.

### 1. Conceptual Mapping & Architecture

**Goal:** Translate abstract cloud concepts into domain-specific application logic.

> "I am new to Cloudflare and want to build an AI Rap Battle Bot. Explain how the Cloudflare ecosystem works by defining the key components. Specifically, define Cloudflare Workers, Hono, Workers AI, and Durable Objects. Once defined, outline how these pieces wire together to create a cohesive voice-enabled web app."

### 2. Architecture & Queue Management (Durable Objects)

**Goal:** Establish a thread-safe matchmaking queue on a serverless platform.

> "Create a Cloudflare Worker architecture using Hono and Durable Objects. I need a Matchmaker Durable Object that handles a global queue. It should accept WebSocket connections, wait for 2 players to connect, generate a unique battleId, and then send a message to both clients to redirect them to a private room. Ensure the fetch handler distinguishes between HTTP upgrades and standard requests."

### 3. Frontend Migration & Dependency Management

**Goal:** Refactor the UI layer from a legacy component library to a modern alternative without technical debt.

> "I need to migrate the current React frontend from Chakra UI to Mantine to resolve styling conflicts and improve stability. Provide a script to cleanly uninstall all Chakra-related dependencies (including framer-motion and @emotion). Then, generate the necessary MantineProvider configuration for main.jsx and rewrite the App.jsx component to replace the useToast hooks with Mantine's notification system, ensuring the vite.config.js proxy settings remain intact."

### 4. Stateful AI Context (Memory Implementation)

**Goal:** Enable conversation persistence in a serverless environment.

> "The current LLM implementation suffers from amnesia between turns. Extend the existing Cloudflare Worker to support 'Session Memory' using Durable Objects. Create a BattleRoom class that acts as a storage layer for the last 6 turns of conversation history. Update the main inference logic to fetch this history before prompting Llama 3.3, and write the new generated verses back to the Durable Object after every turn."

### 5. Audio Processing & Payload Optimization

**Goal:** Handle binary audio data within WebSocket limits.

> "Implement a React function to handle audio recording. It needs to capture the microphone input, convert the Blob to a Base64 string, and enforce a strict file size limit of 350KB before attempting to send it over the WebSocket. If the file is too large, alert the user instead of crashing the socket. Also, provide a helper function to decode this Base64 string back into a playable audio source for the opponent."

### 6. Debugging Mobile Network Edge Cases

**Goal:** Solve the specific iOS/Safari WebSocket connection drop issue.

> "I am experiencing a WebSocket 'Network Connection Lost' error specifically on iOS Safari, while Chrome works fine. The connection drops during the 5-second idle period before the game starts. Analyze the standard WebSocket handshake headers required by Safari and implement a 'Heartbeat/Ping-Pong' mechanism within the Durable Object's webSocketMessage loop to prevent the connection from being flagged as idle by the mobile network layer."