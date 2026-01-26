import React from 'react';
import {
    Title, Card, Text, Textarea, Button, Group, Badge, Stack, Grid, ActionIcon, 
    Divider, FileButton, TextInput, Switch, Container, Menu, Avatar, SimpleGrid
} from '@mantine/core';
import { 
    IconMicrophone, IconMicrophoneOff, IconSend, IconPlayerPlay, IconBulb, IconRefresh, 
    IconUser, IconCamera, IconCheck, IconEdit, IconTrophy, IconChartBar, IconSwords, 
    IconId, IconLogout, IconFlame, IconUsers, IconMusic, IconClock, IconAlignLeft, IconKeyboard
} from '@tabler/icons-react';
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { OPPONENTS } from '../../src/constants';

// --- SUB-COMPONENTS ---

// components.js

// --- 1. UPDATED APP HEADER (Works for Guests) ---
export const AppHeader = ({ user, isLoaded, identity, stats, avatarTs, onLogout }) => {
    // Determine Avatar URL
    const avatarUrl = user?.id?.startsWith('guest_') 
        ? null // No avatar for guests
        : `/avatar/${user?.id}?t=${avatarTs}`;

    // Get initials for fallback
    const initials = user?.firstName ? user.firstName[0].toUpperCase() : '?';

    // Show nothing if Clerk isn't loaded yet
    if (!isLoaded) return null;

    return (
        <Stack align="center" gap="xl" mb={30} mt="lg">
            <Group gap="md" p={6} bg="gray.0" style={{ borderRadius: '50px', border: '1px solid #e9ecef', paddingRight: 12 }}>
                
                {/* MENU & AVATAR */}
                <Menu shadow="md" width={200} position="bottom-end">
                    <Menu.Target>
                        <Avatar 
                            src={avatarUrl} 
                            alt={user?.firstName} 
                            size={40} 
                            radius="xl"
                            color={user?.isGuest ? 'orange' : 'blue'}
                            style={{ cursor: 'pointer', border: '2px solid #228be6' }}
                        >
                            {initials}
                        </Avatar>
                    </Menu.Target>

                    <Menu.Dropdown>
                        <Menu.Label>My Account</Menu.Label>
                        <Menu.Item leftSection={<IconUser size={14} />}>
                            {identity?.mc_name || user?.firstName || "MC Unknown"}
                        </Menu.Item>
                        <Divider />
                        <Menu.Item 
                            color="red" 
                            leftSection={<IconLogout size={14} />}
                            onClick={onLogout}
                        >
                            {user?.isGuest ? "Exit Guest Mode" : "Log Out"}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>

                {/* STATS BADGE */}
                <Badge size="lg" variant="dot" color={user?.isGuest ? 'gray' : 'blue'} radius="sm" style={{ background: 'transparent', border: 'none' }}>
                    Rank: {stats.rank || "Novice"}
                </Badge>
                
                <Divider orientation="vertical" />
                
                <Text size="xs" fw={700} c="dimmed">
                    {stats.score !== undefined ? `${stats.score} PTS` : '0 PTS'}
                </Text>

            </Group>
        </Stack>
    );
};

export const WordDisplay = ({ word, onRefresh }) => (
    <Card bg="yellow.1" radius="md" p="xs" mb="md" withBorder style={{ borderColor: '#fcc419', width: 'fit-content' }} mx="auto">
        <Group justify="center" gap="xs">
            <IconBulb size={20} color="orange" />
            <Text fw={700} c="orange.9" size="sm">WORD OF THE ROUND:</Text>
            <Badge size="lg" color="orange" variant="filled">{word}</Badge>
            {onRefresh && (
                <ActionIcon variant="transparent" color="orange" onClick={onRefresh} title="Get new word">
                    <IconRefresh size={16} />
                </ActionIcon>
            )}
        </Group>
    </Card>
);

