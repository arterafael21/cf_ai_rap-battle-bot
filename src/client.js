/** @jsx jsx */
export const clientScript = 
`// Global Variables
let username = localStorage.getItem('rapper_name');
let mediaRecorder;
let audioChunks = [];

// initialization
if (!username) {
    username = 'MC_' + Math.floor(Math.random() * 1000);
    localStorage.setItem('rapper_name', username);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('username-display').innerText = 'Identity: ' + username;
    loadStats();
    loadHistory();

    document.getElementById('mic-btn').addEventListener('click', toggleMic);
    document.getElementById('battle-btn').addEventListener('click', () => startBattle('text'));
    document.getElementById('clear-btn').addEventListener('click', clearHistory);
});

// stats logic
async function loadStats() {
    try {
        const res = await fetch('/profile/' + username);
        const data = await res.json();
        document.getElementById('wins').innerText = data.data.wins;
        document.getElementById('losses').innerText = data.data.losses;
        document.getElementById('rank').innerText = data.data.rank;
    } catch (e) { console.error('Stats error', e) }
}

// --- HISTORY SYSTEM ---

async function loadHistory() {
    const history = JSON.parse(localStorage.getItem('battle_history') || '[]');
    const log = document.getElementById('battle-log');

    // clear screen completely
    log.innerHTML = ''; // clear current

    // re-render all saved battles
    history.forEach(battle => {
        renderEntry(battle);
    });
}

function saveToHistory(data) {
    console.log("Saving to history storage:", data);
    const history = JSON.parse(localStorage.getItem('battle_history') || '[]');

    // save whole object
    history.unshift(data); // add to top
    // limit history to last 20 items
    if (history.length > 20) history.pop();
    localStorage.setItem('battle_history', JSON.stringify(history));

    // refresh
    loadHistory();
}

function clearHistory() {
    if (confirm("Delete all battle history?")) {
        localStorage.removeItem('battle_history');
        document.getElementById('battle-log').innerHTML="";
    }
}

// renders scoreboard
function renderEntry(data) {
    const log = document.getElementById('battle-log');
    const entry = document.createElement('div');
    entry.className = 'battle-entry';

    // handle colors
    const resultColor = data.result === 'win' ? '#0f0' : '#f00';
    const resultText = data.result === 'win' ? 'WINNER' : 'DEFEATED';

    // access scores
    const userText = data.userRap || data.user || "";
    const aiText = data.aiVerse || data.ai || "";

    // show who you fought
    const opponentName = data.opponent ? data.opponent.toUpperCase() : "UNKNOWN";

    const s = data.scores || { user: {}, ai: {}, comment: 'Legacy Battle' };
    const uScore = s.user || { total: 0, rhyme: 0, flow: 0, insults: 0, creativity: 0 };
    const aScore = s.ai || { total: 0, rhyme: 0, flow: 0, insults: 0, creativity: 0 };

    // build HTML
    // 3. Build HTML
    entry.innerHTML = \`
       <div class="verse"><strong>YOU:</strong><br>\${userText}</div>
       
       <div class="score-box">
           <div class="score-header" style="color: \${resultColor};">
               \${resultText}
           </div>
           
           <div">
               <div">
                   <div style="color:#0f0; font-weight:bold;">YOU (\${uScore.total})</div>
                   <div>Rhyme: \${uScore.rhyme}</div>
                   <div>Flow: \${uScore.flow}</div>
                   <div>Insults: \${uScore.insults}</div>
               </div>

               <div style="border-left:1px solid #555;"></div>

               <div>
                   <div style="color:#d742f5; font-weight:bold;">AI (\${aScore.total})</div>
                   <div>Rhyme: \${aScore.rhyme}</div>
                   <div>Flow: \${aScore.flow}</div>
                   <div>Insults: \${aScore.insults}</div>
               </div>
           </div>

           <div class="judge-comment"> \${s.comment}</div>
       </div>

       <div class="verse ai"><strong>AI:</strong><br>\${aiText}</div> 
    \`;
    log.appendChild(entry);
}

// microphone logic
async function toggleMic() {
    const micBtn = document.getElementById('mic-btn');
    const status = document.getElementById('status');

    // check if alr recording
    const isRecording = micBtn.getAttribute('data-recording') === 'true';

    if (!isRecording) {
        // start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                sendBattleData(audioBlob, 'audio');
            };

            mediaRecorder.start();
            micBtn.setAttribute('data-recording', 'true');
            micBtn.innerText = 'Recording...';
        } catch (err) {
            alert("Mic Error: " + err.message);
        }
    } else {
        // stop recording
        mediaRecorder.stop();
        micBtn.setAttribute('data-recording', 'false');
        micBtn.innerText = 'Record';
        status.innerText = 'Processing';
    }
}

// battle logic (text or audio)
async function startBattle(type) {
    const userRapInput = document.getElementById('userRap');

    // get selected opp
    const opponentInput = document.querySelector('input[name="opponent"]:checked');
    const opponent = opponentInput ? opponentInput.value : 'roboflow';

    if (type === 'text') {
        if (!userRapInput.value) return alert('Do not be a chump. Freestyle!');

        await sendBattleData({ 
            userRap: userRapInput.value,
            opponent: opponent
        }, 'text');

        userRap.value = ""; // clear input
    }
}

async function sendBattleData(payload, type) {
    const btn = document.getElementById('battle-btn');
    const status = document.getElementById('status');
    btn.disabled = true;
    status.innerText = "Battling..."

    try {
        const options = {
            method: 'POST',
            headers: { 'X-Username': username }
        };

        if (type === 'text') {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(payload);
        } else {
            options.headers['Content-Type'] = 'audio/webm';
            options.headers['X-Opponent'] = document.querySelector('input[name="opponent"]:checked').value;
            options.body = payload;
        }

        const res = await fetch('/battle', options);
        const data = await res.json();

        console.log('Received Response from /battle:', data);

        // save data
        saveToHistory(data);

        loadStats();
        
        await playAudio(data.aiVerse, data.opponent);

    } catch (e) {
        alert("Error: " + e.message);
    }

    btn.disabled = false;
}`

async function playAudio(text, opponent) {
    const status = document.getElementById('status');
    status.innerText = 'Generating Audio...';

    try {
        const res = await fetch('/speak', {
            method: 'POST',
            headers: { 'Content-Type' : 'application/json' },
            body: JSON.stringify({ text, character: opponent})
        });

        if (!res.ok) throw new Error("Audio gen failed");

        const blob = await res.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);

        status.innerText = "Playing Verse...";
        audio.play();

        audio.onended = () => {
            status.innerText = "Ready";
        }
    } catch (e) {
        console.error('Audio Error:', e);
        status.innerText = 'Audio Failed';
    }
}