import React, { useState, useEffect, useRef } from 'react'
import {
    MantineProvider,
    Container,
    Title,
    Card,
    Text,
    Textarea,
    Button,
    Group,
    Badge,
    Stack,
    Grid,
    ActionIcon,
    Loader,
    Tabs,
    Table,
    Input,
    CopyButton,
    Divider,
    Center,
    SegmentedControl,
    Switch,
    rem,
    Modal,
    FileButton,
    TextInput
} from '@mantine/core';
import { 
    IconMicrophone, IconMicrophoneOff, IconSend, IconTrash, 
    IconPlayerPlay, IconTrophy, IconSwords, IconUsers, IconSearch, IconArrowLeft,
    IconWorld, IconKeyboard, IconShare
} from '@tabler/icons-react';
import '@mantine/core/styles.css'
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton, useUser, useAuth } from "@clerk/clerk-react";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_KEY) {
    throw new Error("Missing Publishable Key. Check your .env file.");
}

// --- MAIN APP COMPONENT ---
function RapBattleApp() {
    // --- AUTH STATE ---
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();

    // USER ONBOARDING STATE
    const [identity, setIdentity] = useState(null);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [onboardingName, setOnboardingName] = useState(''); 
    const [onboardingFile, setOnboardingFile] = useState(null);
    
    // --- GLOBAL STATE ---
    const [stats, setStats] = useState({ wins: 0, losses: 0, rank: 'Novice' });
    const [leaderboard, setLeaderboard] = useState([]);
    const [leaderboardType, setLeaderboardType] = useState('single');

    // --- SINGLE PLAYER STATE ---
    const [history, setHistory] = useState([]);
    const [input, setInput] = useState(''); // This is for the Rap Verse
    const [opponent, setOpponent] = useState('roboflow');
    const [status, setStatus] = useState('Ready');
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // -- MULTIPLAYER STATE ---
    const [mode, setMode] = useState('menu') 
    const [battleCode, setBattleCode] = useState(''); 
    const [p1Data, setP1Data] = useState(null); 
    const [duelResult, setDuelResult] = useState(null); 
    const [battleMode, setBattleMode] = useState('text'); 
    const ws = useRef(null);

    // --- AUDIO MODE ---
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [timer, setTimer] = useState(30);
    const timerRef = useRef(null);

    // AUDIO REFS
    const audioCache = useRef({});
    const mediaRecorder = useRef(null);
    const audioChunks = useRef([]);

    // INITIALIZE
    useEffect(() => {
        if (user) {
            fetchStats(user.id);
            loadHistory();
        }
        fetchLeaderboard();
    }, [user]);

    // REPLAY CHECKER
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const replayId = params.get('replay');
        if (replayId) {
            loadReplay(replayId);
        }
    }, []);

    // --- API HELPER FUNCTIONS ---
    const fetchStats = async (userId) => {
        try {
            const res = await fetch(`/profile/${userId}`);
            const data = await res.json();
            if (data.data) setStats(data.data);
            if (data.identity) {
                setIdentity(data.identity);
                // If they have no name, open modal
                if (!data.identity.mc_name) setShowOnboarding(true);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleOnboardingSubmit = async () => {
        if (!user || !onboardingName) return alert("Please enter a name");
        setUploading(true);
        const token = await getToken();

        // 1. Upload Image (If selected)
        if (onboardingFile) {
            const formData = new FormData();
            formData.append('image', onboardingFile);

            await fetch('/onboarding/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`},
                body: formData
            });
        }

        // 2. Update Name
        await fetch('/onboarding/update', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mcName: onboardingName }) // Use correct state
        });

        setShowOnboarding(false);
        setUploading(false);
        fetchStats(user.id);
    }

    const fetchLeaderboard = async (type='single') => {
        try {
            const endpoint = type === 'pvp' ? '/leaderboard/pvp' : '/leaderboard';
            const res = await fetch(endpoint);
            const data = await res.json();
            setLeaderboard(data);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchLeaderboard(leaderboardType);
    }, [leaderboardType]);

    const loadHistory = () => {
        try {
            const hist = JSON.parse(localStorage.getItem('battle_history') || '[]');
            const cleanHist = hist.map((h, i) => ({
                ...h,
                id: h.id || `legacy-${i}-${Date.now()}`,
            }));
            setHistory(cleanHist);
        } catch (e) {
            setHistory([]);
        }
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
                scores: {
                    p1_score: '-',
                    p2_score: '-',
                    comment: 'Replay Mode - Scores hidden'
                },
                winnerCode: data.winner === data.p1_name ? 'p1_win' : 'p2_win',
                battle_id: id 
            });

            setMode('result');
        } catch (e) {
            alert('Failed to load replay: ' + e.message);
        }
        setIsLoading(false);
    };

    const shareReplay = () => {
        let link = window.location.href;
        if (duelResult && duelResult.battle_id && !window.location.search.includes('replay')) {
            const baseUrl = window.location.origin + window.location.pathname;
            link = `${baseUrl}?replay=${duelResult.battle_id}`;
        }
        navigator.clipboard.writeText(link);
        alert("Replay link copied: " + link);
    };

    // --- BATTLE LOGIC ---
    const handleBattle = async () => {
        if (!user) return alert("Please sign in!");
        if (!input) return alert('Freestyle something!');
        
        setIsLoading(true);
        setStatus('Sending Verse');

        try {
            const token = await getToken(); 

            const res = await fetch('/battle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ userRap: input, opponent }),
            });

            setStatus('AI Writing...');
            const data = await res.json();

            setStatus('Ready');
            data.id = `battle-${Date.now()}`;
            saveHistory(data);
            setInput(''); 
            fetchLeaderboard();
        } catch (e) {
            alert(e.message);
            setStatus('Error');
        }
        setIsLoading(false);
    };

    // --- AUDIO LOGIC ---
    const playAudio = async (battleId, text, character) => {
        if (audioCache.current[battleId]) {
            new Audio(audioCache.current[battleId]).play();
            return;
        }
        setStatus('Generating Audio...');
        try {
            const res = await fetch('/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, character }),
            });
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            audioCache.current[battleId] = url;
            new Audio(url).play();
            setStatus('Ready');
        } catch (e) {
            console.error(e);
            setStatus('Audio Failed');
        }
    };

    const toggleMic = async () => {
        if (isRecording) stopRecording();
        else startRecording();
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder.current = new MediaRecorder(stream);
            audioChunks.current = [];

            mediaRecorder.current.ondataavailable = (event) => {
                audioChunks.current.push(event.data);
            };

            mediaRecorder.current.onstop = handleTranscription;

            mediaRecorder.current.start();
            setIsRecording(true);
            setStatus('Recording...');
        } catch (err) {
            alert('Microphone error: ' + err.message);
        }
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
            const response = await fetch('/transcribe', {
                method: 'POST',
                body: audioBlob, 
                headers: { 'Content-Type': 'audio/webm' },
            });
            const data = await response.json();
            if (data.text) {
                setInput(data.text);
                setStatus('Ready');
            } else {
                throw new Error('No text returned');
            }
        } catch (e) {
            console.error(e);
            setStatus('Transcription Failed');
        }
    };

    // --- WEBSOCKETS ---
    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result); 
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

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

    const connectToWebSocket = (roomID, action, selectedMode='text') => {
        if (ws.current) ws.current.close();
        setStatus('Connecting...');

        const socket = new WebSocket(`ws://127.0.0.1:8787/ws/battle/${roomID}`);
        ws.current = socket;

        socket.onopen = async () => {
            console.log("WS Connected");
            if (action == "CREATE") {
                let audioData = null;
                if (selectedMode === 'audio' && recordedBlob) {
                    audioData = await blobToBase64(recordedBlob);
                }
                socket.send(JSON.stringify({ 
                    type: 'CREATE', 
                    username: user?.firstName || 'Guest',
                    verse: input, 
                    battleMode: selectedMode,
                    audioData: audioData
                }));
                setMode('create_success');
            }
            if (action === 'JOIN') {
                socket.send(JSON.stringify({ 
                    type: 'JOIN', 
                    username: user?.firstName || 'Guest' 
                }));
            }
        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type == 'OPPONENT_JOINED') alert(`${msg.username} has entered the ring!`);

            if (msg.type === "BATTLE_START") {
                setP1Data({ name: msg.opponent, verse: msg.verse });
                setBattleMode(msg.battleMode || 'text');
                setMode('fight');
                if (msg.battleMode === 'audio') {
                    if (msg.audioData) {
                        const realAudio = new Audio(msg.audioData);
                        realAudio.play();
                        realAudio.onended = () => startTimer();
                    } else {
                        playAudio(`p1-${Date.now()}`, msg.verse, 'roboflow');
                        startTimer();
                    }
                }
            }
            if (msg.type === "JUDGING") setMode('judging');
            if (msg.type === 'RESULT') {
                setDuelResult(msg.result);
                setMode('result');
                if (timerRef.current) clearInterval(timerRef.current);

                if (battleMode === 'audio' && msg.result.p2_audio && user?.firstName !== msg.result.winner) {
                    new Audio(msg.result.p2_audio).play()
                } else if (battleMode === 'audio' && msg.result.p2_verse) {
                    playAudio(`p2-${Date.now()}`, msg.result.p2_verse, 'bytebeater');
                }
                if (msg.message) alert(msg.message);
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
        if (battleMode === 'audio' && recordedBlob) {
            audioData = blobToBase64(recordedBlob);
        }
        if (!input) return alert("Rap something back!")
        
        ws.current.send(JSON.stringify({ 
            type: 'REPLY',
            verse: input,
            audioData: audioData
        }));
    }

    // --- RENDER ---
    return (
    <Container size="sm" py="xl">
        <Stack gap="lg">
            {/* HEADER */}
            <Group justify="space-between" align="center">
            <div>
                <Title order={2}>Rap Battle Bot</Title>
                {!isLoaded ? <Loader size="xs"/> : (
                    <Text c="dimmed" size="sm">
                        {user ? (identity?.mc_name ? identity.mc_name : `MC ${user.firstName}`) : 'Please Sign In'}
                    </Text>
                )}
            </div>
            
            {/* AUTH BUTTONS */}
            <Group>
                {!isLoaded ? null : (
                    <>
                        <SignedOut>
                            <SignInButton mode="modal">
                                <Button variant="outline">Sign In</Button>
                            </SignInButton>
                        </SignedOut>
                        <SignedIn>
                            <Badge size="lg" color="blue" variant="light" mr="xs">
                                W: {stats.wins} | Rank: {stats.rank}
                            </Badge>
                            <UserButton />
                        </SignedIn>
                    </>
                )}
            </Group>
            </Group>

            {/* PROTECTED CONTENT */}
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

            {/* GAME TABS */}
            <SignedIn>
                <Tabs defaultValue="battle" keepMounted={false}>
                <Tabs.List grow>
                    <Tabs.Tab value="battle" leftSection={<IconSwords size={18} />}>Single Player</Tabs.Tab>
                    <Tabs.Tab value="multiplayer" leftSection={<IconUsers size={18} />}>Multiplayer</Tabs.Tab>
                    <Tabs.Tab value="leaderboard" leftSection={<IconTrophy size={18} />}>Leaderboard</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="battle" pt="md">
                    <Card shadow="sm" padding="lg" radius="md" withBorder>
                    <Stack>
                        <Text fw={500}>Choose Opponent:</Text>
                        <Group>
                        {['roboflow', 'bytebeater', 'ai-ce'].map(opp => (
                            <Button key={opp} 
                                variant={opponent === opp ? 'filled' : 'light'} 
                                onClick={() => setOpponent(opp)}
                                color={opponent === opp ? 'blue' : 'gray'}
                            >
                                {opp.toUpperCase()}
                            </Button>
                        ))}
                        </Group>

                        <Textarea 
                            placeholder="Spit your bars..." 
                            minRows={4} 
                            value={input} 
                            onChange={(e) => setInput(e.currentTarget.value)} 
                        />

                        <Group justify="space-between">
                            <Button color={isRecording ? 'red' : 'gray'} onClick={toggleMic} leftSection={isRecording ? <IconMicrophoneOff/> : <IconMicrophone/>}>
                                {isRecording ? 'Stop' : 'Record'}
                            </Button>
                            <Button onClick={handleBattle} loading={isLoading} rightSection={<IconSend size={16} />}>Battle AI</Button>
                        </Group>
                        <Text size="xs" ta="right" c="dimmed">{status}</Text>
                    </Stack>
                    </Card>

                    <Group align="center" mb="sm" mt="xl">
                        <Divider label="Battle History" labelPosition='center' style={{ flex: 1 }}/>
                        {history.length > 0 && (
                            <Button variant="subtle" color="red" size="compact-xs" onClick={clearHistory} leftSection={<IconTrash size={12}/>}>Clear</Button>
                        )}
                    </Group>
                    {history.map((item) => (
                    <Card key={item.id} shadow="sm" padding="md" radius="md" withBorder mb="sm">
                        <Grid>
                        <Grid.Col span={6} style={{borderRight: '1px solid #eee'}}>
                            <Text fw={700} c="blue">YOU</Text>
                            <Text size="sm">{item.userRap}</Text>
                        </Grid.Col>
                        <Grid.Col span={6}>
                            <Text fw={700} c="pink">{item.opponent?.toUpperCase()}</Text>
                            <Text size="sm">{item.aiVerse}</Text>
                            <Button size="xs" mt="xs" variant="subtle" onClick={() => playAudio(item.id, item.aiVerse, item.opponent)}>Play Audio</Button>
                        </Grid.Col>
                        </Grid>
                        <Card.Section bg="gray.1" p="xs" mt="sm">
                            <Center>
                                <Text fw={700} c={item.result === 'win' ? 'green' : 'red'}>
                                    {item.result === 'win' ? 'WINNER' : 'DEFEATED'} ({item.scores?.user?.total} - {item.scores?.ai?.total})
                                </Text>
                            </Center>
                        </Card.Section>
                    </Card>
                    ))}
                </Tabs.Panel>

                <Tabs.Panel value="multiplayer" pt="md">
                    {mode === 'menu' && (
                        <Grid>
                            <Grid.Col span={6}>
                                <Card shadow="sm" padding="xl" radius="md" withBorder style={{height: '100%'}}>
                                    <Stack align="center" justify="center" h={200}>
                                        <IconSwords size={48} color="#228be6" />
                                        <Title order={4}>Create Battle</Title>
                                        <Button fullWidth onClick={() => setMode('create')}>Start New Battle</Button>
                                    </Stack>
                                </Card>
                            </Grid.Col>
                            <Grid.Col span={6}>
                                <Card shadow="sm" padding="xl" radius="md" withBorder style={{height: '100%'}}>
                                    <Stack align="center" justify="center" h={200}>
                                        <IconUsers size={48} color="#fa5252" />
                                        <Title order={4}>Join Battle</Title>
                                        <Button color="red" fullWidth onClick={() => setMode('join')}>Enter Code</Button>
                                    </Stack>
                                </Card>
                            </Grid.Col>
                        </Grid>
                    )}
                    {/* ... other multiplayer modes (create, fight, etc) use same structure ... */}
                    {mode === 'create' && (
                        <Card shadow="sm" padding="lg" withBorder>
                            <Group mb="md"><ActionIcon variant="subtle" onClick={() => setMode('menu')}><IconArrowLeft/></ActionIcon><Title order={4}>Record Your Opening Verse</Title></Group>
                            <Switch size="lg" offLabel={<IconMicrophone style={{ width:rem(16), height:rem(16) }}/>} onLabel={<IconKeyboard style={{ width:rem(16), height:rem(16) }}/>} checked={battleMode === 'text'} onChange={(event) => setBattleMode(event.currentTarget.checked ? 'text' : 'audio')} label={battleMode === 'text' ? 'Text Mode' : 'Audio Mode'}/>
                            <Textarea placeholder={battleMode === 'audio' ? 'Press Record...' : 'Type your verse...'} minRows={4} value={input} onChange={(e) => setInput(e.currentTarget.value)} mb="md" readOnly={battleMode === 'audio'} variant={battleMode === 'audio' ? 'filled' : 'default'}/>
                            <Group justify="space-between">
                                {battleMode === 'audio' && (<Button color={isRecording ? 'red' : 'gray'} onClick={toggleMic} leftSection={isRecording ? <IconMicrophoneOff/> : <IconMicrophone/>}>{isRecording ? 'Stop' : 'Record'}</Button>)}
                                {battleMode === 'text' && <div />}
                                <Button onClick={startMultiplayer} loading={isLoading}>Create Challenge</Button>
                            </Group>
                        </Card>
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
                                {battleMode === 'audio' && (<Card bg={timer < 10 ? 'red.1' : 'blue.1'} mb="md" radius="md"><Group justify="space-between"><Text fw={700}>⏱️ TIME TO REPLY:</Text><Title order={3} c={timer < 10 ? 'red' : 'blue'}>{timer}s</Title></Group><div style={{ width: '100%', height: '6px', background: '#ddd', marginTop: '10px', borderRadius: '4px' }}><div style={{ width: `${(timer / 30) * 100}%`, height: '100%', background: timer < 10 ? 'red' : '#228be6', transition: 'width 1s linear', borderRadius: '4px'}}/></div></Card>)}
                                <Card bg="gray.1" padding="md" radius="md"><Text size="lg" style={{fontStyle: 'italic'}}>"{p1Data.verse}"</Text></Card>
                                <Divider label="Your Turn" labelPosition="center" /><Textarea placeholder="Write your comeback..." minRows={4} value={input} onChange={(e) => setInput(e.currentTarget.value)} readOnly={battleMode === 'audio'} variant={battleMode === 'audio' ? 'filled' : 'default'}/>
                                <Group justify="space-between">
                                    {battleMode === 'audio' ? (<Button color={isRecording ? 'red' : 'gray'} onClick={toggleMic} leftSection={isRecording ? <IconMicrophoneOff/> : <IconMicrophone/>}>{isRecording ? 'Stop' : 'Record'}</Button>) : <div/>}
                                    <Button color="red" onClick={sendWsReply} loading={isLoading}>Finish Him!</Button>
                                </Group>
                            </Stack>
                        </Card>
                    )}
                    {mode === 'judging' && (<Card h={300} withBorder><Center h="100%"><Stack align="center"><Loader size="xl" color="red" type="bars"/><Title order={3}>AI Judge is Deciding...</Title></Stack></Center></Card>)}
                    {mode === 'result' && duelResult && (
                        <Card shadow="sm" padding="xl" withBorder>
                            <Stack align="center"><Title order={2}>Winner: {duelResult.winner}</Title>
                            <Grid style={{ width: '100%' }} gutter="lg"><Grid.Col span={6}><Card bg="blue.1" padding="sm" radius="md"><Text size="xs" fw={700} c="dimmed">PLAYER 1</Text><Text size="sm" style={{ fontStyle: 'italic' }}>"{duelResult.p1_verse}"</Text></Card></Grid.Col><Grid.Col span={6}><Card bg="red.1" padding="sm" radius="md"><Text size="xs" fw={700} c="dimmed">PLAYER 2</Text><Text size="sm" style={{fontStyle: 'italic'}}>"{duelResult.p2_verse}"</Text></Card></Grid.Col></Grid>
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
                    <Table.Tbody>{leaderboard.map((player, index) => (<Table.Tr key={player.username}><Table.Td>#{index + 1}</Table.Td><Table.Td fw={700}>{player.username}</Table.Td><Table.Td>{player.wins}</Table.Td></Table.Tr>))}</Table.Tbody></Table>
                    </Card>
                </Tabs.Panel>
                </Tabs>
            </SignedIn>

            {/* REPLAY MODE */}
            {mode === 'result' && !user && duelResult && (
                <Card shadow="sm" padding="xl" withBorder mt="xl"><Stack align="center"><Badge color="red">REPLAY MODE</Badge><Title order={2}>Winner: {duelResult.winner}</Title>
                <Grid style={{ width: '100%' }} gutter="lg"><Grid.Col span={6}><Card bg="blue.1" padding="sm" radius="md"><Text size="xs" fw={700} c="dimmed">PLAYER 1</Text><Text size="sm" style={{ fontStyle: 'italic' }}>"{duelResult.p1_verse}"</Text></Card></Grid.Col><Grid.Col span={6}><Card bg="red.1" padding="sm" radius="md"><Text size="xs" fw={700} c="dimmed">PLAYER 2</Text><Text size="sm" style={{fontStyle: 'italic'}}>"{duelResult.p2_verse}"</Text></Card></Grid.Col></Grid>
                <Text c="dimmed" mt="md" ta="center">"{duelResult.scores.comment}"</Text><Button variant="light" leftSection={<IconShare size={16}/>} onClick={shareReplay}>Share This Replay</Button></Stack></Card>
            )}

            </Stack>
            {/* ONBOARDING MODAL */}
            <Modal 
                opened={showOnboarding} 
                onClose={() => {}} // Force them to finish
                title="Setup Your Rapper Profile"
                centered
                withCloseButton={false}
                closeOnClickOutside={false}
            >
            <Stack>
                <Text size="sm">Choose your stage name and upload a photo for the AI to analyze (so it can roast your outfit!).</Text>
                
                <TextInput 
                    label="MC Name" 
                    placeholder="e.g. Lil Cloud" 
                    value={onboardingName} 
                    onChange={(e) => setOnboardingName(e.target.value)}
                    data-autofocus
                />
                
                <Text size="sm" fw={500} mt="sm">Profile Picture (Optional)</Text>
                <Group>
                    <FileButton onChange={setOnboardingFile} accept="image/png,image/jpeg"> 
                        {(props) => <Button variant="default" {...props}>Upload Selfie</Button>} 
                    </FileButton>
                    {onboardingFile && <Text size="xs" c="green">{onboardingFile.name}</Text>}
                </Group>

                <Button fullWidth onClick={handleOnboardingSubmit} loading={uploading} mt="md">
                    Enter the Arena
                </Button>
            </Stack>
        </Modal>
    </Container>
    );
}

// --- WRAPPER FOR MANTINE ---
export default function App() {
    return (
        <ClerkProvider publishableKey={CLERK_KEY}>
            <MantineProvider>
                <RapBattleApp />
            </MantineProvider>
        </ClerkProvider>
    );
}