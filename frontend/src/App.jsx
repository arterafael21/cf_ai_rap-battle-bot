import React, { useState, useEffect, useRef } from 'react';
import {
    MantineProvider, Container, Title, Card, Text, Button, Group, Badge, Stack, Grid, Loader, Tabs, Input, CopyButton, Divider, Center, SegmentedControl, Switch, rem, Modal, FileButton, TextInput, ActionIcon, Table
} from '@mantine/core';
import { 
    IconMicrophone, IconMicrophoneOff, IconTrophy, IconSwords, IconUsers, IconSearch, IconArrowLeft, IconShare, IconKeyboard, IconMusic, IconUserCircle, IconEdit
} from '@tabler/icons-react';
import '@mantine/core/styles.css';
import { ClerkProvider, SignedIn, SignedOut, useUser, useAuth } from "@clerk/clerk-react";

// IMPORTS
import { getRandomWord } from '../../src/constants';
import { AppHeader, WordDisplay, OpponentSelector, BattleInputArea, HistoryItem, OnboardingFlow, ProfileView } from './components';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!CLERK_KEY) throw new Error("Missing Publishable Key");

// --- MAIN LOGIC ---
function RapBattleApp() {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();

    // STATE
    const [identity, setIdentity] = useState(null);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [onboardingName, setOnboardingName] = useState(''); 
    const [onboardingFile, setOnboardingFile] = useState(null);
    
    const [stats, setStats] = useState({ wins: 0, losses: 0, score: 0, rank: 'Novice' });
    const [leaderboard, setLeaderboard] = useState([]);
    const [leaderboardType, setLeaderboardType] = useState('single');

    const [history, setHistory] = useState([]);
    const [input, setInput] = useState(''); 
    const [opponent, setOpponent] = useState('roboflow');
    const [status, setStatus] = useState('Ready');
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const [mode, setMode] = useState('menu');
    const [battleCode, setBattleCode] = useState(''); 
    const [p1Data, setP1Data] = useState(null); 
    const [duelResult, setDuelResult] = useState(null); 
    const [battleMode, setBattleMode] = useState('text');
	const [isQueuing, setIsQueuing] = useState(false);
    
    // WORD CHALLENGE STATE
    const [targetWord, setTargetWord] = useState(''); 
    const [wordMode, setWordMode] = useState(false);

    const ws = useRef(null);
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [timer, setTimer] = useState(30);
    const timerRef = useRef(null);
    const audioCache = useRef({});
    const mediaRecorder = useRef(null);
    const audioChunks = useRef([]);

    // INITIALIZATION
    useEffect(() => {
        if (user) {
            fetchStats(user.id);
            loadHistory();
        }
        fetchLeaderboard();
        refreshWord();
    }, [user]);

    // LOGIC: REFRESH WORD WHEN TOGGLE IS TURNED ON
    useEffect(() => {
        if (wordMode) refreshWord();
    }, [wordMode]);

    const refreshWord = () => setTargetWord(getRandomWord());

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const replayId = params.get('replay');
        if (replayId) loadReplay(replayId);
    }, []);

    // API CALLS
    const fetchStats = async (userId) => {
        try {
            const res = await fetch(`/profile/${userId}`);
            const data = await res.json();
            if (data.data) setStats(data.data);
			if (!data.identity || !data.identity.mc_name) {
				setShowOnboarding(true);
			}
            if (data.identity) {
                setIdentity(data.identity);
            }
        } catch (e) { console.error(e); }
    };

    const handleOnboardingSubmit = async () => {
        if (!user || !onboardingName) return alert("Please enter a name");
        setUploading(true);
        const token = await getToken();

        if (onboardingFile) {
            const formData = new FormData();
            formData.append('image', onboardingFile);
            await fetch('/onboarding/upload', {
                method: 'POST', headers: { 'Authorization': `Bearer ${token}`}, body: formData
            });
        }
        await fetch('/onboarding/update', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mcName: onboardingName }) 
        });
        setShowOnboarding(false);
        setUploading(false);
        fetchStats(user.id);
    }

	const updateProfileLogic = async (newName, newFile) => {
		setUploading(true);
		const token = await getToken();

		try {
			// 1. Upload Image
			if (newFile) {
				const formData = new formData();
				formData.append('image', newFile);
				await fetch('/onboarding/upload', {
					method: 'POST',
					headers: { 'Authorization': `Bearer ${token}`},
					body: formData
				});
			}

			if (newName) {
				await fetch('/onboarding/update', {
					method: 'POST',
					headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
					body: JSON.stringify({ mcName: newName })
				});
			}

			// 3. Refresh Data
			await fetchStats(user.id);
			alert("Profile Updated!");
		} catch (e) {
			alert("Update failed: " + e.message);
		} finally {
			setUploading(false);
		}
	}

    const fetchLeaderboard = async (type='single') => {
        try {
            const endpoint = type === 'pvp' ? '/leaderboard/pvp' : '/leaderboard';
            const res = await fetch(endpoint);
            setLeaderboard(await res.json());
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchLeaderboard(leaderboardType); }, [leaderboardType]);

    // HISTORY LOGIC
    const loadHistory = () => {
        try {
            const hist = JSON.parse(localStorage.getItem('battle_history') || '[]');
            setHistory(hist.map((h, i) => ({ ...h, id: h.id || `legacy-${i}-${Date.now()}` })));
        } catch (e) { setHistory([]); }
    };

    const saveHistory = (newItem) => {
        const updated = [newItem, ...history].slice(0, 20);
        setHistory(updated);
        localStorage.setItem('battle_history', JSON.stringify(updated));
        if (user) fetchStats(user.id);
    };

    const clearHistory = () => {
        if (confirm('Clear history?')) {
            localStorage.removeItem('battle_history');
            setHistory([]);
        }
    };

    // REPLAY LOGIC
    const loadReplay = async (id) => {
        setIsLoading(true);
        setStatus('Loading Replay...');
        try {
            const res = await fetch(`/replay/${id}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setDuelResult({
                winner: data.winner,
                p1_verse: data.p1_verse,
                p2_verse: data.p2_verse,
                scores: { p1_score: '-', p2_score: '-', comment: 'Replay Mode - Scores hidden' },
                winnerCode: data.winner === data.p1_name ? 'p1_win' : 'p2_win',
                battle_id: id 
            });
            setMode('result');
        } catch (e) { alert('Failed to load replay: ' + e.message); }
        setIsLoading(false);
    };

    const shareReplay = () => {
        let link = window.location.href;
        if (duelResult?.battle_id && !link.includes('replay')) {
            link = `${window.location.origin}${window.location.pathname}?replay=${duelResult.battle_id}`;
        }
        navigator.clipboard.writeText(link);
        alert("Replay link copied!");
    };

    // SINGLE PLAYER BATTLE
    const handleBattle = async () => {
        if (!user) return alert("Please sign in!");
        if (!input) return alert('Freestyle something!');
        
        setIsLoading(true);
        setStatus('Sending Verse');

        try {
            const token = await getToken(); 
            const res = await fetch('/battle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userRap: input, opponent, mandatoryWord: wordMode ? targetWord : null }),
            });

            setStatus('AI Writing...');
            const data = await res.json();
            setStatus('Ready');
            data.id = `battle-${Date.now()}`;
            saveHistory(data);
            setInput(''); 
            if (wordMode) refreshWord(); 
            fetchLeaderboard();
        } catch (e) { alert(e.message); setStatus('Error'); }
        setIsLoading(false);
    };

    // AUDIO LOGIC
    const playAudio = async (battleId, text, character) => {
        if (audioCache.current[battleId]) {
            new Audio(audioCache.current[battleId]).play();
            return;
        }
        setStatus('Generating Audio...');
        try {
            const res = await fetch('/speak', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, character }),
            });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            audioCache.current[battleId] = url;
            new Audio(url).play();
            setStatus('Ready');
        } catch (e) { console.error(e); setStatus('Audio Failed'); }
    };

    const toggleMic = async () => { isRecording ? stopRecording() : startRecording(); };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder.current = new MediaRecorder(stream);
            audioChunks.current = [];
            mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data);
            mediaRecorder.current.onstop = handleTranscription;
            mediaRecorder.current.start();
            setIsRecording(true);
            setStatus('Recording...');
        } catch (err) { alert('Microphone error: ' + err.message); }
    };

    const stopRecording = () => {
        if (mediaRecorder.current) {
            mediaRecorder.current.stop();
            setIsRecording(false);
            setStatus('⏳ Transcribing...');
        }
    };

    const handleTranscription = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        setRecordedBlob(audioBlob);
        try {
            const response = await fetch('/transcribe', { method: 'POST', body: audioBlob, headers: { 'Content-Type': 'audio/webm' } });
            const data = await response.json();
            if (data.text) { setInput(data.text); setStatus('Ready'); }
        } catch (e) { setStatus('Transcription Failed'); }
    };

    // MULTIPLAYER LOGIC
    const blobToBase64 = (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    const startMultiplayer = () => {
        if (!input) return alert("Write a verse first!");
        const roomID = Math.random().toString(36).substring(2, 7);
        setBattleCode(roomID);
        connectToWebSocket(roomID, 'CREATE', battleMode);
    };
  
    const joinMultiplayer = () => {
        if (!battleCode) return alert("Enter a code!");
        connectToWebSocket(battleCode, 'JOIN');
    };

	const joinQueue = () => {
		setIsQueuing(true);
		setStatus("Searching for opponent...");

		// Connect to Matchmaker
		const queueWs = new WebSocket('ws://127.0.0.1:8787/ws/queue');

		queueWs.onmessage = (event) => {
			const data = JSON.parse(event.data);
			if (data.type === "MATCH_FOUND") {
				setIsQueuing(false);
				setStatus('Match Found! Connecting...');
				setBattleCode(data.battleId);

				// Automatically start the game with the assigned role
				connectToWebSocket(data.battleId, data.role, battleMode);
			}
		};

		queueWs.onclose = () => setIsQueuing(false);
		ws.current = queueWs;
	}

	const cancelQueue = () => {
		if (ws.current) ws.current.close();
		setIsQueuing(false);
		setStatus('Ready');
	}

    const connectToWebSocket = (roomID, action, selectedMode='text') => {
        if (ws.current) ws.current.close();
        setStatus('Connecting...');
        const socket = new WebSocket(`ws://127.0.0.1:8787/ws/battle/${roomID}`);
        ws.current = socket;

        socket.onopen = async () => {
            console.log("WS Connected");
            if (action == "CREATE") {
                let audioData = null;
                if (selectedMode === 'audio' && recordedBlob) audioData = await blobToBase64(recordedBlob);
                socket.send(JSON.stringify({ 
                    type: 'CREATE', 
                    username: user?.firstName || 'Guest', 
                    verse: input, 
                    battleMode: selectedMode, 
                    audioData: audioData, 
                    mandatoryWord: wordMode ? targetWord : null
                }));
                setMode('create_success');
            }
            if (action === 'JOIN') {
                socket.send(JSON.stringify({ type: 'JOIN', username: user?.firstName || 'Guest' }));
            }
        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type == 'OPPONENT_JOINED') alert(`${msg.username} has entered the ring!`);
            if (msg.type === "BATTLE_START") {
                setP1Data({ name: msg.opponent, verse: msg.verse });
                setBattleMode(msg.battleMode || 'text');
                
                if (msg.mandatoryWord) {
                    setTargetWord(msg.mandatoryWord);
                    setWordMode(true); // Auto-enable mode for P2 if word exists
                }

                setMode('fight');
                if (msg.battleMode === 'audio') {
                    if (msg.audioData) { new Audio(msg.audioData).play().then(() => startTimer()); } 
                    else { playAudio(`p1-${Date.now()}`, msg.verse, 'roboflow').then(() => startTimer()); }
                }
            }
            if (msg.type === "JUDGING") setMode('judging');
            if (msg.type === 'RESULT') {
                setDuelResult(msg.result);
                setMode('result');
                if (timerRef.current) clearInterval(timerRef.current);
                if (battleMode === 'audio' && msg.result.p2_audio && user?.firstName !== msg.result.winner) new Audio(msg.result.p2_audio).play();
                else if (battleMode === 'audio' && msg.result.p2_verse) playAudio(`p2-${Date.now()}`, msg.result.p2_verse, 'bytebeater');
                ws.current.close(); 
            }
        };
    };

    const startTimer = () => {
        setTimer(30);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimer((prev) => {
                if (prev <= 1) { clearInterval(timerRef.current); return 0; }
                return prev - 1;
            });
        }, 1000);
    }

    const sendWsReply = () => {
        if (!ws.current) return;
        let audioData = null;
        if (battleMode === 'audio' && recordedBlob) blobToBase64(recordedBlob).then(d => doSend(d));
        else doSend(null);

        function doSend(aData) {
            if (!input) return alert("Rap something back!");
            ws.current.send(JSON.stringify({ type: 'REPLY', verse: input, audioData: aData }));
        }
    };

	if (showOnboarding) {
		return (
			<OnboardingFlow
			name={onboardingName}
			setName={setOnboardingName}
			setFile={setOnboardingFile}
			onSubmit={handleOnboardingSubmit}
			loading={uploading}
			/>
		)
	}

    return (
		<Container size="md" py="xl"> 
			<Stack gap="lg" align="center">
				
				<AppHeader user={user} isLoaded={isLoaded} identity={identity} stats={stats} />

				<SignedOut>
					{mode === 'result' ? null : (
						<Card withBorder padding="xl" radius="md">
							<Stack align="center">
								<IconTrophy size={48} color="gray"/>
								<Title order={3}>Welcome to the Arena</Title>
								<Text>Sign in to start battling AI or friends!</Text>
							</Stack>
						</Card>
					)}
				</SignedOut>

				<SignedIn>
					<Tabs defaultValue="battle" keepMounted={false}>
					<Tabs.List grow>
						<Tabs.Tab value="battle" leftSection={<IconSwords size={18} />}>Single Player</Tabs.Tab>
						<Tabs.Tab value="multiplayer" leftSection={<IconUsers size={18} />}>Multiplayer</Tabs.Tab>
						<Tabs.Tab value="leaderboard" leftSection={<IconTrophy size={18} />}>Leaderboard</Tabs.Tab>
						<Tabs.Tab value="profile" leftSection={<IconUserCircle size={18} />}>Profile</Tabs.Tab>
					</Tabs.List>

					<Tabs.Panel value="battle" pt="lg">
						<Container size="sm"> 
							<Card padding={30} radius="lg" withBorder style={{ borderColor: '#eee' }}>
								<Stack gap="lg">
									<OpponentSelector current={opponent} setOpponent={setOpponent} />
									
									<Group justify="center">
										<Switch 
											label="Word Challenge" 
											checked={wordMode} 
											onChange={(event) => setWordMode(event.currentTarget.checked)}
											color="orange"
											size="md"
										/>
									</Group>

									{wordMode && <WordDisplay word={targetWord} onRefresh={refreshWord} />}

									<Divider style={{ opacity: 0.5 }} />
									
									<BattleInputArea 
										input={input} setInput={setInput} 
										isRecording={isRecording} toggleMic={toggleMic} 
										handleSend={handleBattle} isLoading={isLoading} status={status} 
										placeholder={wordMode ? `Freestyle using "${targetWord}"...` : "Freestyle your bars..."} 
									/>
								</Stack>
							</Card>
							<Divider my="xl" label={<Badge variant="outline">Battle History</Badge>} labelPosition="center" />
							<Stack gap="md">
								{history.map((item) => <HistoryItem key={item.id} item={item} playAudio={playAudio} />)}
							</Stack>
						</Container>
					</Tabs.Panel>

					<Tabs.Panel value="multiplayer" pt="md">
						{mode === 'menu' && (
							<Stack>
								<Card shadow="md" padding="xl" radius="lg" withBorder style={{ borderColor: '#228be6', borderWidth: 2 }}>
									<Stack align="center" gap="md">
										<Title order={3} c="blue">QUICK PLAY</Title>
										<Text ta="center" size="sm" c="dimmed">Enter the global queue and get matched instantly.</Text>
										
										{!isQueuing ? (
											<Button 
												size="xl" 
												fullWidth 
												radius="md" 
												variant="gradient" 
												gradient={{ from: 'blue', to: 'cyan' }}
												onClick={joinQueue}
												leftSection={<IconSwords size={28} />}
											>
												FIND MATCH
											</Button>
										) : (
											<Button 
												size="xl" 
												fullWidth 
												radius="md" 
												color="red" 
												variant="outline"
												onClick={cancelQueue}
											>
												CANCEL SEARCH
											</Button>
										)}
										{isQueuing && <Loader color="blue" type="dots" />}
									</Stack>
								</Card>

								<Divider label="OR" labelPosition="center" my="sm" />

								<Grid>
									<Grid.Col span={6}>
										<Card shadow="sm" padding="lg" radius="md" withBorder style={{height: '100%'}}>
											<Stack align="center" justify="center" h={120}>
												<IconUsers size={32} color="#228be6" />
												<Title order={5}>Private Room</Title>
												<Button variant="light" fullWidth onClick={() => setMode('create')}>Create</Button>
											</Stack>
										</Card>
									</Grid.Col>
									<Grid.Col span={6}>
										<Card shadow="sm" padding="lg" radius="md" withBorder style={{height: '100%'}}>
											<Stack align="center" justify="center" h={120}>
												<IconSearch size={32} color="#fa5252" />
												<Title order={5}>Join Room</Title>
												<Button variant="light" color="red" fullWidth onClick={() => setMode('join')}>Enter Code</Button>
											</Stack>
										</Card>
									</Grid.Col>
								</Grid>
							</Stack>
						)}
						{mode === 'create' && (
							<Container size="sm">
								<Card padding="lg" radius="lg" withBorder>
									<Stack gap="lg">
										<Group justify="space-between">
											<ActionIcon variant="subtle" color="gray" onClick={() => setMode('menu')}><IconArrowLeft /></ActionIcon>
											<Title order={4}>Battle Setup</Title>
											<div style={{ width: 28 }} /> {/* Spacer for balance */}
										</Group>

										<Card bg="gray.0" radius="md" p="md">
											<Stack gap="md">
												<Text size="sm" fw={700} ta="center" c="dimmed">GAME MODE</Text>
												<SegmentedControl
													fullWidth
													value={battleMode}
													onChange={setBattleMode}
													data={[
														{ label: 'Text Battle', value: 'text', icon: <IconKeyboard size={16} /> },
														{ label: 'Audio Battle', value: 'audio', icon: <IconMusic size={16} /> },
													]}
												/>
												
												<Divider />
												
												<Center>
													<Switch 
														label="Word Challenge Mode" 
														checked={wordMode} 
														onChange={(e) => setWordMode(e.currentTarget.checked)} 
														color="orange"
														size="md"
													/>
												</Center>
												
												{wordMode && <WordDisplay word={targetWord} onRefresh={refreshWord} />}
											</Stack>
										</Card>

										<Title order={5} ta="center">Record Opening Verse</Title>
										<BattleInputArea 
											input={input} setInput={setInput} 
											isRecording={isRecording} toggleMic={toggleMic} 
											handleSend={startMultiplayer} isLoading={isLoading} status={status} 
											placeholder={battleMode === 'audio' ? 'Press Record...' : 'Type your verse...'} 
											readOnly={battleMode === 'audio'}
										/>
									</Stack>
								</Card>
							</Container>
						)}
						{mode === 'create_success' && (
							<Card shadow="sm" padding="xl" withBorder>
								<Stack align="center"><IconTrophy size={64} color="gold" /><Title order={3}>Battle Room Ready!</Title>
								<Group><Badge size="xl" variant="filled" color="dark">{battleCode}</Badge><CopyButton value={battleCode}>{({ copied, copy }) => (<Button color={copied ? 'teal' : 'blue'} onClick={copy}>{copied ? 'Copied' : 'Copy Code'}</Button>)}</CopyButton></Group>
								<Text c="dimmed" size="xs">Waiting for opponent to join...</Text><Button variant="subtle" onClick={() => { ws.current.close(); setMode('menu'); }}>Cancel</Button></Stack>
							</Card>
						)}
						{mode === 'join' && (
							<Card shadow="sm" padding="lg" withBorder>
								<Group mb="md"><ActionIcon variant="subtle" onClick={() => setMode('menu')}><IconArrowLeft/></ActionIcon><Title order={4}>Enter Battle Code</Title></Group>
								<Group><Input placeholder="e.g. 1234abc" style={{flex: 1}} value={battleCode} onChange={(e) => setBattleCode(e.currentTarget.value)}/><Button onClick={joinMultiplayer} loading={isLoading} leftSection={<IconSearch size={16}/>}>Join</Button></Group>
							</Card>
						)}
						{mode === 'fight' && p1Data && (
							<Card shadow="sm" padding="lg" withBorder>
								<Stack>
									<Group justify="space-between"><Title order={4}>Opponent: {p1Data.name}</Title><Badge color={battleMode === 'audio' ? 'pink' : 'gray'}>{battleMode === 'audio' ? 'Audio Battle' : 'Text Battle'}</Badge></Group>
									
									{wordMode && <WordDisplay word={targetWord} />}
									
									{battleMode === 'audio' && (<Card bg={timer < 10 ? 'red.1' : 'blue.1'} mb="md" radius="md"><Group justify="space-between"><Text fw={700}>⏱️ TIME TO REPLY:</Text><Title order={3} c={timer < 10 ? 'red' : 'blue'}>{timer}s</Title></Group><div style={{ width: '100%', height: '6px', background: '#ddd', marginTop: '10px', borderRadius: '4px' }}><div style={{ width: `${(timer / 30) * 100}%`, height: '100%', background: timer < 10 ? 'red' : '#228be6', transition: 'width 1s linear', borderRadius: '4px'}}/></div></Card>)}
									<Card bg="gray.1" padding="md" radius="md"><Text size="lg" style={{fontStyle: 'italic', whiteSpace: 'pre-line'}}>"{p1Data.verse}"</Text></Card>
									<Divider label="Your Turn" labelPosition="center" />
									<BattleInputArea 
										input={input} setInput={setInput} 
										isRecording={isRecording} toggleMic={toggleMic} 
										handleSend={sendWsReply} isLoading={isLoading} status={status} 
										placeholder="Write your comeback..." 
										readOnly={battleMode === 'audio'}
									/>
								</Stack>
							</Card>
						)}
						{mode === 'judging' && (<Card h={300} withBorder><Center h="100%"><Stack align="center"><Loader size="xl" color="red" type="bars"/><Title order={3}>AI Judge is Deciding...</Title></Stack></Center></Card>)}
						{mode === 'result' && duelResult && (
							<Card shadow="sm" padding="xl" withBorder>
								<Stack align="center"><Title order={2}>Winner: {duelResult.winner}</Title>
								<Grid style={{ width: '100%' }} gutter="lg"><Grid.Col span={6}><Card bg="blue.1" padding="sm" radius="md"><Text size="xs" fw={700} c="dimmed">PLAYER 1</Text><Text size="sm" style={{ fontStyle: 'italic', whiteSpace: 'pre-line' }}>"{duelResult.p1_verse}"</Text></Card></Grid.Col><Grid.Col span={6}><Card bg="red.1" padding="sm" radius="md"><Text size="xs" fw={700} c="dimmed">PLAYER 2</Text><Text size="sm" style={{ fontStyle: 'italic', whiteSpace: 'pre-line' }}>"{duelResult.p2_verse}"</Text></Card></Grid.Col></Grid>
								<Group gap="xl" mt="md"><Stack align="center"><Text fw={700}>P1 Score</Text><Badge size="xl" color={duelResult.winnerCode === 'p1_win' ? 'green' : 'grey'}>{duelResult.scores.p1_score}</Badge></Stack><Title order={3}>VS</Title><Stack align="center"><Text fw={700}>P2 Score</Text><Badge size="xl" color={duelResult.winnerCode === 'p2_win' ? 'green' : 'gray'}>{duelResult.scores.p2_score}</Badge></Stack></Group>
								<Text c="dimmed" mt="md" ta="center">"{duelResult.scores.comment}"</Text><Button mt="lg" onClick={() => { setMode("menu"); setInput(''); }}>Back to Menu</Button>
								{window.location.search.includes('replay') && (<Button variant="light" leftSection={<IconShare size={16}/>} onClick={shareReplay}>Share Replay</Button>)}
								</Stack>
							</Card>
						)}
					</Tabs.Panel>

					<Tabs.Panel value="leaderboard" pt="md">
						<Card shadow="sm" padding="lg" radius="md" withBorder>
						<Group justify="space-between" mb="md"><Title order={3}>Hall of Fame</Title><SegmentedControl value={leaderboardType} onChange={setLeaderboardType} data={[{ label: 'Single Player', value:'single' }, { label: 'PVP Arena', value:'pvp' }]} /></Group>
						<Table striped><Table.Thead><Table.Tr><Table.Th>Rank</Table.Th><Table.Th>Rapper</Table.Th><Table.Th>Wins</Table.Th></Table.Tr></Table.Thead>
						<Table.Tbody>{leaderboard.map((player, index) => (<Table.Tr key={player.username}><Table.Td>#{index + 1}</Table.Td><Table.Td fw={700}>{player.username}</Table.Td><Table.Td>{player.score}</Table.Td></Table.Tr>))}</Table.Tbody></Table>
						</Card>
					</Tabs.Panel>

					<Tabs.Panel value="profile" pt="md">
						<ProfileView
							user={user}
							stats={stats}
							identity={identity}
							onUpdateProfile={updateProfileLogic}
							uploading={uploading}
						/>
					</Tabs.Panel>
					</Tabs>
				</SignedIn>

				{mode === 'result' && !user && duelResult && (
					<Card shadow="sm" padding="xl" withBorder mt="xl"><Stack align="center"><Badge color="red">REPLAY MODE</Badge><Title order={2}>Winner: {duelResult.winner}</Title>
					<Grid style={{ width: '100%' }} gutter="lg"><Grid.Col span={6}><Card bg="blue.1" padding="sm" radius="md"><Text size="xs" fw={700} c="dimmed">PLAYER 1</Text><Text size="sm" style={{ fontStyle: 'italic' }}>"{duelResult.p1_verse}"</Text></Card></Grid.Col><Grid.Col span={6}><Card bg="red.1" padding="sm" radius="md"><Text size="xs" fw={700} c="dimmed">PLAYER 2</Text><Text size="sm" style={{ fontStyle: 'italic' }}>"{duelResult.p2_verse}"</Text></Card></Grid.Col></Grid>
					<Text c="dimmed" mt="md" ta="center">"{duelResult.scores.comment}"</Text><Button variant="light" leftSection={<IconShare size={16}/>} onClick={shareReplay}>Share This Replay</Button></Stack></Card>
				)}

			</Stack>
		</Container>
	);
}

export default function App() {
    return (
        <ClerkProvider publishableKey={CLERK_KEY}>
            <MantineProvider>
                <RapBattleApp />
            </MantineProvider>
        </ClerkProvider>
    );
}