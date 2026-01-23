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
  Center
} from '@mantine/core';
import { 
    IconMicrophone, IconMicrophoneOff, IconSend, IconTrash, 
    IconPlayerPlay, IconTrophy, IconSwords, IconUsers, IconSearch, IconArrowLeft 
} from '@tabler/icons-react';
import '@mantine/core/styles.css'

// --- MAIN APP COMPONENT ---
function RapBattleApp() {
  // --- GLOBAL STATE ---
	const [username, setUsername] = useState('');
	const [stats, setStats] = useState({ wins: 0, losses: 0, rank: 'Novice' });
  const [leaderboard, setLeaderboard] = useState([]);

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
  const [duelResult, setDuelResult] = useState(null); // final score


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

	const fetchLeaderboard = async () => {
		try {
			const res = await fetch('/leaderboard');
			const data = await res.json();
			setLeaderboard(data);
		} catch (e) {
			console.error(e);
		}
	};

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

  // MULTIPLAYER LOGIC
  const createChallenge = async () => {
    if (!input) return alert("Write a verse to start a battle!");
    setIsLoading(true);
    try {
      const res = await fetch('/challenge/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, verse: input })
      });
      const data = await res.json();
      setBattleCode(data.battleId);
      setMode('create_success');
      setInput('');
    } catch (e) {
      alert("Failed to create");
    }
  };

  const loadChallenge = async () => {
    if (!battleCode) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/challenge/${battleCode}`);
      if (!res.ok) throw new Error('Battle not found');
      const data = await res.json();
      setP1Data(data.p1);
      setMode('fight');
    } catch (e) {
      alert("Invalid code");
    }
  };

  const submitReply = async () => {
    if (!input) return alert("You need to rap back!");
    setIsLoading(true);
    setStatus("Judging"); 
    try {
        const res = await fetch(`/challenge/${battleCode}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, verse: input })
        });
        const data = await res.json();
        setDuelResult(data);
        setMode('result');
        setInput('');
    } catch (e) {
        alert("Error submitting reply");
    }
    setIsLoading(false);
    setStatus('Ready');
	};

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

            <Divider my="lg" label="Battle History" labelPosition="center" />

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

            {/* SCREEN: CREATE */}
            {mode === 'create' && (
                <Card shadow="sm" padding="lg" withBorder>
                    <Group mb="md">
                        <ActionIcon variant="subtle" onClick={() => setMode('menu')}><IconArrowLeft/></ActionIcon>
                        <Title order={4}>Record Your Opening Verse</Title>
                    </Group>
                    <Textarea 
                        placeholder="Lay down the first verse..." 
                        minRows={4} 
                        value={input} 
                        onChange={(e) => setInput(e.currentTarget.value)}
                        mb="md"
                    />
                    <Group justify="space-between">
                         <Button 
                            color={isRecording ? 'red' : 'gray'} 
                            onClick={toggleMic}
                            leftSection={isRecording ? <IconMicrophoneOff/> : <IconMicrophone/>}
                        >
                            {isRecording ? 'Stop' : 'Record'}
                        </Button>
                        <Button onClick={createChallenge} loading={isLoading}>Create Challenge</Button>
                    </Group>
                </Card>
            )}

            {/* SCREEN: CREATE SUCCESS */}
            {mode === 'create_success' && (
                <Card shadow="sm" padding="xl" withBorder>
                    <Stack align="center">
                        <IconTrophy size={64} color="gold" />
                        <Title order={3}>Challenge Created!</Title>
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
                        <Button variant="subtle" onClick={() => setMode('menu')}>Back to Menu</Button>
                    </Stack>
                </Card>
            )}

            {/* SCREEN: JOIN */}
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
                        <Button onClick={loadChallenge} loading={isLoading} leftSection={<IconSearch size={16}/>}>
                            Find Battle
                        </Button>
                    </Group>
                </Card>
            )}

            {/* SCREEN: FIGHT (REPLYING) */}
            {mode === 'fight' && p1Data && (
                 <Card shadow="sm" padding="lg" withBorder>
                    <Stack>
                        <Title order={4}>Opponent: {p1Data.name}</Title>
                        <Card bg="gray.1" padding="md" radius="md">
                            <Text size="lg" style={{fontStyle: 'italic'}}>"{p1Data.verse}"</Text>
                        </Card>
                        
                        <Divider label="Your Turn" labelPosition="center" />
                        
                        <Textarea 
                            placeholder="Write your comeback..." 
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
                            <Button color="red" onClick={submitReply} loading={isLoading}>
                                Finish Him!
                            </Button>
                        </Group>
                    </Stack>
                 </Card>
            )}

            {/* SCREEN: RESULT */}
            {mode === 'result' && duelResult && (
                 <Card shadow="sm" padding="xl" withBorder>
                    <Stack align="center">
                        <Title order={2}>WINNER: {duelResult.winner === 'p1_win' ? p1Data.name : username}</Title>
                        
                        <Group gap="xl" mt="md">
                            <Stack align="center">
                                <Text fw={700}>{p1Data.name}</Text>
                                <Badge size="xl" color={duelResult.winner === 'p1_win' ? 'green' : 'red'}>
                                    {duelResult.scores.p1_score}
                                </Badge>
                            </Stack>
                            <Title order={3}>VS</Title>
                            <Stack align="center">
                                <Text fw={700}>{username}</Text>
                                <Badge size="xl" color={duelResult.winner === 'p2_win' ? 'green' : 'red'}>
                                    {duelResult.scores.p2_score}
                                </Badge>
                            </Stack>
                        </Group>

                        <Text c="dimmed" mt="md">"{duelResult.scores.comment}"</Text>
                        <Button mt="lg" onClick={() => { setMode('menu'); setInput(''); }}>Back to Menu</Button>
                    </Stack>
                 </Card>
            )}

          </Tabs.Panel>

          {/* === TAB 3: LEADERBOARD === */}
          <Tabs.Panel value="leaderboard" pt="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" mb="md">
                <Title order={3}>Top 10 MCs</Title>
                <Button variant="light" size="xs" onClick={fetchLeaderboard}>Refresh</Button>
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