export const OpponentSelector = ({ current, setOpponent }) => (
    <Stack gap="xs">
        <Text ta="center" size="xs" fw={700} c="dimmed" tt="uppercase">
            Select Opponent
        </Text>
        
        {/* Responsive Grid: 1 column on mobile, 3 on desktop */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {Object.keys(OPPONENTS)
                .filter(key => key !== 'pvp')
                .map(key => {
                    const bot = OPPONENTS[key];
                    const isSelected = current === key;
                    
                    return (
                        <Card 
                            key={key}
                            padding="sm" 
                            radius="md" 
                            withBorder={!isSelected}
                            bg={isSelected ? `${bot.color}.1` : 'white'}
                            style={{ 
                                cursor: 'pointer', 
                                borderColor: isSelected ? 'var(--mantine-color-blue-filled)' : undefined,
                                transition: 'all 0.2s ease'
                            }}
                            onClick={() => setOpponent(key)}
                        >
                            <Group justify="space-between" wrap="nowrap">
                                <Group gap="xs" wrap="nowrap">
                                    {/* Bot Avatar/Icon placeholder */}
                                    <Avatar size="sm" color={bot.color} radius="xl">
                                        {bot.name[0]}
                                    </Avatar>
                                    <Stack gap={0}>
                                        <Text size="sm" fw={700} tt="uppercase">
                                            {bot.name}
                                        </Text>
                                        <Text size="xs" c="dimmed" lh={1}>
                                            {bot.level}
                                        </Text>
                                    </Stack>
                                </Group>
                                
                                {isSelected && (
                                    <IconCheck size={18} color="var(--mantine-color-blue-filled)" />
                                )}
                            </Group>
                        </Card>
                    );
            })}
        </SimpleGrid>
    </Stack>
);

export const BattleInputArea = ({ input, setInput, isRecording, toggleMic, handleSend, isLoading, status, placeholder, readOnly }) => (
    <>
        <Textarea 
            placeholder={placeholder} 
            minRows={5} radius="md" size="md"
            value={input} 
            onChange={(e) => setInput(e.currentTarget.value)}
            readOnly={readOnly}
            styles={{ input: { fontSize: '16px', backgroundColor: '#f8f9fa' } }}
            onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key ==='Enter') {
                    e.preventDefault();
                    if (!isLoading) handleSend();
                }
            }} 
        />
        <Group justify="space-between" align="center" mt="md">
            <Button 
                size="md" color={isRecording ? 'red' : 'gray'} variant="light" radius="md"
                onClick={toggleMic} 
                leftSection={isRecording ? <IconMicrophoneOff size={18}/> : <IconMicrophone size={18}/>}
            >
                {isRecording ? 'Stop' : 'Record'}
            </Button>
            <Button 
                size="md" radius="md" onClick={handleSend} loading={isLoading} 
                variant="gradient" gradient={{ from: 'blue', to: 'indigo' }}
                rightSection={<IconSend size={18} />}
            >
                Spit Fire
            </Button>
        </Group>
        <Text size="xs" ta="center" c="dimmed" mt={5}>{status}</Text>
    </>
);

export const VerseDisplay = ({ 
    p1Verse, 
    p2Verse, 
    p1Title = "YOUR VERSE", 
    p2Title = "OPPONENT", 
    onPlayAudio,
    playDisabled,
    isReady
}) => (
    <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="xs" h="100%">
                <Text size="xs" fw={700} c="dimmed">{p1Title}</Text>
                <Card bg="blue.0" radius="md" p="sm" withBorder style={{ borderColor: '#d0ebff', flex: 1 }}>
                    <Text size="sm" style={{ whiteSpace: 'pre-line', fontStyle: 'italic', color: '#333' }}>
                        "{p1Verse}"
                    </Text>
                </Card>
            </Stack>
        </Grid.Col>
        
        <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="xs" h="100%">
                <Text size="xs" fw={700} c="dimmed">{p2Title}</Text>
                <Card bg="red.0" radius="md" p="sm" withBorder style={{ borderColor: '#ffc9c9', flex: 1 }}>
                    <Text size="sm" style={{ whiteSpace: 'pre-line', fontStyle: 'italic', color: '#333' }}>
                        "{p2Verse}"
                    </Text>
                </Card>
                {onPlayAudio && isReady && (
                    <Button 
                        variant="subtle" 
                        size="xs" 
                        leftSection={<IconMusic size={14}/>} 
                        onClick={onPlayAudio}
                        loading={playDisabled}
                        disabled={playDisabled}
                    >
                        {playDisabled ? "Speaking..." : "Listen to Bars"}
                    </Button>
                )}
            </Stack>
        </Grid.Col>
    </Grid>
);

