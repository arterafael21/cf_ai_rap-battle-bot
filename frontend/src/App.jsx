import React, { useState, useEffect, useRef } from 'react';
import {
    MantineProvider, Container, Title, Card, Text, Button, Group, Badge, Stack, Grid, Loader, Tabs, Input, CopyButton, Divider, Center, SegmentedControl, Switch, rem, Modal, FileButton, TextInput, ActionIcon, Table, Avatar, Textarea
} from '@mantine/core';
import { 
    IconMicrophone, IconMicrophoneOff, IconTrophy, IconSwords, IconUsers, IconSearch, IconArrowLeft, IconShare, IconKeyboard, IconMusic, IconUserCircle, IconEdit, IconSend, IconPlayerPlay
} from '@tabler/icons-react';
import '@mantine/core/styles.css';
import { ClerkProvider, SignedIn, SignedOut, useUser, useAuth, useClerk } from "@clerk/clerk-react";

// IMPORTS
import { getRandomWord } from '../../src/constants';
import { AppHeader, WordDisplay, OpponentSelector, BattleInputArea, HistoryItem, OnboardingFlow, ProfileView, SplashPage } from './components';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!CLERK_KEY) throw new Error("Missing Publishable Key");

// --- MAIN LOGIC ---
function RapBattleApp() {
   	const { user, isLoaded } = useUser();
	const { getToken } = useAuth();
    const { signOut } = useClerk();

    // STATE
    const [identity, setIdentity] = useState(null);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [onboardingName, setOnboardingName] = useState(''); 
    const [onboardingFile, setOnboardingFile] = useState(null);
    const [avatarTs, setAvatarTs] = useState(Date.now());
    
    const [stats, setStats] = useState({ wins: 0, losses: 0, score: 0, rank: 'Novice' });
    const [leaderboard, setLeaderboard] = useState([]);
    const [leaderboardType, setLeaderboardType] = useState('single');

    const [history, setHistory] = useState([]);
    const [lastBattle, setLastBattle] = useState(null);
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
    const [isOpponentTyping, setIsOpponentTyping] = useState(false);
    const typingTimeoutRef = useRef(null);
    
    // ARENA STATE
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [battleLog, setBattleLog] = useState([]);
    const [timeLeft, setTimeLeft] = useState(30); 
	const hasAutoSubmitted = useRef(false);
    
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
        } else {
			setMode('menu');
		}
        fetchLeaderboard();
        refreshWord();
    }, [user]);

	// TURN TIMER
	useEffect(() => {
		if (isMyTurn) {
			hasAutoSubmitted.current = false;
			setTimeLeft(30);
		}
	}, [isMyTurn]);

	useEffect(() => {
		let interval = null;
		if (mode === 'arena' && isMyTurn) {
			if (timeLeft > 0) {
				interval = setInterval(() => {
					setTimeLeft((prev) => prev - 1);
				}, 1000);
			} else if (timeLeft === 0 && !hasAutoSubmitted.current) {
				hasAutoSubmitted.current = true;
				submitTurn("(Time ran out!)");
			}
		}
		return () => clearInterval(interval);
	}, [mode, isMyTurn, timeLeft]);

	const handleManualPlay = (log) => {
		if (log.audio) {
			new Audio(log.audio).play();
		} else {
			playAudio(`msg-${Date.now()}`, log.text, 'bytebeater');
		}
	};
	
    // REFRESH WORD WHEN TOGGLE IS TURNED ON
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

		try {
			const res = await fetch('/onboarding/update', {
				method: 'POST',
				headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, 
				body: JSON.stringify({ mcName: onboardingName })
			});
			
			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to update name');
			}

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
			fetchStats(user.id);
		} catch (e) {
			alert(e.message);
		} finally {
			setUploading(false);
		}
    }

	const updateProfileLogic = async (newName, newFile) => {
		setUploading(true);
		const token = await getToken();

		try {
			// 1. Update Name (if changed)
			if (newName) {
				const res = await fetch('/onboarding/update', {
					method: 'POST',
					headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
					body: JSON.stringify({ mcName: newName })
				});
				if (!res.ok) {
					const data = await res.json();
					throw new Error(data.error); 
				}
				// Update local state immediately
				setIdentity(prev => ({ ...prev, mc_name: newName }));
			}

			// 2. Upload Image (and get new AI description)
			if (newFile) {
				const formData = new FormData();
				formData.append('image', newFile);
				
				const res = await fetch('/onboarding/upload', {
					method: 'POST',
					headers: { 'Authorization': `Bearer ${token}`},
					body: formData
				});

				const data = await res.json();
				if (data.description) {
					setIdentity(prev => ({ ...prev, roast_context: data.description }));
				}

				setAvatarTs(Date.now())
			}

			// 3. Background refresh (just in case)
			fetchStats(user.id);
			alert("Profile Updated!");

		} catch (e) {
			alert("Update failed: " + e.message);
			throw e; 
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
			setLastBattle(data);
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
        setStatus('Playing Audio...');
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
            mediaRecorder.current.onstop = () => {
				const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
				setRecordedBlob(blob);
			};
            mediaRecorder.current.start();
            setIsRecording(true);
        } catch (err) { alert('Microphone error: ' + err.message); }
    };

    const stopRecording = () => {
        if (mediaRecorder.current) {
            mediaRecorder.current.stop();
            setIsRecording(false);
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
        const roomID = Math.random().toString(36).substring(2, 7);
        connectToBattleRoom(roomID, 'CREATE');
    };
  
    const joinMultiplayer = () => {
        if (!battleCode) return alert("Enter a code!");
        connectToBattleRoom(battleCode, 'JOIN');
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
				connectToBattleRoom(data.battleId, data.role, battleMode);
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

    const connectToBattleRoom = (roomID, role) => {
        if (ws.current) ws.current.close();
        setStatus('Connecting...');
        const socket = new WebSocket(`ws://127.0.0.1:8787/ws/battle/${roomID}`);
        ws.current = socket;

        socket.onopen = async () => {
            const myName = identity?.mc_name || user?.firstName || 'Guest';
            socket.send(JSON.stringify({ 
                type: 'INIT', username: myName, userId: user.id, role: role 
            }));

            if (role === 'CREATE') {
                setMode('create_success'); // Just show code
                setBattleCode(roomID);
            } else {
                setMode('waiting_for_start'); // Waiting for handshake
            }
        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'OPPONENT_JOINED') {
                setP1Data({ name: msg.username, id: msg.userId });
            }

            // --- START GAME ---
            if (msg.type === 'MATCH_START') {
                setIsMyTurn(msg.yourTurn);
                setBattleLog([]);
                setTimeLeft(30);
                if (msg.mandatoryWord) { setTargetWord(msg.mandatoryWord); setWordMode(true); }
                setMode('arena'); // <--- UNIFIED SCREEN
            }

            // --- RECEIVE TURN ---
            if (msg.type === 'NEW_VERSE') {
                // Add opponent verse to log
                setBattleLog(prev => [...prev, { sender: 'opponent', text: msg.verse, audio: msg.audioData }]);
                
                // My Turn Now
                setIsMyTurn(true);
            }

            if (msg.type === 'OPPONENT_TYPING') {
                setIsOpponentTyping(true);
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => setIsOpponentTyping(false), 2000);
            }

            if (msg.type === 'OPPONENT_DISCONNECTED') {
                alert("Opponent Left!");
                setMode('menu');
            }

            if (msg.type === 'RESULT') {
                setDuelResult(msg.result);
                setMode('result');
                ws.current.close();
            }
        };
    };

	// SEND FUNCTION
	const submitTurn = async (forcedText=null) => {
		const textToSend = forcedText || input;
		if (!textToSend && !recordedBlob) return;
		
		// 1. Local Update
		setBattleLog(prev => [...prev, { sender: 'me', text: textToSend, audio: recordedBlob }]);

		// 2. Prepare Data
		let audioData = null;
		if (battleMode === 'audio' && recordedBlob) {
			audioData = await blobToBase64(recordedBlob);
		}

		// 3. Send
		ws.current.send(JSON.stringify({
			type: 'SUBMIT_TURN',
			verse: textToSend,
			audioData: audioData
		}));
		
		// 4. Reset
		setInput('');
		setIsMyTurn(false);
		setRecordedBlob(null);
	}
    

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

	const handleInput = (e) => {
		const val = e.currentTarget.value;
		setInput(val);

		if (ws.current && ws.current.readyState === WebSocket.OPEN) {
			ws.current.send(JSON.stringify({ type: 'TYPING' }));
		}
	}

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
        <>
            {/* --- 1. SIGNED OUT VIEW --- */}
            <SignedOut>
                {mode === 'result' && duelResult ? (
                    <Container size="md" py="xl">
                        <Stack align="center">
                            <Card shadow="xl" padding="xl" withBorder style={{ width: '100%' }}>
                                <Stack align="center">
                                    <Badge color="red" size="lg">REPLAY MODE</Badge>
                                    <Title order={2}>Winner: {duelResult.winner}</Title>
                                    
                                    <Grid style={{ width: '100%' }} gutter="lg">
                                        <Grid.Col span={6}>
                                            <Card bg="blue.1" padding="sm" radius="md">
                                                <Text size="xs" fw={700} c="dimmed">PLAYER 1</Text>
                                                <Text size="sm" style={{ fontStyle: 'italic', whiteSpace: 'pre-line' }}>"{duelResult.p1_verse}"</Text>
                                            </Card>
                                        </Grid.Col>
                                        <Grid.Col span={6}>
                                            <Card bg="red.1" padding="sm" radius="md">
                                                <Text size="xs" fw={700} c="dimmed">PLAYER 2</Text>
                                                <Text size="sm" style={{ fontStyle: 'italic', whiteSpace: 'pre-line' }}>"{duelResult.p2_verse}"</Text>
                                            </Card>
                                        </Grid.Col>
                                    </Grid>
                                    
                                    <Text c="dimmed" mt="md" ta="center" fs="italic">"{duelResult.scores.comment}"</Text>
                                    
                                    <Group mt="md">
                                        <Button variant="light" leftSection={<IconShare size={16}/>} onClick={shareReplay}>Share</Button>
                                        <Button onClick={() => { setMode('menu'); setDuelResult(null); }}>Exit to Home</Button>
                                    </Group>
                                </Stack>
                            </Card>
                        </Stack>
                    </Container>
                ) : (
                    <SplashPage />
                )}
            </SignedOut>

            {/* --- 2. SIGNED IN VIEW --- */}
            <SignedIn>
                <Container size="md" py="xl"> 
                    <Stack gap="lg" align="center">
                        
                        <AppHeader 
                            user={user} 
                            isLoaded={isLoaded} 
                            identity={identity} 
                            stats={stats} 
                            avatarTs={avatarTs} 
                            onLogout={() => signOut()}
                        />

                        <Tabs defaultValue="battle" keepMounted={false}>
                            <Tabs.List grow>
                                <Tabs.Tab value="battle" leftSection={<IconSwords size={18} />}>Single Player</Tabs.Tab>
                                <Tabs.Tab value="multiplayer" leftSection={<IconUsers size={18} />}>Multiplayer</Tabs.Tab>
                                <Tabs.Tab value="leaderboard" leftSection={<IconTrophy size={18} />}>Leaderboard</Tabs.Tab>
                                <Tabs.Tab value="profile" leftSection={<IconUserCircle size={18} />}>Profile</Tabs.Tab>
                            </Tabs.List>

                            {/* --- 3. SINGLE PLAYER TAB --- */}
                            <Tabs.Panel value="battle" pt="lg">
                                <Container size="sm"> 
                                    <Card padding={30} radius="lg" withBorder style={{ borderColor: '#eee' }}>
                                        <Stack gap="lg">
                                            <OpponentSelector current={opponent} setOpponent={setOpponent} />
                                            <Group justify="center">
                                                <Switch label="Word Challenge" checked={wordMode} onChange={(e) => setWordMode(e.currentTarget.checked)} color="orange" size="md"/>
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

                                    {lastBattle && (
                                        <Card mt="lg" padding="lg" radius="md" withBorder bg="gray.0">
                                            <Group justify="space-between" mb="sm">
                                                <Title order={4}>Last Round Results</Title>
                                                <Badge color={lastBattle.result === 'win' ? 'green' : 'red'} size="lg">{lastBattle.result.toUpperCase()}</Badge>
                                            </Group>
                                            <Grid>
                                                <Grid.Col span={6}>
                                                    <Card bg="white" withBorder>
                                                        <Text size="xs" c="dimmed" fw={700}>YOU ({identity?.mc_name || 'User'})</Text>
                                                        <Title order={2} c="blue">{lastBattle.scores.user.total}</Title>
                                                        <Text size="xs" mt={5}>Rhyme: {lastBattle.scores.user.rhyme} | Flow: {lastBattle.scores.user.flow}</Text>
                                                    </Card>
                                                </Grid.Col>
                                                <Grid.Col span={6}>
                                                    <Card bg="white" withBorder>
                                                        <Text size="xs" c="dimmed" fw={700}>{lastBattle.opponent.toUpperCase()}</Text>
                                                        <Title order={2} c="red">{lastBattle.scores.ai.total}</Title>
                                                        <Text size="xs" mt={5}>Rhyme: {lastBattle.scores.ai.rhyme} | Flow: {lastBattle.scores.ai.flow}</Text>
                                                    </Card>
                                                </Grid.Col>
                                            </Grid>
                                            <Text size="sm" mt="md" fs="italic" c="dimmed" ta="center">"{lastBattle.scores.comment}"</Text>
                                            
                                            <Divider my="md" />
                                            
                                            <Text size="xs" fw={700} c="dimmed">AI VERSE:</Text>
                                            <Text style={{ whiteSpace: 'pre-line', fontStyle: 'italic' }}>"{lastBattle.aiVerse}"</Text>
                                            <Button variant="subtle" size="xs" mt="xs" leftSection={<IconMusic size={14}/>} onClick={() => playAudio('last-battle', lastBattle.aiVerse, opponent)}>Play Audio</Button>
                                        </Card>
                                    )}
                                </Container>
                            </Tabs.Panel>

                            {/* --- 4. MULTIPLAYER TAB --- */}
                            <Tabs.Panel value="multiplayer" pt="md">
                                {mode === 'menu' && (
                                    <Stack>
                                        <Card shadow="md" padding="xl" radius="lg" withBorder style={{ borderColor: '#228be6', borderWidth: 2 }}>
                                            <Stack align="center" gap="md">
                                                <Title order={3} c="blue">QUICK PLAY</Title>
                                                <Text ta="center" size="sm" c="dimmed">Enter the global queue and get matched instantly.</Text>
                                                
                                                {!isQueuing ? (
                                                    <Button 
                                                        size="xl" fullWidth radius="md" 
                                                        variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}
                                                        onClick={joinQueue} leftSection={<IconSwords size={28} />}
                                                    >
                                                        FIND MATCH
                                                    </Button>
                                                ) : (
                                                    <Button 
                                                        size="xl" fullWidth radius="md" 
                                                        color="red" variant="outline"
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
                                                        <Button variant="light" fullWidth onClick={startMultiplayer}>Create</Button>
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

                                {mode === 'create_success' && (
                                    <Card shadow="sm" padding="xl" withBorder>
                                        <Stack align="center">
                                            <Loader size="lg" variant="dots" />
                                            <Title order={3}>Waiting for Opponent</Title>
                                            <Group>
                                                <Text fw={700}>CODE:</Text>
                                                <Badge size="xl" variant="filled" color="dark">{battleCode}</Badge>
                                                <CopyButton value={battleCode}>{({ copied, copy }) => (<Button size="xs" onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>)}</CopyButton>
                                            </Group>
                                            
                                            <Divider style={{ width: '100%' }} label="Settings" labelPosition="center"/>
                                            <SegmentedControl value={battleMode} onChange={setBattleMode} data={[{ label: 'Text', value: 'text' }, { label: 'Audio', value: 'audio' }]} />
                                            <Switch label="Word Challenge" checked={wordMode} onChange={(e) => setWordMode(e.currentTarget.checked)} />
                                            
                                            <Button variant="subtle" color="red" onClick={() => { ws.current.close(); setMode('menu'); }}>Cancel</Button>
                                        </Stack>
                                    </Card>
                                )}

                                {mode === 'join' && (
                                    <Card shadow="sm" padding="lg" withBorder>
                                        <Group mb="md"><ActionIcon variant="subtle" onClick={() => setMode('menu')}><IconArrowLeft/></ActionIcon><Title order={4}>Enter Battle Code</Title></Group>
                                        <Group><Input placeholder="e.g. 1234abc" style={{flex: 1}} value={battleCode} onChange={(e) => setBattleCode(e.currentTarget.value)}/><Button onClick={joinMultiplayer} loading={isLoading} leftSection={<IconSearch size={16}/>}>Join</Button></Group>
                                    </Card>
                                )}

                                {mode === 'waiting_for_start' && (
                                    <Card shadow="sm" padding="xl" withBorder>
                                        <Stack align="center">
                                            <Loader size="xl" type="dots" />
                                            <Title order={3}>Connecting to Arena...</Title>
                                            <Text c="dimmed">Waiting for host to sync settings.</Text>
                                            <Button variant="subtle" color="red" onClick={() => { 
                                                if(ws.current) ws.current.close(); 
                                                setMode('menu'); 
                                            }}>
                                                Cancel
                                            </Button>
                                        </Stack>
                                    </Card>
                                )}

                                {mode === 'arena' && (
                                    <Card shadow="sm" padding="lg" withBorder>
                                        <Stack gap="md">
                                            <Group justify="space-between">
                                                <Group>
                                                    <Avatar src={p1Data?.id ? `/avatar/${p1Data?.id}?t=${Date.now()}` : null} radius="xl" color="blue">{p1Data?.name?.[0]}</Avatar>
                                                    <Stack gap={0}>
                                                        <Text size="xs" c="dimmed">OPPONENT</Text>
                                                        <Title order={5}>{p1Data?.name || "Unknown"}</Title>
                                                    </Stack>
                                                </Group>
                                                <Badge 
                                                    size="xl" 
                                                    variant="filled"
                                                    color={isMyTurn ? (timeLeft < 10 ? 'red' : 'green') : 'gray'}
                                                >
                                                    {isMyTurn ? `YOUR TURN: ${timeLeft}s` : "THEIR TURN"}
                                                </Badge>
                                            </Group>

                                            {wordMode && <WordDisplay word={targetWord} />}
                                            <Divider />

											{/* CHAT LOG */}
                                            <Stack gap="sm" style={{ height: 300, overflowY: 'auto' }}>
                                                {battleLog.length === 0 && <Text c="dimmed" ta="center" fs="italic" mt="xl">The battle begins! {isMyTurn ? "You go first!" : "Opponent goes first."}</Text>}
                                                
                                                {battleLog.map((log, i) => (
                                                    <Group key={i} justify={log.sender === 'me' ? 'flex-end' : 'flex-start'} align="flex-start">
														{/* OPPONENT AVATAR */}
                                                        {log.sender !== 'me' && <Avatar size="sm" radius="xl" src={`/avatar/${p1Data?.id}`} />}

														{/* MESSAGE BUBBLE */}
                                                        <Card bg={log.sender === 'me' ? 'blue.1' : 'gray.1'} radius="md" p="sm" style={{ maxWidth: '80%' }}>
															<Group gap="xs">
																{/* PLAY BUTTON (Always Visible) */}
																<ActionIcon 
																	variant="light" color={log.sender === 'me' ? 'blue' : 'dark'} radius="xl" 
																	onClick={() => handleManualPlay(log)}
																>
																	<IconPlayerPlay size={14} />
																</ActionIcon>
																{/* TEXT CONTENT */}
																<Text size="sm" style={{ whiteSpace: 'pre-line' }}>
																	{log.audio ? "(Audio Verse)" : log.text}
																</Text>
															</Group>
                                                        </Card>

														{/* MY AVATAR */}
                                                        {log.sender === 'me' && (
                                                            <Avatar size="sm" radius="xl" src={user?.id ? `/avatar/${user.id}` : null}>{user?.firstName?.[0]}</Avatar>
                                                        )}
                                                    </Group>
                                                ))}
                                            </Stack>

                                            <Divider />

                                            {isMyTurn ? (
                                                <Stack>
                                                    {battleMode === 'audio' ? (
                                                        <Group justify="center">
                                                            {!recordedBlob ? (
                                                                <Button 
                                                                    size="xl" color={isRecording ? 'red' : 'blue'} 
                                                                    radius="xl" style={{ flex: 1 }}
                                                                    leftSection={isRecording ? <IconMicrophoneOff/> : <IconMicrophone/>}
                                                                    onClick={isRecording ? stopRecording : startRecording}
                                                                >
                                                                    {isRecording ? `Recording (${30 - timeLeft}s)...` : "Hold to Record"}
                                                                </Button>
                                                            ) : (
                                                                <Group style={{ flex: 1 }}>
                                                                    <Button color="red" variant="subtle" onClick={() => setRecordedBlob(null)}>Retry</Button>
                                                                    <Button color="green" flex={1} size="lg" rightSection={<IconSend size={18}/>} onClick={() => submitTurn("(Audio Verse)")}>Send Audio</Button>
                                                                </Group>
                                                            )}
                                                        </Group>
                                                    ) : (
                                                        <Group align="end">
                                                            <Textarea 
                                                                placeholder={`You have ${timeLeft}s to spit bars...`}
                                                                minRows={2} style={{ flex: 1 }}
                                                                value={input}
                                                                onChange={(e) => {
                                                                    setInput(e.currentTarget.value);
                                                                    if (ws.current) ws.current.send(JSON.stringify({ type: 'TYPING' }));
                                                                }}
                                                                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTurn(); }}}
                                                            />
                                                            <ActionIcon size="xl" radius="md" variant="gradient" gradient={{ from: 'blue', to: 'indigo' }} onClick={() => submitTurn()}>
                                                                <IconSend size={24} />
                                                            </ActionIcon>
                                                        </Group>
                                                    )}
                                                </Stack>
                                            ) : (
                                                <Card bg="gray.0" p="sm" radius="md">
                                                    <Group justify="center">
                                                        <Loader size="sm" type="dots" />
                                                        <Text c="dimmed" size="sm">
                                                            {isOpponentTyping ? "Opponent is writing..." : "Opponent is thinking..."}
                                                        </Text>
                                                    </Group>
                                                </Card>
                                            )}
                                        </Stack>
                                    </Card>
                                )}

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

                            {/* --- 5. LEADERBOARD TAB --- */}
                            <Tabs.Panel value="leaderboard" pt="md">
                                <Card shadow="sm" padding="lg" radius="md" withBorder>
                                <Group justify="space-between" mb="md"><Title order={3}>Hall of Fame</Title><SegmentedControl value={leaderboardType} onChange={setLeaderboardType} data={[{ label: 'Single Player', value:'single' }, { label: 'PVP Arena', value:'pvp' }]} /></Group>
                                <Table striped><Table.Thead><Table.Tr><Table.Th>Rank</Table.Th><Table.Th>Rapper</Table.Th><Table.Th>Wins</Table.Th></Table.Tr></Table.Thead>
                                <Table.Tbody>{leaderboard.map((player, index) => (<Table.Tr key={player.username}><Table.Td>#{index + 1}</Table.Td><Table.Td fw={700}>{player.username}</Table.Td><Table.Td>{player.score}</Table.Td></Table.Tr>))}</Table.Tbody></Table>
                                </Card>
                            </Tabs.Panel>

                            {/* --- 6. PROFILE TAB --- */}
                            <Tabs.Panel value="profile" pt="md">
                                <Stack gap="xl">
                                    <ProfileView
                                        user={user}
                                        stats={stats}
                                        identity={identity}
                                        onUpdateProfile={updateProfileLogic}
                                        uploading={uploading}
                                        avatarTs={avatarTs}
                                    />
                                    
                                    <Container size="sm" style={{ width: '100%' }}>
                                        <Divider label={<Badge variant="outline">Full Battle History</Badge>} labelPosition="center" mb="lg" />
                                        {history.length === 0 ? <Text c="dimmed" ta="center">No battles recorded yet.</Text> : (
                                            <Stack gap="md">
                                                {history.map((item) => <HistoryItem key={item.id} item={item} playAudio={playAudio} />)}
                                            </Stack>
                                        )}
                                        {history.length > 0 && <Center mt="md"><Button variant="subtle" color="red" onClick={clearHistory}>Clear History</Button></Center>}
                                    </Container>
                                </Stack>
                            </Tabs.Panel>
                        </Tabs>
                    </Stack>
                </Container>
            </SignedIn>
        </>
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