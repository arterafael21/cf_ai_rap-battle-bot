export const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rap Battle Bot v2.0</title>
    <style>
        :root { --neon: #0f0; --bg: #0a0a0a; --panel: #111; }
        body { background: var(--bg); color: #fff; font-family: 'Courier New', monospace; padding: 20px; max-width: 800px; margin: 0 auto; }
        .container { display: grid; gap: 20px; }
        .panel { background: var(--panel); border: 1px solid #333; padding: 20px; border-radius: 8px; }
        h1 { color: var(--neon); text-shadow: 0 0 10px var(--neon); text-align: center; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center; }
        .stat-box { background: #222; padding: 10px; border-radius: 4px; }
        .stat-val { font-size: 1.5em; font-weight: bold; color: var(--neon); }
        textarea { width: 100%; height: 80px; background: #000; color: #fff; border: 1px solid #444; padding: 10px; font-family: inherit; }
        button { width: 100%; padding: 15px; background: var(--neon); color: #000; border: none; font-weight: bold; cursor: pointer; font-size: 1.1em; margin-top: 10px; }
        button:hover { opacity: 0.9; }
        button:disabled { background: #555; cursor: wait; }
        .verse { white-space: pre-wrap; margin: 10px 0; padding: 10px; border-left: 3px solid var(--neon); }
        .ai-verse { border-left-color: #f0f; color: #fcefff; }
        #username-display { color: #888; text-align: right; font-size: 0.8em; }
    </style>
</head>
<body>
    <h1>🎤 RAP BATTLE BOT v2.0</h1>
    <div id="username-display">Identity: Guest</div>

    <div class="container">
        <div class="panel" id="profile-panel">
            <h3>Your Stats</h3>
            <div class="stats-grid">
                <div class="stat-box">Wins<div class="stat-val" id="wins">0</div></div>
                <div class="stat-box">Losses<div class="stat-val" id="losses">0</div></div>
                <div class="stat-box">Rank<div class="stat-val" id="rank">Novice</div></div>
            </div>
        </div>

        <div class="panel">
            <h3>Drop Your Bars</h3>
            <textarea id="topic" placeholder="Type a topic or your rap verse here..."></textarea>
            <button onclick="startBattle()" id="battle-btn">SPIT FIRE</button>
        </div>

        <div class="panel" id="result-panel" style="display:none">
            <h3>Battle Log</h3>
            <div id="battle-log"></div>
        </div>
    </div>

    <script>
        let username = localStorage.getItem('rapper_name');
        if (!username) {
            username = 'MC_' + Math.floor(Math.random() * 1000);
            localStorage.setItem('rapper_name', username);
        }
        document.getElementById('username-display').innerText = \`Identity: \${username}\`;

        async function loadStats() {
            const res = await fetch(\`/profile/\${username}\`);
            const data = await res.json();
            document.getElementById('wins').innerText = data.data.wins;
            document.getElementById('losses').innerText = data.data.losses;
            document.getElementById('rank').innerText = data.data.rank;
        }
        loadStats();

        async function startBattle() {
            const topic = document.getElementById('topic').value;
            const btn = document.getElementById('battle-btn');
            const log = document.getElementById('battle-log');
            const resultPanel = document.getElementById('result-panel');

            if(!topic) return alert("Write something first!");

            btn.disabled = true;
            btn.innerText = "AI IS LISTENING...";
            resultPanel.style.display = 'block';

            try {
                const res = await fetch('/battle', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Username': username
                    },
                    body: JSON.stringify({ topic: topic })
                });

                const data = await res.json();

                const html = \`
                    <div class="verse"><strong>YOU:</strong><br>\${data.userRap}</div>
                    <div class="verse ai-verse"><strong>AI:</strong><br>\${data.aiVerse}</div>
                    <hr style="border-color:#333">
                \`;
                log.innerHTML = html + log.innerHTML; 
                loadStats();

            } catch (e) {
                alert("Battle Error: " + e.message);
            }

            btn.disabled = false;
            btn.innerText = "SPIT FIRE";
            document.getElementById('topic').value = "";
        }
    </script>
</body>
</html>
`;