export const HistoryItem = ({ item, playAudio, identity }) => {
    // --- 1. DATA SANITIZATION (The Fix) ---
    let opponentName = "Opponent";

    if (item.p2_name && item.p2_name !== "AI") {
        opponentName = item.p2_name;
    } 
    else if (item.opponent && typeof item.opponent === 'object') {
        opponentName = item.opponent.name || "Unknown";
    } 
    else if (typeof item.opponent === 'string') {
        opponentName = item.opponent;
    }

    const displayOpponent = opponentName.toUpperCase();

    // --- 2. LOGIC ---
    const isWin = item.result === 'win' || item.winner === identity?.mc_name || item.winnerCode === 'p1_win';
    const myScore = item.scores?.user?.total || item.scores?.p1?.total || 0;
    const oppScore = item.scores?.ai?.total || item.scores?.p2?.total || 0;
    const displayPoints = item.myPoints !== undefined ? item.myPoints : (isWin ? 20 : 0);

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder mb="lg">
            <Group justify="space-between" mb="md">
                <Stack gap={0}>
                    <Text fw={700} size="lg">{opponentName}</Text>
                    <Text size="xs" c="dimmed">
                        {new Date(item.timestamp || Date.now()).toLocaleDateString()}
                    </Text>
                </Stack>
                
                <Group gap="xs">
                    {(myScore > 0 || oppScore > 0) && (
                        <Badge variant="outline" color="gray" size="lg">
                            {myScore} - {oppScore}
                        </Badge>
                    )}

                    {isWin ? (
                        <Badge color="yellow" variant="filled" size="lg">+{displayPoints} pts</Badge>
                    ) : (
                        <Badge color="red" variant="light">Loss</Badge>
                    )}
                </Group>
            </Group>

            <VerseDisplay 
                p1Verse={item.userRap || item.p1_verse}
                p2Verse={item.aiVerse || item.p2_verse}
                p1Title="YOU"
                p2Title={displayOpponent} 
                onPlayAudio={() => playAudio(item.id, item.aiVerse || item.p2_verse, opponentName)}
            />
        </Card>
    );
};

export const OnboardingFlow = ({ name, setName, setFile, onSubmit, loading }) => {
    const [step, setStep] = React.useState(0);
    const [localFile, setLocalFile] = React.useState(null);

    const handleFile = (file) => {
        setLocalFile(file);
        setFile(file);
    };

    const nextStep = () => setStep(s => s + 1);

    return (
        <Container size="xs" py="xl" style={{ height: '100vh', display: 'flex', alignItems: 'center' }}>
            <Card shadow="xl" padding="xl" radius="lg" withBorder style={{ width: '100%' }}>
                <Stack gap="xl">
                    <Group justify="center" gap="xs">
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ 
                                width: 10, height: 10, borderRadius: '50%', 
                                backgroundColor: i <= step ? '#228be6' : '#dee2e6' 
                            }} />
                        ))}
                    </Group>

                    {step === 0 && (
                        <Stack align="center" gap="lg" py="lg">
                            <IconMicrophone size={64} color="#228be6" />
                            <Title order={2} ta="center">Welcome!</Title>
                            <Text c="dimmed" ta="center">
                                Before you step into the arena, we need to know who you are. 
                                The judges are waiting.
                            </Text>
                            <Button fullWidth size="md" onClick={nextStep} variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
                                Let's Go
                            </Button>
                        </Stack>
                    )}

                    {step === 1 && (
                        <Stack align="center" gap="lg" py="lg">
                            <Title order={3}>What's your MC Name?</Title>
                            <TextInput 
                                placeholder="e.g. Lil Cloud" 
                                size="lg" 
                                style={{ width: '100%' }}
                                value={name}
                                onChange={(e) => setName(e.currentTarget.value)}
                                leftSection={<IconUser size={18} />}
                            />
                            <Button fullWidth size="md" onClick={nextStep} disabled={!name}>
                                Next
                            </Button>
                        </Stack>
                    )}

                    {step === 2 && (
                        <Stack align="center" gap="lg" py="lg">
                            <Title order={3}>Got a look?</Title>
                            <Text c="dimmed" ta="center" size="sm">
                                Upload a selfie so the AI can see who it's battling. 
                                (It might roast your outfit, be warned).
                            </Text>
                            
                            <FileButton onChange={handleFile} accept="image/png,image/jpeg">
                                {(props) => (
                                    <Button {...props} variant="outline" size="xl" h={120} fullWidth style={{ borderStyle: 'dashed' }}>
                                        <Stack align="center" gap={5}>
                                            <IconCamera size={32} />
                                            <Text>{localFile ? localFile.name : "Upload Photo (Optional)"}</Text>
                                        </Stack>
                                    </Button>
                                )}
                            </FileButton>

                            <Button fullWidth size="md" onClick={onSubmit} loading={loading} variant="gradient" gradient={{ from: 'orange', to: 'red' }} leftSection={<IconCheck size={20} />}>
                                Enter the Arena
                            </Button>
                        </Stack>
                    )}
                </Stack>
            </Card>
        </Container>
    );
};

