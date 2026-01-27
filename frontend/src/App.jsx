import confetti from 'canvas-confetti';
import React, { useState, useEffect, useRef } from 'react';
import {
    MantineProvider, Container, Title, Card, Text, Button, Group, Badge, Stack, Grid, Loader, Tabs, Input, CopyButton, Divider, Center, SegmentedControl, Switch, rem, Modal, FileButton, TextInput, ActionIcon, Table, Avatar, Textarea, Skeleton, SimpleGrid
} from '@mantine/core';
import { 
    IconMicrophone, IconMicrophoneOff, IconTrophy, IconSwords, IconUsers, IconSearch, IconArrowLeft, IconShare, IconKeyboard, IconMusic, IconUserCircle, IconEdit, IconSend, IconPlayerPlay,
    IconNumber4Small, IconRefresh
} from '@tabler/icons-react';
import '@mantine/core/styles.css';
import { ClerkProvider, SignedIn, SignedOut, useUser, useAuth, useClerk, SignInButton } from "@clerk/clerk-react";

// IMPORTS
import { getRandomWord } from '../../src/constants';
import { AppHeader, WordDisplay, OpponentSelector, BattleInputArea, HistoryItem, OnboardingFlow, ProfileView, SplashPage, VerseDisplay, PreBattleCard, SmartAudioPlayer } from './components';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!CLERK_KEY) throw new Error("Missing Publishable Key");

const getWsUrl = (path) => {
    if (window.location.hostname.includes('workers.dev')) {
        return `wss://${window.location.hostname}${path}`;
    }
    const host = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    return `ws://${host}:8787${path}`;
};

