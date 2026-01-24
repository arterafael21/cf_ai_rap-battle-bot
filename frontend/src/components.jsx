import React from 'react';
import {
    Title, Card, Text, Textarea, Button, Group, Badge, Stack, Grid, ActionIcon, 
    Divider, FileButton, TextInput, Switch, Container
} from '@mantine/core';
import { 
    IconMicrophone, IconMicrophoneOff, IconSend, IconPlayerPlay, IconBulb, IconRefresh, IconUser, IconCamera, IconCheck, IconEdit, IconTrophy, IconChartBar, IconSwords, IconId
} from '@tabler/icons-react';
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { OPPONENTS } from '../../src/constants';

// --- SUB-COMPONENTS ---

export const AppHeader = ({ user, isLoaded, identity, stats }) => {
    const avatarUrl = user ? `/avatar/${user.id}?t=${Date.now()}` : null;

    return (
        <Stack align="center" gap="xl" mb={30} mt="lg">
            <Stack gap={0} align="center">
                <Title order={1} size={48} fw={900} variant="gradient" gradient={{ from: 'blue', to: 'cyan', deg: 90 }} style={{ letterSpacing: '-1px' }}>
                    RAP BATTLE BOT
                </Title>
                <Text c="dimmed" fw={500} size="lg">
                    {!isLoaded ? "Loading..." : (identity?.mc_name ? identity.mc_name : `MC ${user?.firstName || 'Guest'}`)}
                </Text>
            </Stack>
            <Group gap="md" p="xs" bg="gray.1" style={{ borderRadius: '50px', border: '1px solid #e9ecef', paddingRight: 6 }}>
                {!isLoaded ? null : (
                    <>
                        <SignedOut>
                            <SignInButton mode="modal">
                                <Button radius="xl" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>Sign In to Battle</Button>
                            </SignInButton>
                        </SignedOut>
                        <SignedIn>
                            {/* CUSTOM AVATAR DISPLAY */}
                            <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: '2px solid #228be6' }}>
                                <img 
                                    src={avatarUrl}
                                    onError={(e) => { e.target.onerror = null; e.target.src = user?.imageUrl; }}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    alt="User"
                                />
                            </div>

                            {/* RANK (TEXT) INSTEAD OF NUMBER */}
                            <Badge size="lg" variant="dot" color="blue" radius="sm" style={{ background: 'transparent', border: 'none' }}>
                                Rank: {stats.rank || "Novice"}
                            </Badge>
                            
                            <Divider orientation="vertical" />
                            
                            {/* SCORE SPLIT DISPLAY (Optional, keeps it clean) */}
                             <Text size="xs" fw={700} c="dimmed">Wins: {stats.wins || 0}</Text>
                        </SignedIn>
                    </>
                )}
            </Group>
        </Stack>
    );
};

export const WordDisplay = ({ word, onRefresh }) => (
    // ADDED: mx="auto" to center the card horizontally
    <Card bg="yellow.1" radius="md" p="xs" mb="md" withBorder style={{ borderColor: '#fcc419', width: 'fit-content' }} mx="auto">
        <Group justify="center" gap="xs">
            <IconBulb size={20} color="orange" />
            <Text fw={700} c="orange.9" size="sm">WORD OF THE ROUND:</Text>
            <Badge size="lg" color="orange" variant="filled">{word}</Badge>
            {/* Show refresh button only if onRefresh is provided */}
            {onRefresh && (
                <ActionIcon variant="transparent" color="orange" onClick={onRefresh} title="Get new word">
                    <IconRefresh size={16} />
                </ActionIcon>
            )}
        </Group>
    </Card>
);