export const ProfileView = ({ user, stats, identity, onUpdateProfile, uploading, avatarTs }) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [newName, setNewName] = React.useState(identity?.mc_name || '');
    const [newFile, setNewFile] = React.useState(null);
    const [preview, setPreview] = React.useState(null);

    const avatarUrl = user ? `/avatar/${user.id}?t=${avatarTs}` : null;
    const totalBattles = (stats.wins || 0) + (stats.losses || 0);
    const winRate = totalBattles > 0 ? Math.round((stats.wins / totalBattles) * 100) : 0;

    const handleFileChange = (file) => {
        setNewFile(file);
        if (file) {
            setPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        try {
            await onUpdateProfile(newName, newFile);
            setIsEditing(false);
            if (!newFile) setPreview(null);
            setNewFile(null);
        } catch(e) {}
    };

    const toggleEdit = () => {
        if (isEditing) {
            setPreview(null);
            setNewFile(null);
        }
        setIsEditing(!isEditing);
    }

    return (
        <Container size="sm">
            <Stack gap="lg">
                <Card padding="xl" radius="lg" withBorder shadow="sm">
                    <Group justify="space-between" align="start">
                        <Group>
                            <div style={{ position: 'relative' }}>
                                <img 
                                    key={avatarTs}
                                    src={preview || avatarUrl} 
                                    onError={(e) => { 
                                        if (!preview && user?.imageUrl) { e.target.onerror = null; e.target.src = user.imageUrl; }
                                    }} 
                                    alt="Profile" 
                                    style={{ width: 100, height: 100, borderRadius: '50%', border: '4px solid #228be6', objectFit: 'cover' }} 
                                />
                                <Badge circle size="lg" color="blue" style={{ position: 'absolute', bottom: 10, right: 3 }}>
                                    {stats.rank?.charAt(0) || 'N'}
                                </Badge>
                            </div>
                            <Stack gap={0}>
                                <Title order={2}>{identity?.mc_name || "Unknown MC"}</Title>
                                <Text c="dimmed">Rank: {stats.rank || "Novice"}</Text>
                                <Text size="xs" c="dimmed">Joined: {new Date(user.createdAt).toLocaleDateString()}</Text>
                            </Stack>
                        </Group>
                        <Button variant="light" leftSection={<IconEdit size={16} />} onClick={toggleEdit}>
                            {isEditing ? "Cancel" : "Edit Profile"}
                        </Button>
                    </Group>
                    {isEditing && (
                        <Card bg="gray.0" mt="md" radius="md" withBorder>
                            <Stack>
                                <TextInput label="Update MC Name" value={newName} onChange={(e) => setNewName(e.currentTarget.value)} />
                                <Group align="end">
                                    <FileButton onChange={handleFileChange} accept="image/png,image/jpeg">
                                        {(props) => <Button {...props} variant="default" leftSection={<IconCamera size={16}/>}>{newFile ? "Change Photo" : "Upload New Photo"}</Button>}
                                    </FileButton>
                                    {newFile && <Text size="sm" c="blue">{newFile.name}</Text>}
                                </Group>
                                <Button loading={uploading} onClick={handleSave}>Save Changes</Button>
                            </Stack>
                        </Card>
                    )}
                </Card>
                <Grid>
                    <Grid.Col span={{ base: 12, md: 4 }}><Card withBorder radius="md" padding="lg" ta="center"><Text size="xs" tt="uppercase" fw={700} c="dimmed">Points</Text><Title order={2}>{stats.score || 0}</Title><IconTrophy size={24} color="gold" style={{ marginTop: 8 }} /></Card></Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}><Card withBorder radius="md" padding="lg" ta="center"><Text size="xs" tt="uppercase" fw={700} c="dimmed">Win Rate</Text><Title order={2}>{winRate}%</Title><IconChartBar size={24} color="blue" style={{ marginTop: 8 }} /></Card></Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}><Card withBorder radius="md" padding="lg" ta="center"><Text size="xs" tt="uppercase" fw={700} c="dimmed">Battles</Text><Title order={2}>{totalBattles}</Title><IconSwords size={24} color="red" style={{ marginTop: 8 }} /></Card></Grid.Col>
                </Grid>
                <Card withBorder radius="lg" padding="lg">
                    <Group mb="sm"><IconId color="gray" /><Title order={4}>AI Persona Analysis</Title></Group>
                    <Card bg="gray.1" radius="md" p="md"><Text size="sm" style={{ fontStyle: 'italic' }}>{(!identity?.roast_context || identity.roast_context === 'No photo provided') ? "No photo uploaded. The AI doesn't know what you look like." : `"${identity.roast_context}"`}</Text></Card>
                </Card>
            </Stack>
        </Container>
    );
};

