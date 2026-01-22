/** @jsx jsx */
import { Hono } from 'hono';
import { jsx } from 'hono/jsx'

export const MainPage = () => {
    return (
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Rap Battle Bot</title>
                {/* HERE is the magic line. We link to the route we will create. */}
                <script src="/client.js" defer></script>
            </head>
            <body>
                <h1>Rap Battle Bot</h1>
                <div id="username-display">Loading Identity...</div>

                {/* SECTION: STATS */}
                <div id="stats-panel">
                <h3>Stats</h3>
                <ul>
                    <li>Wins: <span id="wins">0</span></li>
                    <li>Losses: <span id="losses">0</span></li>
                    <li>Rank: <span id="rank">Novice</span></li>
                </ul>
                </div>

                {/* SECTION: INPUT */}
                <div id="battle-panel">
                <h3>Battle Arena</h3>
                <div>
                    <input type="text" id="userRap" placeholder="Enter your rap..." />
                </div>
                <br />
                <div>
                    <button id="mic-btn" data-recording="false">🎤 Record</button>
                    <button id="battle-btn">Submit Text</button>
                </div>
                <div id="status">Ready</div>
                </div>

                {/* SECTION: RESULTS */}
                <div id="results-panel">
                <h3>History</h3>
                <div id="battle-log"></div>
                </div>
            </body>
        </html>
    );
};