// --- MAIN LOGIC ---
function RapBattleApp() {
    const { user: clerkUser, isLoaded } = useUser();
    const { getToken } = useAuth();
    const { signOut } = useClerk();
    
    // GUEST STATE
    const [guestUser, setGuestUser] = useState(null);
    
    // UNIFIED USER
    const activeUser = clerkUser || guestUser;

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
    const [lastAiAudio, setLastAiAudio] = useState(null);
    const [input, setInput] = useState(''); 
    const [opponent, setOpponent] = useState('roboflow');
    const [status, setStatus] = useState('Ready');
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [readyAudioIds, setReadyAudioIds] = useState(new Set());
    const currentAudioRef = useRef(null);

    const [mode, setMode] = useState('menu');
    const [battleCode, setBattleCode] = useState(''); 
    const [p1Data, setP1Data] = useState(null); 
    const [duelResult, setDuelResult] = useState(null); 
    const [battleMode, setBattleMode] = useState('text');
    const [isQueuing, setIsQueuing] = useState(false);
    const [isOpponentTyping, setIsOpponentTyping] = useState(false);
    const typingTimeoutRef = useRef(null);
    const [turnCount, setTurnCount] = useState(0);
    const turnCountRef = useRef(0);
    const queueWsRef = useRef(null);

    // SPECTATING
    const [isSpectator, setIsSpectator] = useState(false);
    const [showVoting, setShowVoting] = useState(false);
    const [hasVoted, setHasVoted] = useState(false);
    const [voteTimer, setVoteTimer] = useState(0);

    // ARENA STATE
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [battleLog, setBattleLog] = useState([]);
    const [timeLeft, setTimeLeft] = useState(30); 
    const hasAutoSubmitted = useRef(false);
    const [rounds, setRounds] = useState(1);
    const matchStartTimer = useRef(null);
    const chatEndRef = useRef(null);
    const [activeTab, setActiveTab] = useState('battle');
    const urlCodeRef = useRef(null);
    
    // WORD CHALLENGE STATE
    const [targetWord, setTargetWord] = useState(''); 
    const [wordMode, setWordMode] = useState(false);

    const ws = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [timer, setTimer] = useState(30);
    const timerRef = useRef(null);
    const audioCache = useRef({});
    const mediaRecorder = useRef(null);
    const audioChunks = useRef([]);
    const [activeAudioId, setActiveAudioId] = useState(null);
    
    // INITIALIZATION
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [battleLog]);

    useEffect(() => {
        if (mode === 'result' && duelResult) {
            const amIP1 = duelResult.p1_name === (identity?.mc_name || activeUser?.firstName);
            const myWin = (amIP1 && duelResult.winnerCode === 'p1_win') || (!amIP1 && duelResult.winnerCode === 'p2_win');

            if (duelResult.winner === (identity?.mc_name || activeUser?.firstName)) {
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }
        }
    }, [mode, duelResult]);

    useEffect(() => {
        if (mode === 'create_success' && ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.log("[App] Updating Host Settings:", { rounds, battleMode });
            ws.current.send(JSON.stringify({
                type: 'UPDATE_SETTINGS',
                rounds: parseInt(rounds),
                turnTime: parseInt(timeLeft),
                battleMode: battleMode, 
                mandatoryWord: wordMode ? targetWord : null
            }));
        }
    }, [rounds, battleMode, mode, targetWord, timeLeft]);

    useEffect(() => {
        if (activeUser) {
            if (activeUser.isGuest) {
                setStats({ wins: 0, losses: 0, score: 0, rank: 'Guest' });
                setIdentity({ mc_name: activeUser.firstName, roast_context: "A mysterious guest." });
            } else {
                fetchStats(activeUser.id)
            }
            loadHistory();
        } else {
            setMode('menu');
        }
        fetchLeaderboard();
        refreshWord();
    }, [activeUser]);

    const authenticatedFetch = async (url, options={}) => {
        const headers = options.headers || {};
        if (activeUser?.isGuest) {
            headers['x-guest-id'] = activeUser.id;
        } else {
            const token = await getToken();
            headers['Authorization'] = `Bearer ${token}`;
        }
        return fetch(url, { ...options, headers });
    }

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
            interval = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(interval);
                        if (!hasAutoSubmitted.current) {
                            hasAutoSubmitted.current = true;
                            submitTurn("(CHOKED: Time Ran Out)");
                        }
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isMyTurn, turnCount, mode]);

    const handleManualPlay = (log) => {
        // If we already have audio, play it. If not, FETCH it.
        if (log.audio) {
            new Audio(log.audio).play();
        } else {
            // Trigger the fetch, which will update the log state with the new URL
            loadAndPlayAudio(log.id, log.text, 'pvp', true);
        }
    };

    const refreshWord = () => setTargetWord(getRandomWord());

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const replayId = params.get('replay');
        const joinCode = params.get('join');

        if (replayId) {
            loadReplay(replayId);
        } else if (joinCode) {
            setBattleCode(joinCode);
            urlCodeRef.current = joinCode; 
            setMode('join');
            setActiveTab('multiplayer');
        }
    }, []);

    const handleGuestLogin = () => {
        const randomId = `guest_${Math.random().toString(36).substr(2, 9)}`;
        const randomName = `MC Guest ${Math.floor(Math.random() * 1000)}`;

        setGuestUser({
            id: randomId,
            firstName: randomName,
            isGuest: true
        })
    }

    const handleLogout = () => {
        if (guestUser) setGuestUser(null);
        else signOut();
    }

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
    }
    
    const handleOnboardingSubmit = async () => {
        if (!activeUser || !onboardingName) return alert("Please enter a name");
        setUploading(true);

        try {
            const res = await authenticatedFetch('/onboarding/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mcName: onboardingName })
            });
            
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update name');
            }

            if (onboardingFile) {
                const formData = new FormData();
                formData.append('image', onboardingFile);
                await authenticatedFetch('/onboarding/upload', {
                    method: 'POST', body: formData
                });
            }

            await authenticatedFetch('/onboarding/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mcName: onboardingName }) 
            });

            setShowOnboarding(false);
            fetchStats(activeUser.id);
        } catch (e) {
            alert(e.message);
        } finally {
            setUploading(false);
        }
    }

    const updateProfileLogic = async (newName, newFile) => {
        setUploading(true);
        try {
            if (newName) {
                const res = await authenticatedFetch('/onboarding/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mcName: newName })
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error); 
                }
                setIdentity(prev => ({ ...prev, mc_name: newName }));
            }

            if (newFile) {
                const formData = new FormData();
                formData.append('image', newFile);
                const res = await authenticatedFetch('/onboarding/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.description) {
                    setIdentity(prev => ({ ...prev, roast_context: data.description }));
                }
                setAvatarTs(Date.now())
            }

            if (!activeUser.isGuest) fetchStats(activeUser.id);
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
        if (activeUser?.isGuest) return;
        const updated = [newItem, ...history].slice(0, 20);
        setHistory(updated);
        localStorage.setItem('battle_history', JSON.stringify(updated));
        if (activeUser) fetchStats(activeUser.id);
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
        const origin = window.location.origin;
        // Prioritize the ID from the current result, then last battle, then URL
        const idToShare = duelResult?.battle_id || lastBattle?.battleId || new URLSearchParams(window.location.search).get('replay');

        if (!idToShare) return alert("No battle ID found to share");

        const link = `${origin}/?replay=${idToShare}`;
        const shareData = {
            title: 'Rap Battle Replay',
            text: 'Check out this rap battle result! Who won?',
            url: link
        };

        // Use Native Share if available (Mobile), otherwise Copy to Clipboard (Desktop)
        if (navigator.share) {
            navigator.share(shareData).catch((err) => console.log('Share dismissed', err));
        } else {
            navigator.clipboard.writeText(link).then(() => {
                alert('Replay Link Copied! Share it with friends.');
            }).catch(() => {
                // Fallback if clipboard fails
                prompt("Copy this link:", link);
            });
        }
    };

    const handleBattle = async () => {
        if (!activeUser) return alert("Please sign in!");
        if (!input) return alert('Freestyle something!');

        setLastBattle(null);
        setLastAiAudio(null);
        setReadyAudioIds(prev => {
            const next = new Set(prev);
            next.delete('last-battle');
            return next;
        });

        setIsLoading(true);
        setStatus('Sending Verse...');

        try {
            const headers = { 'Content-Type': 'application/json' };
            
            const genRes = await authenticatedFetch('/battle/generate', {
                method: 'POST',
                headers,
                body: JSON.stringify({ userRap: input, opponent }),
            });
            const genData = await genRes.json();

            setLastBattle({
                userRap: genData.userRap,
                aiVerse: genData.aiVerse,
                opponent: genData.opponent.name,
                scores: null 
            });

            setInput('');

            const audioPromise = loadAndPlayAudio('last-battle', genData.aiVerse, opponent, true);

            setStatus('Judging Rap...');
            const judgeRes = await authenticatedFetch('/battle/judge', {
                method: 'POST',
                headers,
                body: JSON.stringify({ 
                    userRap: genData.userRap, 
                    aiVerse: genData.aiVerse, 
                    opponent: genData.opponent,
                    mandatoryWord: wordMode ? targetWord : null
                }),
            });
            const judgeData = await judgeRes.json();

            setLastBattle(prev => ({
                ...prev,
                scores: judgeData.scores,
                result: judgeData.result,
                battleId: judgeData.battleId
            }));

            setStatus('Ready');
            saveHistory({ 
                ...genData, 
                ...judgeData, 
                id: `battle-${Date.now()}`,
                myPoints: judgeData.pointsEarned
            });

            await audioPromise;

            if (wordMode) refreshWord();
            fetchLeaderboard();
        } catch (e) { 
            alert(e.message); 
            setStatus('Error'); 
            console.error("[Battle] FATAL ERROR:", e);
        } finally {
            setIsLoading(false);
        }
    };

    // AUDIO LOGIC
    const loadAndPlayAudio = async (battleId, text, character, silent = false) => {
        const isDataUri = typeof text === 'string' && text.startsWith('data:audio');

        // CACHE CHECK
        if (audioCache.current[battleId]) {
            const cachedUrl = audioCache.current[battleId];
            setBattleLog(prev => prev.map(m => m.id === battleId ? { ...m, audio: cachedUrl } : m));
            
            if (!silent) {
                const audio = new Audio(cachedUrl);
                currentAudioRef.current = audio;
                audio.play().catch(e => console.warn("Playback prevented by browser:", e));
            }
            return;
        }

        try {
            let audioUrl;

            if (isDataUri) {
                audioUrl = text;
            } else {
                // Fetch TTS
                const res = await fetch('/speak', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, character }),
                });

                if (!res.ok) throw new Error("TTS Generation Failed");
                const blob = await res.blob();
                audioUrl = URL.createObjectURL(blob);
            }

            audioCache.current[battleId] = audioUrl;
            
            // Update State with new Audio URL
            setBattleLog(prevLog => prevLog.map(msg => 
                msg.id === battleId ? { ...msg, audio: audioUrl } : msg
            ));

            if (!silent) {
                const audio = new Audio(audioUrl);
                currentAudioRef.current = audio;
                await audio.play().catch(e => {
                    console.log("Auto-play blocked; user must click play manually.");
                });
            }

        } catch (e) {
            console.error("[Audio Error]:", e);
            setStatus("Audio load failed");
        }
    };

    const toggleMic = async () => { isRecording ? stopRecording() : startRecording(); };

    const mimeTypeRef = useRef('audio/webm');

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeTypes = [
                'audio/webm;codecs=opus', 
                'audio/mp4',
                'audio/webm', 
                'audio/ogg'
            ];
            
            let selectedType = 'audio/webm';
            for (const type of mimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    selectedType = type;
                    break;
                }
            }
            mimeTypeRef.current = selectedType; 

            const options = { mimeType: selectedType };
            mediaRecorder.current = new MediaRecorder(stream, options);
            
            audioChunks.current = [];
            
            mediaRecorder.current.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.current.push(e.data);
            };

            mediaRecorder.current.onstop = () => {
                const blob = new Blob(audioChunks.current, { type: mimeTypeRef.current });
                setRecordedBlob(blob);
            };

            mediaRecorder.current.start(1000); 
            setIsRecording(true);

        } catch (err) { 
            alert('Microphone error: ' + err.message); 
        }
    };

    const stopRecording = () => {
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
            setIsRecording(false);
        }
        
        if (mediaRecorder.current && mediaRecorder.current.stream) {
            mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
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
        const currentSettings = {
            rounds: rounds,
            turnTime: 30,
            battleMode: battleMode, 
            mandatoryWord: wordMode ? targetWord : null
        };
        connectToBattleRoom(roomID, 'CREATE', currentSettings);
    };
   
    const joinMultiplayer = () => {
        if (!battleCode) return alert("Enter a code!");
        connectToBattleRoom(battleCode, 'JOIN');
    };

    useEffect(() => {
        if (activeUser && mode === 'join' && battleCode && battleCode === urlCodeRef.current) {
            console.log("Auto-joining room:", battleCode);
            urlCodeRef.current = null; 
            joinMultiplayer();
        }
    }, [activeUser, mode, battleCode]);

    const joinQueue = () => {
        setIsQueuing(true);
        setStatus("Searching for opponent...");
        if (queueWsRef.current) {
            queueWsRef.current.close();
            queueWsRef.current = null;
        }

        const wsUrl = getWsUrl('/ws/queue');

        console.log("[Queue] Connecting to:", wsUrl);

        let socket;
        try {
            socket = new WebSocket(wsUrl);
        } catch (e) {
            console.error("[Queue] Failed to create WebSocket:", e);
            setIsQueuing(false);
            setStatus("Connection failed");
            return;
        }

        queueWsRef.current = socket;

        const connectionTimeout = setTimeout(() => {
            if (socket.readyState !== WebSocket.OPEN) {
                console.error("[Queue] Connection timeout");
                socket.close();
                setIsQueuing(false);
                setStatus("Connection timeout - try again");
            }
        }, 10000);

        socket.onopen = () => {
            console.log("[Queue] Connected successfully");
            clearTimeout(connectionTimeout);
            setStatus("Searching for opponent...");
        };


        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'PING') {
                socket.send(JSON.stringify({ type: 'PONG', ts: data.ts }));
                return;
            }
        

            if (data.type === "MATCH_FOUND") {
                console.log("[Queue] Match found:", data);
                clearTimeout(connectionTimeout);
                socket.close(); 
                queueWsRef.current = null;
                setIsQueuing(false);
                setBattleCode(data.battleId);
                connectToBattleRoom(data.battleId, data.role, data.config);
            }
        };

        socket.onerror = (error) => {
            console.error("[WS CRITICAL ERROR]", error);
            clearTimeout(connectionTimeout);
        };

        socket.onclose = () => {
            console.log("[Queue] Closed:", event.code, event.reason, "wasClean:", event.wasClean);
            clearTimeout(connectionTimeout)
            setIsQueuing((prev) => {
            if (prev && event.code !== 1000) {
                // Abnormal close while still queuing
                setStatus("Connection lost - tap to retry");
                }
                return false;
            });
        };
    };

    const cancelQueue = () => {
        if (queueWsRef.current) {
            queueWsRef.current.close();
            queueWsRef.current = null;
        }
        setIsQueuing(false);
        setStatus('Ready');
    };

    const connectToBattleRoom = (roomID, role, settings={}) => {
        if (ws.current) {
            ws.current.close();
            ws.current = null;
        }

        setStatus('Connecting to Arena...');
        const socket = new WebSocket(getWsUrl(`/ws/battle/${roomID}`));
        ws.current = socket;

        socket.onopen = () => {
            console.log("[Battle] Connected");
            const myName = identity?.mc_name || activeUser?.firstName || 'Guest';
            
            socket.send(JSON.stringify({ 
                type: 'INIT', 
                username: myName, 
                userId: activeUser.id, 
                role: role,
                settings: settings
            }));

            if (role === 'CREATE') {
                setMode('create_success');
                setBattleCode(roomID)
            } else {
                setMode('waiting_for_start'); 
            }

        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'PING') {
                socket.send(JSON.stringify({ type: 'PONG', ts: msg.ts }));
                return;
            }


            if (msg.type === 'ERROR') {
                alert(msg.message);
                setMode('menu');
                ws.current.close();
                setIsLoading(false);
                return;
            }

            if (msg.type === 'OPPONENT_JOINED') {
                setP1Data({ name: msg.username, id: msg.userId });
            }

            // --- START GAME ---
            if (msg.type === 'MATCH_START') {
                setBattleLog([]);
                turnCountRef.current = 0;
                
                setIsMyTurn(msg.yourTurn);
                const amIP1 = msg.p1Info?.id === activeUser.id;
                const opponentInfo = amIP1 ? msg.p2Info : msg.p1Info;
                setP1Data({ name: opponentInfo?.username, id: opponentInfo?.id });

                if (msg.battleMode) setBattleMode(msg.battleMode);
                if (msg.rounds) setRounds(msg.rounds);
                if (msg.turnTime) setTimeLeft(msg.turnTime);
                if (msg.mandatoryWord) { setTargetWord(msg.mandatoryWord); setWordMode(true); }

                setIsSpectator(!!msg.isSpectator);
                if (msg.isSpectator) setStatus('Spectating Battle');

                setMode('pre_battle');

                if (matchStartTimer.current) clearTimeout(matchStartTimer.current);
                
                matchStartTimer.current = setTimeout(() => {
                    setMode('arena');
                }, 5000);
            }
            // --- VOTING PHASE ---
            if (msg.type === 'START_VOTING') {
                setMode('judging...');
                setShowVoting(true);
                setVoteTimer(msg.duration || 30);

                const interval = setInterval(() => {
                    setVoteTimer(prev => {
                        if (prev <= 1) { clearInterval(interval); return 0; }
                        return prev - 1;
                    });
                }, 1000);
            }

            // --- RECEIVE TURN ---
            if (msg.type === 'NEW_VERSE') {
                if (msg.currentTurnCount) turnCountRef.current = msg.currentTurnCount;
                else turnCountRef.current += 1;

                const currentMsgId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                const isMe = msg.userId === activeUser.id;

                setBattleLog(prev => {
                    return [...prev, { 
                        id: currentMsgId, 
                        sender: isMe ? 'me' : 'opponent', 
                        text: msg.verse, 
                        audio: msg.audioData 
                    }];
                });

                // This converts the "Play TTS" button into a Player automatically
                if (!msg.audioData) { 
                    loadAndPlayAudio(currentMsgId, msg.verse, 'pvp', true);
                }

                const totalTurnsAllowed = rounds * 2;

                if (turnCountRef.current >= totalTurnsAllowed) {
                    // STOP! The game is over. Do NOT pass the turn back.
                    setIsMyTurn(false);
                    setStatus("Round Complete. Waiting for Judges...");
                }

                if (!isMe) {
                    setIsMyTurn(true);
                    setTimeLeft(30); 
                } else {
                    setIsMyTurn(false);
                }
            }

            if (msg.type === 'JUDGING') {
                setMode('judging...');
                setStatus("Judging in progress...");
                setIsMyTurn(false);
            }

            if (msg.type === 'OPPONENT_TYPING') {
                setIsOpponentTyping(true);
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = setTimeout(() => setIsOpponentTyping(false), 2000);
            }

            if (msg.type === 'OPPONENT_DISCONNECTED') {
                if (matchStartTimer.current) clearTimeout(matchStartTimer.current);
                
                if (mode === 'arena' || mode === 'pre_battle') {
                    alert("Opponent forfeited! You win by default.");
                    
                    if (msg.result) {
                        setDuelResult(msg.result);
                        setMode('result');
                        
                        saveHistory({
                            ...msg.result,
                            timestamp: Date.now(),
                            myPoints: 20
                        });
                    }
                } else {
                    setMode('menu');
                }
                if (ws.current) ws.current.close();
            }

            if (msg.type === 'RESULT') {
                setDuelResult(msg.result);
                setMode('result');
                setShowVoting(false);
                
                if (activeUser && !activeUser.isGuest) {
                    fetchStats(activeUser.id);
                }

                saveHistory({
                    ...msg.result,
                    timestamp: Date.now(),
                    myPoints: msg.result.pointsEarned
                })
                ws.current.close();
            }
        };
        socket.onclose = (e) => {
            console.log("[Battle] Closed", e.code, e.reason);
        };
    };

    const submitTurn = async (forcedText = null) => {
        const textToSend = forcedText || input;
        if (!textToSend && !recordedBlob) return;

        let audioData = null;
        if (battleMode === 'audio' && recordedBlob) {
            if (recordedBlob.size > 350000) {
                alert("Recording too long! Try a shorter verse.");
                return;
            }
            audioData = await blobToBase64(recordedBlob);
        }

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: 'SUBMIT_TURN',
                verse: textToSend,
                audioData: audioData
            }));
        } else {
            alert("Connection lost. Please refresh.");
        }

        setInput('');
        setIsMyTurn(false);
        setRecordedBlob(null);
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

    const handleInput = (e) => {
        const val = e.currentTarget.value;
        setInput(val);

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'TYPING' }));
        }
    }

    const retryJudging = async () => {
        if (!lastBattle) return;
        
        setIsLoading(true);
        setStatus('Retrying Judge...');
        
        try {
            const judgeRes = await authenticatedFetch('/battle/judge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userRap: lastBattle.userRap, 
                    aiVerse: lastBattle.aiVerse, 
                    opponent: { name: lastBattle.opponent, points: 10 }, 
                    mandatoryWord: wordMode ? targetWord : null
                }),
            });
            const judgeData = await judgeRes.json();

            setLastBattle(prev => ({
                ...prev,
                scores: judgeData.scores,
                result: judgeData.result,
                battleId: judgeData.battleId
            }));
            
            saveHistory({ ...lastBattle, ...judgeData, id: `battle-${Date.now()}` });
            fetchLeaderboard();

        } catch (e) {
            alert("Retry failed: " + e.message);
        } finally {
            setIsLoading(false);
            setStatus('Ready');
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
        <>
{/* --- 1. SIGNED OUT VIEW --- */}
            {!activeUser && (
            <SignedOut>
                {duelResult?.scores?.comment && (
                    <Text c="dimmed" mt="md" ta="center" fs="italic">"{duelResult.scores.comment}"</Text>
                )}

                {/* LOGIC BRANCHING */}
                {mode === 'result' && duelResult ? (
                    /* REPLAY VIEW */
                    <Container size="md" py="xl">
                        <Stack align="center">
                            <Card shadow="xl" padding="xl" withBorder style={{ width: '100%' }}>
                                <Stack align="center">
                                    <Badge color="red" size="lg">REPLAY MODE</Badge>
                                    <Title order={2}>Winner: {duelResult.winner}</Title>
                                    <VerseDisplay 
                                        p1Verse={duelResult.p1_verse}
                                        p2Verse={duelResult.p2_verse}
                                        p1Title={duelResult.p1_name || "PLAYER 1"}
                                        p2Title={duelResult.p2_name || "PLAYER 2"}
                                        p1Audio={null} p2Audio={null}
                                    />
                                    <Group mt="md">
                                        <Button variant="light" leftSection={<IconShare size={16}/>} onClick={shareReplay}>Share</Button>
                                        <Button onClick={() => { setMode('menu'); setDuelResult(null); }}>Exit to Home</Button>
                                    </Group>
                                </Stack>
                            </Card>
                        </Stack>
                    </Container>

                ) : mode === 'join' ? (
                    
                    /* INVITATION CARD */
                    <Container size="xs" h="100vh" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <Card shadow="xl" padding="xl" radius="lg" withBorder>
                            <Stack align="center" gap="lg">
                                <IconSwords size={48} color="#228be6" />
                                <Title order={2} ta="center">Challenger Approaching!</Title>
                                
                                <Text ta="center" c="dimmed">
                                    You have been invited to a rap battle.
                                    <br/>
                                    Room Code: <Badge variant="dot" size="lg">{battleCode}</Badge>
                                </Text>

                                <Stack w="100%" gap="md">
                                    <SignInButton mode="modal">
                                        <Button size="xl" fullWidth variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
                                            Sign In to Battle
                                        </Button>
                                    </SignInButton>
                                    
                                    <Divider label="OR" labelPosition="center" />
                                    
                                    <Button 
                                        size="lg" 
                                        variant="outline" 
                                        color="gray" 
                                        fullWidth
                                        onClick={handleGuestLogin}
                                    >
                                        Play as Guest
                                    </Button>
                                </Stack>
                            </Stack>
                        </Card>
                    </Container>

                ) : (
                    <SplashPage onGuestLogin={handleGuestLogin} />
                )}
            </SignedOut>
            )}

            {/* --- 2. ACTIVE USER VIEW (REAL OR GUEST) --- */}
            {activeUser && (
                <Container size="md" py="xl"> 
                    <Stack gap="lg" align="center">
                        
                        <AppHeader 
                            user={activeUser} 
                            isLoaded={isLoaded} 
                            identity={identity} 
                            stats={stats} 
                            avatarTs={avatarTs} 
                            onLogout={handleLogout}
                        />

                        <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
                            <Tabs.List grow>
                                
                                {/* TAB 1: BATTLE */}
                                <Tabs.Tab value="battle">
                                    <Group gap={8} justify="center" align="center" wrap="nowrap">
                                        <IconSwords size={20} />
                                        <Text span visibleFrom="xs" size="sm">Single</Text>
                                    </Group>
                                </Tabs.Tab>

                                {/* TAB 2: MULTIPLAYER */}
                                <Tabs.Tab value="multiplayer">
                                    <Group gap={8} justify="center" align="center" wrap="nowrap">
                                        <IconUsers size={20} />
                                        <Text span visibleFrom="xs" size="sm">Multi</Text>
                                    </Group>
                                </Tabs.Tab>

                                {/* TAB 3: LEADERBOARD */}
                                <Tabs.Tab value="leaderboard">
                                    <Group gap={8} justify="center" align="center" wrap="nowrap">
                                        <IconTrophy size={20} />
                                        <Text span visibleFrom="xs" size="sm">Ranks</Text>
                                    </Group>
                                </Tabs.Tab>

                                {/* TAB 4: PROFILE */}
                                <Tabs.Tab value="profile">
                                    <Group gap={8} justify="center" align="center" wrap="nowrap">
                                        <IconUserCircle size={20} />
                                        <Text span visibleFrom="xs" size="sm">Profile</Text>
                                    </Group>
                                </Tabs.Tab>
                            </Tabs.List>

                            {/* --- 3. SINGLE PLAYER TAB --- */}
                            <Tabs.Panel value="battle" pt="lg">
                                <Container size="sm"> 
                                    <Card padding={30} radius="lg" withBorder style={{ borderColor: '#eee' }}>
                                        <Stack gap="lg">
                                            <OpponentSelector current={opponent} setOpponent={setOpponent} />
                                            <Group justify="center">
                                                <Switch label="Word Challenge" checked={wordMode} onChange={(e) => { setWordMode(e.currentTarget.checked); if(e.currentTarget.checked) refreshWord(); }} size="md"/>
                                            </Group>
                                            {wordMode && <WordDisplay word={targetWord} onRefresh={refreshWord} />}
                                            <Divider style={{ opacity: 0.5 }} />
                                            {!isSpectator ? (
                                                <BattleInputArea 
                                                    input={input} setInput={setInput} 
                                                    isRecording={isRecording} toggleMic={toggleMic} 
                                                    handleSend={handleBattle} isLoading={isLoading} status={status} 
                                                    placeholder={wordMode ? `Freestyle using "${targetWord}"...` : "Freestyle your bars..."} 
                                                />
                                            ) : (
                                                <Card bg="gray.1" radius="md" p="lg" ta="center">
                                                    <Stack align="center" gap={5}>
                                                        <IconUsers size={32} />
                                                        <Title order={4}>Spectator Mode</Title>
                                                        <Text size="sm" c="dimmed">You are watching the battle live.</Text>
                                                    </Stack>
                                                </Card>
                                            )}
                                        </Stack>
                                    </Card>

                                    {lastBattle && (
                                        <Card mt="lg" padding="lg" radius="md" withBorder bg="gray.0">
                                            <Group justify="space-between" mb="sm">
                                                <Title order={4}>Results</Title>
                                                <Badge color={lastBattle.result === 'win' ? 'green' : 'red'} size="lg">
                                                    {lastBattle.result ? lastBattle.result.toUpperCase() : "JUDGING..."}
                                                </Badge>
                                            </Group>
                                            {lastBattle.scores && (
                                                <Text size="sm" mt="md" fs="italic" c="dimmed" ta="center">"{lastBattle.scores.comment}"</Text>
                                            )}
                                            <Divider my="md" />
                                            <VerseDisplay
                                                p1Verse={lastBattle.userRap}
                                                p2Verse={lastBattle.aiVerse}
                                                p1Title="YOUR VERSE"
                                                p2Title="AI RESPONSE"
                                                p2Audio={lastAiAudio}
                                            />
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
                                                    <Button size="xl" fullWidth radius="md" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }} onClick={joinQueue} leftSection={<IconSwords size={28} />}>FIND MATCH</Button>
                                                ) : (
                                                    <Button size="xl" fullWidth radius="md" color="red" variant="outline" onClick={cancelQueue}>CANCEL SEARCH</Button>
                                                )}
                                                {isQueuing && <Loader color="blue" type="dots" />}
                                            </Stack>
                                        </Card>
                                        <Divider label="OR" labelPosition="center" my="sm" />
                                        <Grid>
                                            <Grid.Col span={6}><Card shadow="sm" padding="lg" radius="md" withBorder style={{height: '100%'}}><Stack align="center" justify="center" h={120}><IconUsers size={32} color="#228be6" /><Title order={5}>Private Room</Title><Button variant="light" fullWidth onClick={startMultiplayer}>Create</Button></Stack></Card></Grid.Col>
                                            <Grid.Col span={6}><Card shadow="sm" padding="lg" radius="md" withBorder style={{height: '100%'}}><Stack align="center" justify="center" h={120}><IconSearch size={32} color="#fa5252" /><Title order={5}>Join Room</Title><Button variant="light" color="red" fullWidth onClick={() => setMode('join')}>Enter Code</Button></Stack></Card></Grid.Col>
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
                                                <Badge size="xl" variant="filled" color="indigo">{battleCode}</Badge>
                                                
                                                <CopyButton value={battleCode}>
                                                    {({ copied, copy }) => (
                                                        <Button size="xs" onClick={copy} color={copied ? 'teal' : 'blue'}>
                                                            {copied ? 'Copied' : 'Copy Code'}
                                                        </Button>
                                                    )}
                                                </CopyButton>

                                                {/* SHARE BUTTON */}
                                                <Button 
                                                    size="xs" 
                                                    variant="light" 
                                                    color="pink"
                                                    leftSection={<IconShare size={14}/>}
                                                    onClick={() => {
                                                        const link = `${window.location.origin}/?join=${battleCode}`;
                                                        if (navigator.share) {
                                                            navigator.share({
                                                                title: 'Rap Battle',
                                                                text: 'Battle me right now!',
                                                                url: link
                                                            }).catch(() => {});
                                                        } else {
                                                            navigator.clipboard.writeText(link);
                                                            alert('Invite Link Copied!');
                                                        }
                                                    }}
                                                >
                                                    Invite
                                                </Button>
                                            </Group>
                                            {/* ------------------------- */}

                                            <Divider style={{ width: '100%' }} label="Settings" labelPosition="center"/>
                                            <Group><Text size="sm" fw={700}>Rounds:</Text><SegmentedControl value={String(rounds)} onChange={(val) => setRounds(Number(val))} data={[{ label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }]} /></Group>
                                            <Divider style={{ width: '100%' }} label="Settings" labelPosition="center"/>
                                            <Group><Text size="sm" fw={700}>Rounds:</Text><SegmentedControl value={String(rounds)} onChange={(val) => setRounds(Number(val))} data={[{ label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' }]} /></Group>
                                            <Group><Text size="sm" fw={700}>Time:</Text><SegmentedControl value={String(timeLeft)} onChange={(val) => setTimeLeft(Number(val))} data={[{ label: '30s', value: '30' }, { label: '45s', value: '45' }, { label: '60s', value: '60' }]} /></Group>
                                            <SegmentedControl value={battleMode} onChange={ (val) => {setBattleMode(val); }} data={[{ label: 'Text Mode', value: 'text' }, { label: 'Audio Mode', value: 'audio' }]} />
                                            <Switch label="Word Challenge" checked={wordMode} onChange={(e) => { const isOn = e.currentTarget.checked; setWordMode(isOn); if (isOn) refreshWord();}} size="md"/>
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
                                            <Button variant="subtle" color="red" onClick={() => { if(ws.current) ws.current.close(); setMode('menu'); }}>Cancel</Button>
                                        </Stack>
                                    </Card>
                                )}

                                {mode === 'pre_battle' && (
                                    <PreBattleCard user={activeUser} identity={identity} opponent={p1Data} avatarTs={avatarTs} config={{ rounds: rounds, turnTime: 30, battleMode: battleMode, mandatoryWord: wordMode ? targetWord : null }} />
                                )}

                                {mode === 'arena' && (
                                    <Card shadow="sm" padding="lg" withBorder>
                                        <Stack gap="md">
                                            <Group justify="space-between">
                                                <Group>
                                                    <Avatar src={p1Data?.id?.startsWith('guest_') ? null : `/avatar/${p1Data?.id}`} radius="xl" color="blue">{p1Data?.name?.[0]}</Avatar>
                                                    <Stack gap={0}><Text size="xs" c="dimmed">OPPONENT</Text><Title order={5}>{p1Data?.name || "Unknown"}</Title></Stack>
                                                </Group>
                                                <Badge size="xl" variant="filled" color={isMyTurn ? (timeLeft < 10 ? 'red' : 'green') : 'gray'}>{isMyTurn ? `YOUR TURN: ${timeLeft}s` : "THEIR TURN"}</Badge>
                                            </Group>

                                            {wordMode && <WordDisplay word={targetWord} />}
                                            <Divider />

                                            {/* CHAT LOG */}
                                            <Stack gap="sm" style={{ height: 300, overflowY: 'auto' }}>
                                                {battleLog.length === 0 && <Text c="dimmed" ta="center" fs="italic" mt="xl">The battle begins! {isMyTurn ? "You go first!" : "Opponent goes first."}</Text>}
                                                {battleLog.map((log, i) => (
                                                    <Group key={i} justify={log.sender === 'me' ? 'flex-end' : 'flex-start'} align="flex-start">
                                                        {log.sender !== 'me' && (<Avatar size="sm" radius="xl" src={p1Data?.id?.startsWith('guest_') ? null : `/avatar/${p1Data?.id}`} />)}
                                                        <Card bg={log.sender === 'me' ? 'blue.1' : 'gray.1'} radius="md" p="sm" style={{ maxWidth: '85%', minWidth: '200px' }}>
                                                            <Stack gap={4}>
                                                                <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{log.text || "(Processing Audio...)"}</Text>
                                                                {log.audio && (<div style={{ marginTop: 5 }}><SmartAudioPlayer src={log.audio} /></div>)}
                                                                {!log.audio && (
                                                                    <Group gap={5} style={{ opacity: 0.5, cursor: 'pointer' }} onClick={() => handleManualPlay(log)}>
                                                                        <IconPlayerPlay size={12}/>
                                                                        <Text size="xs">Play TTS</Text>
                                                                    </Group>
                                                                )}
                                                            </Stack>
                                                        </Card>
                                                        {log.sender === 'me' && (<Avatar size="sm" radius="xl" src={activeUser?.id && !activeUser.id.startsWith('guest_') ? `/avatar/${activeUser.id}` : null}>{activeUser?.firstName?.[0]}</Avatar>)}
                                                    </Group>
                                                ))}
                                                <div ref={chatEndRef}/>
                                            </Stack>

                                            <Divider />

                                            {isMyTurn ? (
                                                <Stack>
                                                    {battleMode === 'audio' ? (
                                                        <Group justify="center">
                                                            {!recordedBlob ? (
                                                                <Button size="xl" color={isRecording ? 'red' : 'blue'} radius="xl" style={{ flex: 1 }} leftSection={isRecording ? <IconMicrophoneOff/> : <IconMicrophone/>} onClick={isRecording ? stopRecording : startRecording}>{isRecording ? `Recording (${30 - timeLeft}s)...` : "Press to Record"}</Button>
                                                            ) : (
                                                                <Group style={{ flex: 1 }}>
                                                                    <Button color="red" variant="subtle" onClick={() => setRecordedBlob(null)}>Retry</Button>
                                                                    <Button color="green" flex={1} size="lg" rightSection={<IconSend size={18}/>} onClick={() => submitTurn("(Audio Verse)")}>Send Audio</Button>
                                                                </Group>
                                                            )}
                                                        </Group>
                                                    ) : (
                                                        <Group align="end">
                                                            <Textarea placeholder={`You have ${timeLeft}s to spit bars...`} minRows={2} style={{ flex: 1 }} value={input} onChange={(e) => { setInput(e.currentTarget.value); if (ws.current) ws.current.send(JSON.stringify({ type: 'TYPING' })); }} onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitTurn(); }}} />
                                                            <ActionIcon size="xl" radius="md" variant="gradient" gradient={{ from: 'blue', to: 'indigo' }} onClick={() => submitTurn()}><IconSend size={24} /></ActionIcon>
                                                        </Group>
                                                    )}
                                                </Stack>
                                            ) : (
                                                <Card bg="gray.0" p="sm" radius="md"><Group justify="center"><Loader size="sm" type="dots" /><Text c="dimmed" size="sm">{isOpponentTyping ? "Opponent is writing..." : "Opponent is thinking..."}</Text></Group></Card>
                                            )}
                                        </Stack>
                                    </Card>
                                )}

                                {mode === 'judging...' && (
                                    <Card shadow="sm" padding="xl" withBorder>
                                        <Stack align="center" gap="xl" py="xl">
                                            <Loader size="xl" type="bars" color="orange" />
                                            <Stack align="center" gap={5}><Title order={2}>Judges Deliberating</Title><Text c="dimmed" fs="italic">Analyzing rhymes, flow, and aggression...</Text></Stack>
                                        </Stack>
                                    </Card>
                                )}

                                {showVoting && (
                                    <Modal opened={true} onClose={() => {}} withCloseButton={false} title={<Group><IconSwords/><Text fw={700}>WHO WON?</Text></Group>} centered>
                                        <Stack align="center">
                                            <Text size="xl" fw={900} c="orange">{voteTimer}s remaining</Text>
                                            <Text c="dimmed" size="sm" ta="center">Cast your vote to influence the final score!</Text>
                                            {!hasVoted ? (
                                                <Group grow style={{ width: '100%' }}>
                                                    <Button size="xl" color="blue" variant="light" onClick={() => { ws.current.send(JSON.stringify({ type: 'VOTE', vote: 'p1' })); setHasVoted(true); }}>{p1Data?.name || "Player 1"}</Button>
                                                    <Button size="xl" color="red" variant="light" onClick={() => { ws.current.send(JSON.stringify({ type: 'VOTE', vote: 'p2' })); setHasVoted(true); }}>{p1Data?.name ? "Player 2" : "Player 2"}</Button>
                                                </Group>
                                            ) : (
                                                <Card bg="green.1" w="100%" ta="center" p="lg"><Title order={3} c="green">VOTE CAST</Title></Card>
                                            )}
                                        </Stack>
                                    </Modal>
                                )}

                                {mode === 'result' && duelResult && (
                                    <Card shadow="sm" padding="xl" withBorder>
                                        <Stack align="center">
                                            <Title order={2}>Winner: {duelResult.winner}</Title>
                                            <div style={{ width: '100%' }}>
                                                <VerseDisplay 
                                                    p1Verse={duelResult.p1_verse}
                                                    p2Verse={duelResult.p2_verse}
                                                    p1Title={duelResult.p1_name || "PLAYER 1"}
                                                    p2Title={duelResult.p2_name || "PLAYER 2"}
                                                    p1Audio={duelResult.transcript?.filter(t => t.username === duelResult.p1_name).pop()?.audioData}
                                                    p2Audio={duelResult.transcript?.filter(t => t.username === duelResult.p2_name).pop()?.audioData}
                                                />
                                            </div>
                                            <Grid style={{ width: '100%' }} mt="md">
                                                <Grid.Col span={6}><Card bg="blue.0" withBorder h="100%"><Text size="xs" c="dimmed" fw={700}>PLAYER 1</Text><Title order={2} c="blue">{duelResult.scores.p1?.total || 0}</Title></Card></Grid.Col>
                                                <Grid.Col span={6}><Card bg="red.0" withBorder h="100%"><Text size="xs" c="dimmed" fw={700}>PLAYER 2</Text><Title order={2} c="red">{duelResult.scores.p2?.total || 0}</Title></Card></Grid.Col>
                                            </Grid>
                                            <Group justify="center" mt="lg">
                                                <Button onClick={() => { setMode("menu"); setInput(''); }}>Back to Menu</Button>
                                                <Button variant="light" leftSection={<IconShare size={16}/>} onClick={shareReplay}>Share Replay</Button>
                                            </Group>
                                        </Stack>
                                    </Card>
                                )}
                            </Tabs.Panel>

                            {/* --- 5. LEADERBOARD & 6. PROFILE TABS ... (Unchanged) --- */}
                            <Tabs.Panel value="leaderboard" pt="md">
                                <Card shadow="sm" padding="lg" radius="md" withBorder>
                                    <Group justify="space-between" mb="md"><Title order={3}>Hall of Fame</Title><SegmentedControl value={leaderboardType} onChange={setLeaderboardType} data={[{ label: 'Single Player', value:'single' }, { label: 'PVP Arena', value:'pvp' }]} /></Group>
                                    <Table striped><Table.Thead><Table.Tr><Table.Th>Rank</Table.Th><Table.Th>Rapper</Table.Th><Table.Th>Wins</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{leaderboard.map((player, index) => (<Table.Tr key={player.username}><Table.Td>#{index + 1}</Table.Td><Table.Td fw={700}>{player.username}</Table.Td><Table.Td>{player.score}</Table.Td></Table.Tr>))}</Table.Tbody></Table>
                                </Card>
                            </Tabs.Panel>
                            
                            <Tabs.Panel value="profile" pt="md">
                                {/* Profile View (Unchanged from your current setup) */}
                                {activeUser.isGuest ? (
                                    <Card withBorder padding="xl" ta="center">
                                        <Stack align="center" gap="lg"><IconUserCircle size={64} color="#adb5bd" /><Title order={3}>Guest Mode</Title><Text c="dimmed">Sign up to save history.</Text><Button mt="md" size="lg" onClick={() => window.location.reload()}>Sign Up Now</Button></Stack>
                                    </Card>
                                ) : (
                                    <Stack gap="xl">
                                        <ProfileView user={activeUser} stats={stats} identity={identity} onUpdateProfile={updateProfileLogic} uploading={uploading} avatarTs={avatarTs} />
                                        <Container size="sm" style={{ width: '100%' }}>
                                            <Divider label={<Badge variant="outline">Full Battle History</Badge>} labelPosition="center" mb="lg" />
                                            <Stack gap="md">{history.map((item) => (<HistoryItem key={item.id} item={item} playAudio={loadAndPlayAudio} identity={identity} />))}</Stack>
                                            {history.length > 0 && <Center mt="md"><Button variant="subtle" color="red" onClick={clearHistory}>Clear History</Button></Center>}
                                        </Container>
                                    </Stack>
                                )}
                            </Tabs.Panel>
                        </Tabs>
                    </Stack>
                </Container>
            )}
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