// --- SPLASH PAGE ---
export const SplashPage = ({ onGuestLogin }) => (
    <Container size="xs" h="100vh" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Card shadow="xl" padding="xl" radius="lg" withBorder style={{ overflow: 'visible' }}>
            {/* DECORATIVE ICON */}
            <div style={{ 
                position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
                background: 'linear-gradient(45deg, #228be6, #15aabf)', padding: 20, borderRadius: '50%',
                boxShadow: '0 10px 20px rgba(0,0,0,0.1)'
            }}>
                <IconSwords size={48} color="white" />
            </div>

            <Stack align="center" mt="xl" gap="lg">
                <Title order={1} size={48} fw={900} ta="center" variant="gradient" gradient={{ from: 'blue', to: 'cyan', deg: 90 }} style={{ letterSpacing: '-2px', lineHeight: 1.1 }}>
                    RAP BATTLE<br />BOT
                </Title>
                
                <Text c="dimmed" ta="center" size="lg" style={{ maxWidth: 400 }}>
                    Step into the arena against AI opponents or challenge your friends in real-time lyrical warfare.
                </Text>

                <Group mt="lg">
                    <SignInButton mode="modal">
                        <Button 
                            size="xl" 
                            radius="xl" 
                            variant="gradient" 
                            gradient={{ from: 'blue', to: 'cyan' }}
                            rightSection={<IconFlame size={20} />}
                        >
                            Sign In
                        </Button>
                    </SignInButton>
                    
                    <Button 
                        size="xl" 
                        radius="xl" 
                        variant="outline" 
                        color="gray"
                        onClick={onGuestLogin}
                    >
                        Guest Mode
                    </Button>
                </Group>
                
                <Divider my="sm" label="Features" labelPosition="center" style={{ width: '100%' }} />
                
                {/* --- FIX IS HERE --- */}
                {/* gap: xs on mobile, xl on desktop. wrap="nowrap" prevents stacking. */}
                <Group gap={{ base: 'xs', sm: 'xl' }} justify="center" c="dimmed" wrap="nowrap" style={{ width: '100%' }}>
                    <Group gap={4} wrap="nowrap">
                        <IconMicrophone size={16} />
                        <Text size="sm" visibleFrom="xs">Voice Input</Text>
                        {/* Short text for very small screens */}
                        <Text size="sm" hiddenFrom="xs">Voice</Text>
                    </Group>
                    
                    <Group gap={4} wrap="nowrap">
                        <IconTrophy size={16} />
                        <Text size="sm" visibleFrom="xs">Global Ranks</Text>
                        <Text size="sm" hiddenFrom="xs">Ranks</Text>
                    </Group>
                    
                    <Group gap={4} wrap="nowrap">
                        <IconUsers size={16} />
                        <Text size="sm" visibleFrom="xs">Multiplayer</Text>
                        <Text size="sm" hiddenFrom="xs">Multi</Text>
                    </Group>
                </Group>
                
            </Stack>
        </Card>
    </Container>
);

