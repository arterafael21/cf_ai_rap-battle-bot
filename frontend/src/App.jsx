import { useState, useEffect, useRef } from 'react';
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
} from '@mantine/core';
import { IconMicrophone, IconMicrophoneOff, IconSend, IconTrash, IconPlayerPlay, IconTrophy, IconSwords } from '@tabler/icons-react';
import '@mantine/core/styles.css';

// --- MAIN APP COMPONENT ---
function RapBattleApp() {
	const [username, setUsername] = useState('');
	const [stats, setStats] = useState({ wins: 0, losses: 0, rank: 'Novice' });
	const [history, setHistory] = useState([]);
	const [input, setInput] = useState('');
	const [opponent, setOpponent] = useState('roboflow');
	const [status, setStatus] = useState('Ready');
	const [isRecording, setIsRecording] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [leaderboard, setLeaderboard] = useState([]);

	// Audio Cache
	const audioCache = useRef({});
	const mediaRecorder = useRef(null);
	const audioChunks = useRef([]);

	// 1. Initialize
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

	// 2. Fetch Stats
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

	// 3. History Management
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

	// 4. Battle Logic
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
		} catch (e) {
			alert(e.message);
			setStatus('Error');
		}
		setIsLoading(false);
	};

	// 5. Audio Logic
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

	return (
		<Container size="sm" py="xl">
			<Stack gap="lg">
				{/* HEADER */}
				<Tabs defaultValue="battle">
					<Tabs.List>
						<Tabs.Tab value="battle" leftSection={<IconSwords size={14} />}>
							Battle Arena
						</Tabs.Tab>
            <Tabs.Tab value="leaderboard" leftSection={<IconTrophy size={14} />}>
              Leaderboard
            </Tabs.Tab>
					</Tabs.List>

          <Tabs.Panel value="battle" pt="xs">
            <Group justify="space-between" align="center">
              <div>
                <Title order={2}>Rap Battle Bot</Title>
                <Text c="dimmed" size="sm">
                  Identity: {username}
                </Text>
              </div>
              <Badge size="lg" color="blue" variant="light">
                W: {stats.wins} | L: {stats.losses} | {stats.rank}
              </Badge>
				    </Group>

            {/* INPUT AREA */}
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Stack>
                <Text fw={500}>Choose Opponent:</Text>
                <Group>
                  <Button variant={opponent === 'roboflow' ? 'filled' : 'outline'} onClick={() => setOpponent('roboflow')} color="green">
                    RoboFlow (Easy)
                  </Button>
                  <Button variant={opponent === 'bytebeater' ? 'filled' : 'outline'} onClick={() => setOpponent('bytebeater')} color="red">
                    ByteBeater (Hard)
                  </Button>
                  <Button variant={opponent === 'ai-ce' ? 'filled' : 'outline'} onClick={() => setOpponent('ai-ce')} color="grape">
                    AI-CE (Funny)
                  </Button>
                </Group>

                <Textarea placeholder="Drop your bars here..." minRows={3} value={input} onChange={(e) => setInput(e.currentTarget.value)} />

                <Group justify="space-between">
                  <Group gap="xs">
                    <Button
                      color={isRecording ? 'red' : 'blue'}
                      variant={isRecording ? 'filled' : 'light'}
                      onClick={toggleMic}
                      leftSection={isRecording ? <IconMicrophoneOff size={16} /> : <IconMicrophone size={16} />}
                    >
                      {isRecording ? 'Stop' : 'Record'}
                    </Button>
                    <Text size="xs" c="dimmed">
                      {status}
                    </Text>
                  </Group>

                  <Button onClick={handleBattle} loading={isLoading} disabled={isRecording} rightSection={<IconSend size={14} />}>
                    Submit Verse
                  </Button>
                </Group>
              </Stack>
            </Card>

            {/* HISTORY LIST */}
            <Group justify="space-between">
              <Title order={3}>History</Title>
              <ActionIcon variant="subtle" color="gray" onClick={clearHistory}>
                <IconTrash size={16} />
              </ActionIcon>
            </Group>

            {history.map((item) => (
              <Card key={item.id} shadow="sm" padding="md" radius="md" withBorder mb="sm">
                {/* VERSES */}
                <Grid>
                  <Grid.Col span={6} style={{ borderRight: '1px solid #eee' }}>
                    <Text fw={700} size="sm" c="blue">
                      YOU
                    </Text>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {item.userRap}
                    </Text>
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Text fw={700} size="sm" c="pink">
                      {item.opponent?.toUpperCase()}
                    </Text>
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {item.aiVerse}
                    </Text>
                    <Button
                      size="xs"
                      mt="xs"
                      variant="light"
                      leftSection={<IconPlayerPlay size={12} />}
                      onClick={() => playAudio(item.id, item.aiVerse, item.opponent)}
                    >
                      Play Audio
                    </Button>
                  </Grid.Col>
                </Grid>

                {/* SCORES */}
                <Card.Section withBorder inheritPadding py="xs" mt="sm" bg="gray.0">
                  <Group justify="center" gap="xl">
                    <Text fw={700} c={item.result === 'win' ? 'green' : 'red'}>
                      {item.result === 'win' ? 'WINNER' : 'DEFEATED'}
                    </Text>
                    <Text size="xs">
                      Scores: You ({item.scores?.user?.total}) vs AI ({item.scores?.ai?.total})
                    </Text>
                  </Group>
                  <Text size="xs" ta="center" c="dimmed" mt={4}>
                    "{item.scores?.comment}"
                  </Text>
                </Card.Section>
              </Card>
            ))}
          </Tabs.Panel>

          <Tabs.Panel value="leaderboard" pt="xs">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title order={3} mb="md">Top 10 MCs</Title>
              <Table striped highlightOnHover>
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
