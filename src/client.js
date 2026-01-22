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

    document.getElementById('mic-btn').addEventListener('click', toggleMic);
    document.getElementById('battle-btn').addEventListener('click', () => startBattle('text'));
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
    const userRap = document.getElementById('userRap');
    const status = document.getElementById('status');

    if (type === 'text') {
        if (!userRap.value) return alert('Do not be a chump. Freestyle!');
        status.innerText = "Sending text...";
        await sendBattleData({ userRap: userRap.value }, 'text');
        userRap.value = ""; // clear input
    }
}

async function sendBattleData(payload, type) {
    const btn = document.getElementById('battle-btn');
    btn.disabled = true;

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
            options.body = payload;
        }

        const res = await fetch('/battle', options);
        const data = await res.json();

        // render result
        const log = document.getElementById('battle-log');
        const entry = document.createElement('div');

        entry.innerHTML =  \`
            <hr>
            <div><strong>YOU:<strong> \${data.userRap}</div>
            <div><strong>AI:</strong> \${data.aiVerse}</div>
        \`;
        log.prepend(entry);

        loadStats();
        document.getElementById('status').innerText = "Ready";

    } catch (e) {
        alert("Error: " + e.message);
    }

    btn.disabled = false;
}`;