export const PreBattleCard = ({ user, identity, opponent, config, avatarTs }) => {
    const [count, setCount] = React.useState(5);

    React.useEffect(() => {
        const timer = setInterval(() => {
            setCount((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const myAvatar = `/avatar/${user.id}?t=${avatarTs}`;
    const oppAvatar = opponent?.id ? `/avatar/${opponent.id}` : null;
    const myName = identity?.mc_name || user?.firstName || "You";
    const oppName = opponent?.name || opponent?.username || "Opponent";

    return (
        <Card shadow="xl" padding="lg" radius="lg" withBorder>
            <Stack align="center" gap="md">
                
                {/* 1. COMPACT HEADER */}
                <Stack align="center" gap={0}>
                    <Badge size="lg" variant="filled" color="red" className="pulsing-badge">STARTING IN</Badge>
                    <Title order={1} style={{ fontSize: 48, lineHeight: 1 }}>{count}</Title>
                </Stack>

                {/* 2. PLAYERS SIDE-BY-SIDE (Even on Mobile) */}
                <Group justify="space-between" align="start" w="100%" wrap="nowrap">
                    
                    {/* PLAYER 1 */}
                    <Stack align="center" gap={5} w="40%">
                        <div style={{ position: 'relative' }}>
                            {/* Responsive Avatar Size: 80px on mobile, 120px on desktop */}
                            <Avatar src={myAvatar} size={80} radius={80} style={{ border: '3px solid #228be6' }} />
                            <Badge circle size="md" color="blue" style={{ position: 'absolute', bottom: 0, right: 0 }}>P1</Badge>
                        </div>
                        <Text fw={700} size="sm" lineClamp={1} ta="center">{myName}</Text>
                        <Badge variant="light" size="xs">READY</Badge>
                    </Stack>

                    {/* VS (Centered & Smaller) */}
                    <Stack justify="center" h={80}>
                        <Text fw={900} size="xl" c="dimmed" style={{ fontStyle: 'italic' }}>VS</Text>
                    </Stack>

                    {/* PLAYER 2 */}
                    <Stack align="center" gap={5} w="40%">
                        <div style={{ position: 'relative' }}>
                            <Avatar src={oppAvatar} size={80} radius={80} style={{ border: '3px solid #fa5252' }}>?</Avatar>
                            <Badge circle size="md" color="red" style={{ position: 'absolute', bottom: 0, right: 0 }}>P2</Badge>
                        </div>
                        <Text fw={700} size="sm" lineClamp={1} ta="center">{oppName}</Text>
                        <Badge variant="light" color="red" size="xs">READY</Badge>
                    </Stack>

                </Group>

                <Divider style={{ width: '100%' }} />

                {/* 3. COMPACT SETTINGS ROW */}
                <Group gap="xs" justify="center">
                    <Badge variant="outline" color="gray" leftSection={<IconClock size={12}/>}>{config.turnTime}s</Badge>
                    <Badge variant="outline" color="gray" leftSection={<IconAlignLeft size={12}/>}>{config.rounds} Rnds</Badge>
                    <Badge variant="outline" color="gray" leftSection={config.battleMode === 'audio' ? <IconMicrophone size={12}/> : <IconKeyboard size={12}/>}>
                        {config.battleMode}
                    </Badge>
                </Group>

                {config.mandatoryWord && (
                    <Text size="xs" c="orange.9" fw={700}>
                        Word: "{config.mandatoryWord}"
                    </Text>
                )}
            </Stack>
        </Card>
    );
};