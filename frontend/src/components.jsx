import React from 'react';
import {
    Title, Card, Text, Textarea, Button, Group, Badge, Stack, Grid, ActionIcon, 
    Divider, FileButton, TextInput, Switch
} from '@mantine/core';
import { 
    IconMicrophone, IconMicrophoneOff, IconSend, IconPlayerPlay, IconBulb, IconRefresh
} from '@tabler/icons-react';
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { OPPONENTS } from '../../src/constants';

// --- SUB-COMPONENTS ---

export const AppHeader = ({ user, isLoaded, identity, stats }) => (
    <Stack align="center" gap="xl" mb={50} mt="lg">
        <Stack gap={0} align="center">
            <Title order={1} size={48} fw={900} variant="gradient" gradient={{ from: 'blue', to: 'cyan', deg: 90 }} style={{ letterSpacing: '-1px' }}>
                RAP BATTLE BOT
            </Title>
            <Text c="dimmed" fw={500} size="lg">
                {!isLoaded ? "Loading..." : (identity?.mc_name ? identity.mc_name : `MC ${user?.firstName || 'Guest'}`)}
            </Text>
        </Stack>
        <Group gap="md" p="xs" bg="gray.1" style={{ borderRadius: '50px', border: '1px solid #e9ecef' }}>
            {!isLoaded ? null : (
                <>
                    <SignedOut>
                        <SignInButton mode="modal">
                            <Button radius="xl" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>Sign In to Battle</Button>
                        </SignInButton>
                    </SignedOut>
                    <SignedIn>
                        <Badge size="lg" variant="dot" color="blue" radius="sm" style={{ background: 'transparent', border: 'none' }}>
                            Rank: {stats.score}
                        </Badge>
                        <Divider orientation="vertical" />
                        <Badge size="lg" variant="transparent" color="blue">Wins: {stats.wins}</Badge>
                        <UserButton />
                    </SignedIn>
                </>
            )}
        </Group>
    </Stack>
);

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