export const OpponentSelector = ({ current, setOpponent }) => (
    <Stack gap={5}>
        <Text ta="center" size="xs" fw={700} c="dimmed" tt="uppercase">Select Your Opponent</Text>
        <Group justify="center" gap="sm">
            {Object.keys(OPPONENTS).map(key => (
                <Button 
                    key={key} 
                    radius="md" size="sm"
                    variant={current === key ? 'filled' : 'default'} 
                    onClick={() => setOpponent(key)}
                    color={current === key ? OPPONENTS[key].color : 'gray'}
                >
                    {OPPONENTS[key].name.toUpperCase()}
                </Button>
            ))}
        </Group>
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

export const HistoryItem = ({ item, playAudio }) => (
    <Card padding="lg" radius="md" withBorder mb="md">
        <Group align="center" justify="space-between" mb="sm">
            <Badge color={item.result === 'win' ? 'green' : 'red'} variant="light" size="sm">
                {item.result === 'win' ? 'VICTORY' : 'DEFEAT'}
            </Badge>
            <Text size="xs" c="dimmed">{new Date(item.timestamp || Date.now()).toLocaleDateString()}</Text>
        </Group>
        <Grid gutter="lg" align="stretch">
            <Grid.Col span={6}>
                <Text size="xs" fw={700} c="blue" mb={5}>YOU</Text>
                <Text size="sm" style={{ lineHeight: 1.6, whiteSpace: 'pre-line', fontStyle: 'italic', color: '#495057' }}>
                    "{item.userRap}"
                </Text>
            </Grid.Col>
            <Grid.Col span={6} style={{ borderLeft: '1px solid #f8f9fa' }} pl="lg">
                <Group justify="space-between" mb={5}>
                    <Text size="xs" fw={700} c="pink">{item.opponent?.toUpperCase()}</Text>
                    <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => playAudio(item.id, item.aiVerse, item.opponent)}>
                        <IconPlayerPlay size={14} />
                    </ActionIcon>
                </Group>
                <Text size="sm" style={{ whiteSpace: 'pre-line', lineHeight: 1.6, fontStyle: 'italic', color: '#495057' }}>
                    "{item.aiVerse}"
                </Text>
            </Grid.Col>
        </Grid>
    </Card>
);

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
                    {/* PROGRESS INDICATOR */}
                    <Group justify="center" gap="xs">
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ 
                                width: 10, height: 10, borderRadius: '50%', 
                                backgroundColor: i <= step ? '#228be6' : '#dee2e6' 
                            }} />
                        ))}
                    </Group>

                    {/* STEP 0: WELCOME */}
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

                    {/* STEP 1: NAME */}
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
                            <Button 
                                fullWidth size="md" 
                                onClick={nextStep} 
                                disabled={!name}
                            >
                                Next
                            </Button>
                        </Stack>
                    )}

                    {/* STEP 2: PHOTO */}
                    {step === 2 && (
                        <Stack align="center" gap="lg" py="lg">
                            <Title order={3}>Got a look?</Title>
                            <Text c="dimmed" ta="center" size="sm">
                                Upload a selfie so the AI can see who it's battling. 
                                (It might roast your outfit, be warned).
                            </Text>
                            
                            <FileButton onChange={handleFile} accept="image/png,image/jpeg">
                                {(props) => (
                                    <Button 
                                        {...props} 
                                        variant="outline" 
                                        size="xl" 
                                        h={120} 
                                        fullWidth
                                        style={{ borderStyle: 'dashed' }}
                                    >
                                        <Stack align="center" gap={5}>
                                            <IconCamera size={32} />
                                            <Text>{localFile ? localFile.name : "Upload Photo (Optional)"}</Text>
                                        </Stack>
                                    </Button>
                                )}
                            </FileButton>

                            <Button 
                                fullWidth 
                                size="md" 
                                onClick={onSubmit} 
                                loading={loading}
                                variant="gradient" 
                                gradient={{ from: 'orange', to: 'red' }}
                                leftSection={<IconCheck size={20} />}
                            >
                                Enter the Arena
                            </Button>
                        </Stack>
                    )}
                </Stack>
            </Card>
        </Container>
    );
};

