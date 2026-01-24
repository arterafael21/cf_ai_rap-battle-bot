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
  rem
} from '@mantine/core';
import { 
    IconMicrophone, IconMicrophoneOff, IconSend, IconTrash, 
    IconPlayerPlay, IconTrophy, IconSwords, IconUsers, IconSearch, IconArrowLeft,
    IconWorld, IconKeyboard
} from '@tabler/icons-react';
import '@mantine/core/styles.css'

// --- MAIN APP COMPONENT ---
function RapBattleApp() {
  // --- GLOBAL STATE ---
    const [username, setUsername] = useState('');
    const [stats, setStats] = useState({ wins: 0, losses: 0, rank: 'Novice' });
    const [leaderboard, setLeaderboard] = useState([]);
    const [leaderboardType, setLeaderboardType] = useState('single');

  // --- SINGLE PLAYER STATE ---
    const [history, setHistory] = useState([]);
    const [input, setInput] = useState('');
    const [opponent, setOpponent] = useState('roboflow');
    const [status, setStatus] = useState('Ready');
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // -- MULTIPLAYER STATE ---
    const [mode, setMode] = useState('menu') // 'menu', 'create', 'join', 'battle', 'result'
    const [battleCode, setBattleCode] = useState(''); // ID to share
    const [p1Data, setP1Data] = useState(null); // the opponent's data when joining
    const [duelResult, setDuelResult] = useState(null); // final score'
    const [battleMode, setBattleMode] = useState('text'); // or 'audio'
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
        let user = localStorage.getItem('rapper_name');
        if (!user) {
            user = 'MC_' + Math.floor(Math.random() * 1000);
            localStorage.setItem('rapper_name', user);
        }
        setUsername(user);
        fetchStats(user);
        loadHistory();
        fetchLeaderboard();
    }, []);

    // HELPER FUNCTIONS
    const fetchStats = async (user) => {
        try {
            const res = await fetch(`/profile/${user}`);
            const data = await res.json();
            if (data.data) setStats(data.data);
        } catch (e) {
            console.error(e);
        }
    };

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
            // Ensure IDs
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
        fetchStats(username); // Refresh stats after battle
    };

    const clearHistory = () => {
        if (confirm('Clear history?')) {
            localStorage.removeItem('battle_history');
            setHistory([]);
        }
    };

    // SINGLE PLAYER BATTLE
    const handleBattle = async () => {
        if (!input) return alert('Freestyle something!');
        setIsLoading(true);
        setStatus('Sending Verse');

        try {
            const res = await fetch('/battle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Username': username,
                },
                body: JSON.stringify({ userRap: input, opponent }),
            });

            setStatus('AI Writing...');
            const data = await res.json();

            setStatus('Ready');
            // Add ID for React keys
            data.id = `battle-${Date.now()}`;
            saveHistory(data);
            setInput(''); // Clear input
      fetchLeaderboard();
        } catch (e) {
            alert(e.message);
            setStatus('Error');
        }
        setIsLoading(false);
    };

    // AUDIO LOGIC
    const playAudio = async (battleId, text, character) => {
        // Check Cache
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
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
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
            alert('Microphone access denied or error: ' + err.message);
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
                body: audioBlob, // Send raw blob
                headers: {
                    'Content-Type': 'audio/webm',
                },
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
            alert('Could not transcribe audio.');
        }
    };

    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result); // data:audio/webm;base64,...
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

  // WEBSOCKET MULTIPLAYER
  // Create Game
  const startMultiplayer = () => {
    if (!input) return alert("Write a verse first!");
    // gen random ID for room
    const roomID = Math.random().toString(36).substring(2, 7);
    setBattleCode(roomID);
    connectToWebSocket(roomID, 'CREATE', battleMode);
  };
  
  // Join Game
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
                username, 
                verse: input,
                battleMode: selectedMode,
                audioData: audioData
            }));
            setMode('create_success');
        }
        if (action === 'JOIN') {
            socket.send(JSON.stringify({ type: 'JOIN', username }));
        }
    };

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        // CASE 1: P2 JOINED
        if (msg.type == 'OPPONENT_JOINED') {
            alert(`${msg.username} has entered the ring!`);
        }

        // CASE 2: START FIGHTING
        if (msg.type === "BATTLE_START") {
            setP1Data({ name: msg.opponent, verse: msg.verse });

            setBattleMode(msg.battleMode || 'text');
            setMode('fight');

            // only play if audio mode
            if (msg.battleMode === 'audio') {
                if (msg.audioData) {
                    const realAudio = new Audio(msg.audioData);
                    realAudio.play();

                    // start time when audio ends
                    realAudio.onended = () => startTimer();
                } else {
                    playAudio(`p1-${Date.now()}`, msg.verse, 'roboflow');
                    startTimer();
                }
            }
        }

        // CASE 3: LOADING SCREEN
        if (msg.type === "JUDGING") {
            setMode('judging');
        }

        // CASE 4: THE END
        if (msg.type === 'RESULT') {
            setDuelResult(msg.result);
            setMode('result');

            if (timerRef.current) clearInterval(timerRef.current);

            if (battleMode === 'audio' && msg.result.p2_audio && username !== msg.result.winner) {
                new Audio(msg.result.p2_audio).play()
            } else if (battleMode === 'audio' && msg.result.p2_verse) {
                playAudio(`p2-${Date.now()}`, msg.result.p2_verse, 'bytebeater');
            }

            if (msg.message) alert(msg.message);
            
            ws.current.close(); 
        }
    };

    socket.onerror = (e) => console.error("WS ERROR", e);
  };

  const startTimer = () => {
    setTimer(30);
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
        setTimer((prev) => {
            if (prev <= 1) {
                clearInterval(timerRef.current);
                return 0;
            }
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

    return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        {/* HEADER */}
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>Rap Battle Bot</Title>
            <Text c="dimmed" size="sm">Identity: {username}</Text>
          </div>
          <Badge size="lg" color="blue" variant="light">
            W: {stats.wins} | L: {stats.losses} | {stats.rank}
          </Badge>
        </Group>

        <Tabs defaultValue="battle" keepMounted={false}>
          <Tabs.List grow>
            <Tabs.Tab value="battle" leftSection={<IconSwords size={18} />}>Single Player</Tabs.Tab>
            <Tabs.Tab value="multiplayer" leftSection={<IconUsers size={18} />}>Multiplayer</Tabs.Tab>
            <Tabs.Tab value="leaderboard" leftSection={<IconTrophy size={18} />}>Leaderboard</Tabs.Tab>
          </Tabs.List>

          {/* === TAB 1: SINGLE PLAYER === */}
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
                    <Button 
                        color={isRecording ? 'red' : 'gray'} 
                        onClick={toggleMic}
                        leftSection={isRecording ? <IconMicrophoneOff/> : <IconMicrophone/>}
                    >
                        {isRecording ? 'Stop' : 'Record'}
                    </Button>
                    <Button onClick={handleBattle} loading={isLoading} rightSection={<IconSend size={16} />}>
                        Battle AI
                    </Button>
                </Group>
                <Text size="xs" ta="right" c="dimmed">{status}</Text>
              </Stack>
            </Card>

            <Group align="center" mb="sm" mt="xl">
                <Divider label="Battle History" labelPosition='center' style={{ flex: 1 }}/>
                {history.length > 0 && (
                    <Button
                        variant="subtle"
                        color="red"
                        size="compact-xs"
                        onClick={clearHistory}
                        leftSection={<IconTrash size={12}/>}>
                            Clear
                    </Button>
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
                    <Button size="xs" mt="xs" variant="subtle" onClick={() => playAudio(item.id, item.aiVerse, item.opponent)}>
                        Play Audio
                    </Button>
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

          {/* === TAB 2: MULTIPLAYER === */}
          <Tabs.Panel value="multiplayer" pt="md">
            
            {/* SCREEN: MENU */}
            {mode === 'menu' && (
                <Grid>
                    <Grid.Col span={6}>
                        <Card shadow="sm" padding="xl" radius="md" withBorder style={{height: '100%'}}>
                            <Stack align="center" justify="center" h={200}>
                                <IconSwords size={48} color="#228be6" />
                                <Title order={4}>Create Battle</Title>
                                <Text size="sm" ta="center" c="dimmed">Record a verse and get a code to share with a friend.</Text>
                                <Button fullWidth onClick={() => setMode('create')}>Start New Battle</Button>
                            </Stack>
                        </Card>
                    </Grid.Col>
                    <Grid.Col span={6}>
                        <Card shadow="sm" padding="xl" radius="md" withBorder style={{height: '100%'}}>
                            <Stack align="center" justify="center" h={200}>
                                <IconUsers size={48} color="#fa5252" />
                                <Title order={4}>Join Battle</Title>
                                <Text size="sm" ta="center" c="dimmed">Enter a code to fight a friend who challenged you.</Text>
                                <Button color="red" fullWidth onClick={() => setMode('join')}>Enter Code</Button>
                            </Stack>
                        </Card>
                    </Grid.Col>
                </Grid>
            )}

            {/* SCREEN: CREATE (P1 Records) */}
            {mode === 'create' && (
                <Card shadow="sm" padding="lg" withBorder>
                    <Group mb="md">
                        <ActionIcon variant="subtle" onClick={() => setMode('menu')}><IconArrowLeft/></ActionIcon>
                        <Title order={4}>Record Your Opening Verse</Title>
                    </Group>

                    {/* MODE TOGGLE */}
                    <Switch
                        size="lg"
                        offLabel={<IconMicrophone style={{ width:rem(16), height:rem(16) }}/>}
                        onLabel={<IconKeyboard style={{ width:rem(16), height:rem(16) }}/>}
                        checked={battleMode === 'text'}
                        onChange={(event) => setBattleMode(event.currentTarget.checked ? 'text' : 'audio')}
                        label={battleMode === 'text' ? 'Text Mode' : 'Audio Mode'}
                    />

                    <Textarea 
                        placeholder={battleMode === 'audio' ? 'Press Record to start rapping...' : 'Type your verse here...'} 
                        minRows={4} 
                        value={input} 
                        onChange={(e) => setInput(e.currentTarget.value)}
                        mb="md"
                        readOnly={battleMode === 'audio'}
                        variant={battleMode === 'audio' ? 'filled' : 'default'}
                    />
                    <Group justify="space-between">
                        {battleMode === 'audio' && (
                            <Button 
                            color={isRecording ? 'red' : 'gray'} 
                            onClick={toggleMic}
                            leftSection={isRecording ? <IconMicrophoneOff/> : <IconMicrophone/>}
                             >
                                {isRecording ? 'Stop' : 'Record'}
                        </Button>
                        )}
                        {battleMode === 'text' && <div />}

                        <Button onClick={startMultiplayer} loading={isLoading}>Create Challenge</Button>
                    </Group>
                </Card>
            )}

            {/* SCREEN: CREATE SUCCESS (P1 WAITS) */}
            {mode === 'create_success' && (
                <Card shadow="sm" padding="xl" withBorder>
                    <Stack align="center">
                        <IconTrophy size={64} color="gold" />
                        <Title order={3}>Battle Room Ready!</Title>
                        <Text>Share this code with your opponent:</Text>
                        
                        <Group>
                            <Badge size="xl" variant="filled" color="dark">{battleCode}</Badge>
                            <CopyButton value={battleCode}>
                                {({ copied, copy }) => (
                                    <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
                                        {copied ? 'Copied' : 'Copy Code'}
                                    </Button>
                                )}
                            </CopyButton>
                        </Group>
                        <Text c="dimmed" size="xs">Waiting for opponent to join...</Text>
                        <Button variant="subtle" onClick={() => { ws.current.close(); setMode('menu'); }}>Cancel</Button>
                    </Stack>
                </Card>
            )}

            {/* SCREEN: JOIN (P2 ENTERS CODE) */}
            {mode === 'join' && (
                <Card shadow="sm" padding="lg" withBorder>
                    <Group mb="md">
                        <ActionIcon variant="subtle" onClick={() => setMode('menu')}><IconArrowLeft/></ActionIcon>
                        <Title order={4}>Enter Battle Code</Title>
                    </Group>
                    <Group>
                        <Input 
                            placeholder="e.g. 1234abc" 
                            style={{flex: 1}} 
                            value={battleCode} 
                            onChange={(e) => setBattleCode(e.currentTarget.value)}
                        />
                        <Button onClick={joinMultiplayer} loading={isLoading} leftSection={<IconSearch size={16}/>}>
                            Join Battle
                        </Button>
                    </Group>
                </Card>
            )}

            {/* SCREEN: FIGHT (P2 REPLIES) */}
            {mode === 'fight' && p1Data && (
                 <Card shadow="sm" padding="lg" withBorder>
                    <Stack>
                        <Group justify="space-between">
                            <Title order={4}>Opponent: {p1Data.name}</Title>
                            <Badge color={battleMode === 'audio' ? 'pink' : 'gray'}>
                                {battleMode === 'audio' ? 'Audio Battle' : 'Text Battle'}
                            </Badge>
                        </Group>

                        {/* TIMER UI */}
                        {battleMode === 'audio' && (
                            <Card bg={timer < 10 ? 'red.1' : 'blue.1'} mb="md" radius="md">
                                <Group justify="space-between">
                                    <Text fw={700}>⏱️ TIME TO REPLY:</Text>
                                    <Title order={3} c={timer < 10 ? 'red' : 'blue'}>{timer}s</Title>
                                </Group>
                                <div style={{ 
                                    width: '100%', 
                                    height: '6px', 
                                    background: '#ddd', 
                                    marginTop: '10px', 
                                    borderRadius: '4px' 
                                }}>
                                    <div style={{
                                        width: `${(timer / 30) * 100}%`,
                                        height: '100%',
                                        background: timer < 10 ? 'red' : '#228be6',
                                        transition: 'width 1s linear',
                                        borderRadius: '4px'
                                    }}/>
                                </div>
                            </Card>
                        )}

                        <Card bg="gray.1" padding="md" radius="md">
                            <Text size="lg" style={{fontStyle: 'italic'}}>"{p1Data.verse}"</Text>
                        </Card>
                        
                        <Divider label="Your Turn" labelPosition="center" />
                        
                        <Textarea 
                            placeholder="Write your comeback..." 
                            minRows={4} 
                            value={input} 
                            onChange={(e) => setInput(e.currentTarget.value)}
                            readOnly={battleMode === 'audio'}
                            variant={battleMode === 'audio' ? 'filled' : 'default'}
                        />
                        
                         <Group justify="space-between">
                            {battleMode === 'audio' ? (
                                <Button 
                                    color={isRecording ? 'red' : 'gray'} 
                                    onClick={toggleMic}
                                    leftSection={isRecording ? <IconMicrophoneOff/> : <IconMicrophone/>}
                                >
                                    {isRecording ? 'Stop' : 'Record'}
                                </Button>
                            ) : <div/>}

                            <Button color="red" onClick={sendWsReply} loading={isLoading}>
                                Finish Him!
                            </Button>
                        </Group>
                    </Stack>
                 </Card>
            )}

            {/* SCREEN: JUDGING (SPINNER) */}
            {mode === 'judging' && (
                <Card h={300} withBorder>
                    <Center h="100%">
                        <Stack align="center">
                            <Loader size="xl" color="red" type="bars"/>
                            <Title order={3}>AI Judge is Deciding...</Title>
                            <Text c="dimmed">Analyzing rhymes, flow, and roasts</Text>
                        </Stack>
                    </Center>
                </Card>
            )}

            {/* SCREEN: RESULT (FINAL SCORE) */}
            { mode === 'result' && duelResult && (
                <Card shadow="sm" padding="xl" withBorder>
                    <Stack align="center">
                        <Title order={2}>Winner: {duelResult.winner}</Title>

                        <Grid style={{ width: '100%' }} gutter="lg">
                            <Grid.Col span={6}>
                                <Card bg="blue.1" padding="sm" radius="md">
                                    <Text size="xs" fw={700} c="dimmed">PLAYER 1</Text>
                                    <Text size="sm" style={{ fontStyle: 'italic' }}>"{duelResult.p1_verse}"</Text>
                                </Card>
                            </Grid.Col>
                            <Grid.Col span={6}>
                                <Card bg="red.1" padding="sm" radius="md">
                                    <Text size="xs" fw={700} c="dimmed">PLAYER 2</Text>
                                    <Text size="sm" style={{fontStyle: 'italic'}}>"{duelResult.p2_verse}"</Text>
                                </Card>
                            </Grid.Col>
                        </Grid>

                        <Group gap="xl" mt="md">
                            <Stack align="center">
                                <Text fw={700}>P1 Score</Text>
                                <Badge size="xl" color={duelResult.winnerCode === 'p1_win' ? 'green' : 'grey'}>
                                    {duelResult.scores.p1_score}
                                </Badge>
                            </Stack>
                            <Title order={3}>VS</Title>
                            <Stack align="center">
                                <Text fw={700}>P2 Score</Text>
                                <Badge size="xl" color={duelResult.winnerCode === 'p2_win' ? 'green' : 'gray'}>
                                    {duelResult.scores.p2_score}
                                </Badge>
                            </Stack>
                        </Group>

                        <Text c="dimmed" mt="md" ta="center">"{duelResult.scores.comment}"</Text>
                        <Button mt="lg" onClick={() => { setMode("menu"); setInput(''); }}>Back to Menu</Button>
                    </Stack>
                </Card>
            )}
          </Tabs.Panel>

          {/* === TAB 3: LEADERBOARD === */}
          <Tabs.Panel value="leaderboard" pt="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" mb="md">
                <Title order={3}>Hall of Fame</Title>

                {/* TOGGLE SWITCH */}
                <SegmentedControl
                    value={leaderboardType}
                    onChange={setLeaderboardType}
                    data={[
                        { label: 'Single Player', value:'single' },
                        { label: 'PVP Arena', value:'pvp' },
                    ]}
                />
              </Group>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Rank</Table.Th>
                    <Table.Th>Rapper</Table.Th>
                    <Table.Th>Wins</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {leaderboard.map((player, index) => (
                    <Table.Tr key={player.username}>
                      <Table.Td>#{index + 1}</Table.Td>
                      <Table.Td fw={700}>{player.username}</Table.Td>
                      <Table.Td>{player.wins}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}

// --- WRAPPER FOR MANTINE PROVIDER ---
export default function App() {
    return (
        <MantineProvider>
            <RapBattleApp />
        </MantineProvider>
    );
}