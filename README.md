# Rap Battle Bot

**Live Demo:** [https://rap-battle-bot.arterafael21.workers.dev](https://rap-battle-bot.arterafael21.workers.dev)

This project is a real-time, AI-powered rap battle application. It allows users to compete in lyrical duels against AI personalities or other human players. The application supports both text and audio inputs, featuring real-time transcription, AI-generated voice responses, and an automated judging system that scores verses based on rhyme scheme, flow, and creativity.

## Features

### Gameplay Modes
* **Single Player:** Battle against distinct AI opponents with varying difficulty levels and personalities, such as RoboFlow and ByteBeater.
* **Multiplayer (PvP):** Real-time player-versus-player battles using a private room code or a global matchmaking queue.
* **Spectator Mode:** Users can join existing rooms to watch battles live.

### Core Functionality
* **Audio and Text Support:** Players can type their verses or record audio. Audio is transcribed automatically using OpenAI Whisper.
* **AI Judging:** An LLM-based judge analyzes the transcript of the battle to assign scores for Rhyme, Flow, Bars, and Aggression, and declares a winner.
* **Text-to-Speech:** AI opponents and text-based verses from human players are read aloud using neural text-to-speech engines.
* **Word Challenge:** An optional game mode where players must include a specific random word in their verse for bonus points.

### Progression
* **Leaderboards:** Tracks wins and scores for both Single Player and PvP modes.
* **User Profiles:** Displays player statistics, rank (ranging from Novice to Rap God), and battle history.
* **Custom Avatars:** Users can upload profile pictures which are analyzed by AI to generate context for opponents to use in "roasts."

## Technology Stack

### Frontend
* **React:** UI and component management.
* **Vite:** Build tool and development server.
* **Mantine UI:** Component library for styling and layout.
* **Clerk:** User authentication and management.

### Backend (Serverless)
* **Cloudflare Workers:** Hosting the API and server-side logic.
* **Hono:** Web framework for the Workers.
* **Durable Objects:** Manages real-time state for Battle Rooms and the Matchmaking Queue.
* **Cloudflare D1:** SQL database for storing user profiles and battle history.
* **Cloudflare Workers AI:** Powers the text generation (Llama-3), transcription (Whisper), and image analysis.

## Setup and Installation

### Prerequisites
* Node.js installed.
* A Cloudflare account with Workers and D1 enabled.
* A Clerk account for authentication.

### Configuration
1. Clone the repository.
2. Create a `.env` file in the root directory with your Clerk credentials:
   ```env
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...