export const ProfileView = ({ user, stats, identity, onUpdateProfile, uploading }) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [newName, setNewName] = React.useState(identity?.mc_name || '');
    const [newFile, setNewFile] = React.useState(null);
    const [preview, setPreview] = React.useState(null);
    const [imageTs, setImageTs] = React.useState(Date.now());

    // Force image refresh cache buster
    const avatarUrl = user ? `/avatar/${user.id}?t=${Date.now()}` : null;

    // Calculate Win Rate
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
            if (newFile) {
                setImageTs(Date.now());
            } else {
                setPreview(null);
            }
            setNewFile(null);
        } catch(e) {console.error("Error saving image:", e)}
    };

    const toggleEdit = () => {
        if (isEditing) {
            setPreview(null);
            setNewFile(null);
            setNewName(identity?.mc_name || '');
        }
        setIsEditing(!isEditing);
    }

    return (
        <Container size="sm">
            <Stack gap="lg">
                
                {/* 1. HEADER CARD (Avatar & Name) */}
                <Card padding="xl" radius="lg" withBorder shadow="sm">
                    <Group justify="space-between" align="start">
                        <Group>
                            <div style={{ position: 'relative' }}>
                                <img 
                                    src={preview || avatarUrl} 
                                    onError={(e) => { 
                                        if (!preview) { e.target.onerror = null; e.target.src = user.imageUrl; }
                                    }} 
                                    alt="Profile" 
                                    style={{ 
                                        width: 100, height: 100, borderRadius: '50%', 
                                        border: '4px solid #228be6', objectFit: 'cover' 
                                    }} 
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

                    {/* EDIT AREA (Shows up inside Header when editing) */}
                    {isEditing && (
                        <Card bg="gray.0" mt="md" radius="md" withBorder>
                            <Stack>
                                <TextInput label="Update MC Name" value={newName} onChange={(e) => setNewName(e.currentTarget.value)} />
                                <Group align="end">
                                    <FileButton onChange={handleFileChange} accept="image/png,image/jpeg">
                                        {(props) => (
                                            <Button {...props} variant="default" leftSection={<IconCamera size={16}/>}>
                                                {newFile ? "Change Photo" : "Upload New Photo"}
                                            </Button>
                                        )}
                                    </FileButton>
                                    {newFile && <Text size="sm" c="blue">{newFile.name}</Text>}
                                </Group>
                                <Button loading={uploading} onClick={handleSave}>Save Changes</Button>
                            </Stack>
                        </Card>
                    )}
                </Card>

                {/* 2. STATS GRID */}
                <Grid>
                    <Grid.Col span={4}>
                        <Card withBorder radius="md" padding="lg" ta="center">
                            <Text size="xs" tt="uppercase" fw={700} c="dimmed">Score</Text>
                            <Title order={2}>{stats.score || 0}</Title>
                            <IconTrophy size={24} color="gold" style={{ marginTop: 8 }} />
                        </Card>
                    </Grid.Col>
                    <Grid.Col span={4}>
                        <Card withBorder radius="md" padding="lg" ta="center">
                            <Text size="xs" tt="uppercase" fw={700} c="dimmed">Win Rate</Text>
                            <Title order={2}>{winRate}%</Title>
                            <IconChartBar size={24} color="blue" style={{ marginTop: 8 }} />
                        </Card>
                    </Grid.Col>
                    <Grid.Col span={4}>
                        <Card withBorder radius="md" padding="lg" ta="center">
                            <Text size="xs" tt="uppercase" fw={700} c="dimmed">Battles</Text>
                            <Title order={2}>{totalBattles}</Title>
                            <IconSwords size={24} color="red" style={{ marginTop: 8 }} />
                        </Card>
                    </Grid.Col>
                </Grid>

                {/* 3. AI ANALYSIS */}
                <Card withBorder radius="lg" padding="lg">
                    <Group mb="sm">
                        <IconId color="gray" />
                        <Title order={4}>AI Persona Analysis</Title>
                    </Group>
                    <Card bg="gray.1" radius="md" p="md">
                        <Text size="sm" style={{ fontStyle: 'italic' }}>
                            {(!identity?.roast_context || identity.roast_context === 'No photo provided') 
                                ? "No photo uploaded. The AI doesn't know what you look like (and will roast you for it)." 
                                : `"${identity.roast_context}"`
                            }
                        </Text>
                    </Card>
                </Card>

            </Stack>
        </Container>
    );
};