import confetti from 'canvas-confetti';
import React, { useState, useEffect, useRef } from 'react';
import {
    MantineProvider, Container, Title, Card, Text, Button, Group, Badge, Stack, Grid, Loader, Tabs, Input, CopyButton, Divider, Center, SegmentedControl, Switch, rem, Modal, FileButton, TextInput, ActionIcon, Table, Avatar, Textarea, Skeleton
} from '@mantine/core';
import { 
    IconMicrophone, IconMicrophoneOff, IconTrophy, IconSwords, IconUsers, IconSearch, IconArrowLeft, IconShare, IconKeyboard, IconMusic, IconUserCircle, IconEdit, IconSend, IconPlayerPlay,
	IconNumber4Small, IconRefresh
} from '@tabler/icons-react';
import '@mantine/core/styles.css';
import { ClerkProvider, SignedIn, SignedOut, useUser, useAuth, useClerk, SignInButton } from "@clerk/clerk-react";

// IMPORTS
import { getRandomWord } from '../../src/constants';
import { AppHeader, WordDisplay, OpponentSelector, BattleInputArea, HistoryItem, OnboardingFlow, ProfileView, SplashPage, VerseDisplay, PreBattleCard } from './components';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!CLERK_KEY) throw new Error("Missing Publishable Key");

const getWsUrl = (path) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? '127.0.0.1:8787' 
        : window.location.host;
    return `${protocol}//${host}${path}`;
};

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
    const [readyAudioIds, setReadyAudioIds] = useState(new Set());

    const [mode, setMode] = useState('menu');
    const [battleCode, setBattleCode] = useState(''); 
    const [p1Data, setP1Data] = useState(null); 
    const [duelResult, setDuelResult] = useState(null); 
    const [battleMode, setBattleMode] = useState('text');
    const [isQueuing, setIsQueuing] = useState(false);
    const [isOpponentTyping, setIsOpponentTyping] = useState(false);
    const typingTimeoutRef = useRef(null);
	const [turnCount, setTurnCount] = useState(0);
	

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
	
    // INITIALIZATION
	useEffect(() => {
		chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [battleLog]);

	useEffect(() => {
		if (mode === 'result' && duelResult) {
			// determine winner
			const amIP1 = duelResult.p1_name === (identity?.mc_name || user?.firstName);
			const myWin = (amIP1 && duelResult.winnerCode === 'p1_win') || (!amIP1 && duelResult.winnerCode === 'p2_win');

			if (duelResult.winner === (identity?.mc_name || user?.firstName)) {
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
			ws.current.send(JSON.stringify({
				type: 'UPDATE_SETTINGS',
				rounds: parseInt(rounds),
				turnTime: parseInt(timeLeft),
				battleMode: battleMode,
				mandatoryWord: wordMode ? targetWord : null
			}));
		}
	}, [rounds, battleMode, mode, targetWord, timeLeft])
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
			interval = setInterval(() => {
				setTimeLeft((prev) => {
					if (prev <= 1) {
						clearInterval(interval);
						// Only auto-submit if we haven't already for THIS SPECIFIC turn
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
		if (log.audio) {
			new Audio(log.audio).play();
		} else {
			loadAndPlayAudio(`msg-${Date.now()}`, log.text, 'bytebeater');
		}
	};

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
        let origin = window.location.origin;
        const idToShare = duelResult?.battle_id || lastBattle?.battleId || new URLSearchParams(window.location.search).get('replay');

		console.log("Sharing ID:", idToShare); 

		if (!idToShare) return alert("No battle ID found to share");


		const link = `${origin}/?replay=${idToShare}`;

		navigator.clipboard.writeText(link).then(() => {
			alert('Battle Link Copied! Share it with friends');
		}).catch(err => {
			prompt(err);
		})
    };

    // SINGLE PLAYER BATTLE
    const handleBattle = async () => {
        if (!user) return alert("Please sign in!");
        if (!input) return alert('Freestyle something!');

        console.log("[Battle] >>> Flow Started: Parallel Generate + TTS");
        
        setIsLoading(true);
        setStatus('Sending Verse...');
        console.log("[Battle] Step 1: Generating AI Verse...");

        try {
            const token = await getToken(); 
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
            
            // 1. GENERATE VERSE
            const genRes = await fetch('/battle/generate', {
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

            console.log("[Battle] Step 2: Triggering TTS (Parallel)");

            setInput('');

            // 2. TRIGGER TTS (Background - Don't await yet!)
            console.log("[Battle] Initiating TTS Pre-generation...");
            const audioPromise = loadAndPlayAudio('last-battle', genData.aiVerse, opponent, true);

            // 3. JUDGE (Happens while audio is fetching)
            console.log("[Battle] Step 3: Requesting Judge...");            setStatus('Judging Rap...');
            const judgeRes = await fetch('/battle/judge', {
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
            console.log("[Battle] Judge Scores Received.");

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

            // 4. WAIT FOR TTS TO FINISH
            await audioPromise;
            console.log("[Battle] Step 4: Judge and TTS finished.");

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
        console.log(`[TTS] Request: ID=${battleId}, Character=${character}, Silent=${silent}`);

        // 1. Check Cache
        if (audioCache.current[battleId]) {
            console.log(`[TTS] Cache Hit for ${battleId}.`);
            if (!silent) {
                const audio = new Audio(audioCache.current[battleId]);
                setIsPlaying(true);
                audio.onended = () => setIsPlaying(false);
                audio.play();
            }
            return;
        }

        try {
            console.log(`[TTS] Fetching from server...`);
            const res = await fetch('/speak', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, character }),
            });

            if (!res.ok) {
                const errDetails = await res.json().catch(() => ({}));
                console.error(`[TTS] Server 500 error:`, errDetails);
                throw new Error("TTS Failed");
            }

            const blob = await res.blob();
            console.log(`[TTS] Blob Received. Size: ${blob.size} bytes. Type: ${blob.type}`);

            if (blob.size < 500) { 
                console.warn(`[TTS] Very small blob received. Likely an error message in disguise.`);
                throw new Error("Audio generation failed");
            }

            const url = URL.createObjectURL(blob);
            audioCache.current[battleId] = url;
            
            // Mark as ready so the button "pops up"
            setReadyAudioIds(prev => {
                const next = new Set(prev);
                next.add(battleId);
                return next;
            });

            console.log(`[TTS] Audio Ready and Cached for ${battleId}`);

            if (!silent) {
                console.log(`[TTS] Triggering playback.`);
                const audio = new Audio(url);
                setIsPlaying(true);
                audio.onended = () => {
                    console.log(`[TTS] Playback finished.`);
                    setIsPlaying(false);
                };
                await audio.play();
            }
        } catch (e) { 
            console.error("[TTS] Critical Frontend Failure:", e); 
            setIsPlaying(false); 
        }
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

		const stream = mediaRecorder.current.stream;
		if (stream) {
			const tracks = stream.getTracks();
			tracks.forEach(track => track.stop());
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
			turnTime: timeLeft,
			battleMode: battleMode,
			mandatoryWord: wordMode ? targetWord : null
		};
        connectToBattleRoom(roomID, 'CREATE', currentSettings);
    };
  
    const joinMultiplayer = () => {
        if (!battleCode) return alert("Enter a code!");
        connectToBattleRoom(battleCode, 'JOIN');
    };

	const joinQueue = () => {
		setIsQueuing(true);
		setStatus("Searching for opponent...");

		// Connect to Matchmaker
		const queueWs = new WebSocket(getWsUrl('/ws/queue'));

		queueWs.onmessage = (event) => {
			const data = JSON.parse(event.data);
			if (data.type === "MATCH_FOUND") {
				setIsQueuing(false);
				setStatus('Match Found! Connecting...');
				setBattleCode(data.battleId);

				// Automatically start the game with the assigned role
				connectToBattleRoom(data.battleId, data.role, data.config);
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

    const connectToBattleRoom = (roomID, role, settings={}) => {
        if (ws.current) ws.current.close();
        setStatus('Connecting...');
        const socket = new WebSocket(getWsUrl(`/ws/battle/${roomID}`));
        ws.current = socket;

        socket.onopen = async () => {
            const myName = identity?.mc_name || user?.firstName || 'Guest';
            socket.send(JSON.stringify({ 
                type: 'INIT', 
				username: myName, 
				userId: user.id, 
				role: role,
				settings: settings
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
                setIsMyTurn(msg.yourTurn);
				const amIP1 = msg.p1Info.id === user.id;
				const opponentInfo = amIP1 ? msg.p2Info : msg.p1Info;
				setP1Data({ name: opponentInfo.username, id: opponentInfo.id });

				if (msg.battleMode) setBattleMode(msg.battleMode);
                if (msg.rounds) setRounds(msg.rounds);
				if (msg.turnTime) setTimeLeft(msg.turnTime);
                if (msg.mandatoryWord) { setTargetWord(msg.mandatoryWord); setWordMode(true); }

				if (msg.isSpectator) {
					setIsSpectator(true);
					setStatus('Spectating Battle');
				} else {
					setIsSpectator(false);
				}

				setMode('pre_battle');

				if (matchStartTimer.current) clearTimeout(matchStartTimer.current);
                
				matchStartTimer.current = setTimeout(() => {
                    setIsMyTurn(msg.yourTurn);
                    setBattleLog([]);
                    // Ensure we use the turnTime from config, not just hardcoded 30
                    setTimeLeft(msg.turnTime || 30); 
                    setMode('arena');
                }, 5000);
            }

			// --- VOTING PHASE ---
			if (msg.type === 'START_VOTING') {
				setMode('judging...');
				setShowVoting(true);
				setVoteTimer(msg.duration || 30);

				// Visual Countdown for voting
                const interval = setInterval(() => {
                    setVoteTimer(prev => {
                        if (prev <= 1) { clearInterval(interval); return 0; }
                        return prev - 1;
                    });
                }, 1000);
			}

            // --- RECEIVE TURN ---
            if (msg.type === 'NEW_VERSE') {
                // Add opponent verse to log
                setBattleLog(prev => [...prev, { sender: 'opponent', text: msg.verse, audio: msg.audioData }]);
                
				const currentVerses = battleLog.length + 1;
				const maxVerses = rounds * 2;

				if (currentVerses < maxVerses) {
					setIsMyTurn(true);
					setTimeLeft(30);
					setTurnCount(prev => prev + 1);
					hasAutoSubmitted.current = false;
				} else {
					setIsMyTurn(false);
					setStatus('Battle Finished. Judges are looking...')
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
				alert("Opponent forfeited! You win by default");

				setDuelResult({
                    winner: "You (Default)",
                    p1_verse: "Opponent fled the battle.",
                    p2_verse: "VICTORY BY FORFEIT",
                    scores: { 
                        comment: "The opponent disconnected.",
                        p1: { total: 10, rhyme: 0, flow: 0, bars: 0, aggression: 0 },
                        p2: { total: 0, rhyme: 0, flow: 0, bars: 0, aggression: 0 }
                    }
                });

                setMode('result');
				ws.current.close();
            }

            if (msg.type === 'RESULT') {
                setDuelResult(msg.result);
                setMode('result');
				setShowVoting(false);
				
				if (user) {
					fetchStats(user.id);
				}

				saveHistory({
					...msg.result,
					timestamp: Date.now(),
					myPoints: msg.result.pointsEarned
				})
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

	const retryJudging = async () => {
        if (!lastBattle) return;
        
        setIsLoading(true);
        setStatus('Retrying Judge...');
        
        try {
            const token = await getToken();
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

            // Re-send the EXACT same verses to the judge endpoint
            const judgeRes = await fetch('/battle/judge', {
                method: 'POST',
                headers,
                body: JSON.stringify({ 
                    userRap: lastBattle.userRap, 
                    aiVerse: lastBattle.aiVerse, 
                    opponent: { name: lastBattle.opponent, points: 10 }, // Basic fallback if opponent object missing
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
            <SignedOut>
                {duelResult?.scores?.comment && (
                    <Text c="dimmed" mt="md" ta="center" fs="italic">"{duelResult.scores.comment}"</Text>
                )}

                {mode === 'result' && duelResult ? (
                    <Container size="md" py="xl">
                        <Stack align="center">
                            <Card shadow="xl" padding="xl" withBorder style={{ width: '100%' }}>
                                <Stack align="center">
                                    <Badge color="red" size="lg">REPLAY MODE</Badge>
                                    <Title order={2}>Winner: {duelResult.winner}</Title>
                                    
                                    <Grid style={{ width: '100%' }} gutter="lg">
                                        <Grid.Col span={{ base: 12, md: 6 }}>
                                            <Card bg="blue.1" padding="sm" radius="md">
                                                <Text size="xs" fw={700} c="dimmed">PLAYER 1</Text>
                                                <Text size="sm" style={{ fontStyle: 'italic', whiteSpace: 'pre-line' }}>"{duelResult.p1_verse}"</Text>
                                            </Card>
                                        </Grid.Col>
                                        <Grid.Col span={{ base: 12, md: 6 }}>
                                            <Card bg="red.1" padding="sm" radius="md">
                                                <Text size="xs" fw={700} c="dimmed">PLAYER 2</Text>
                                                <Text size="sm" style={{ fontStyle: 'italic', whiteSpace: 'pre-line' }}>"{duelResult.p2_verse}"</Text>
                                            </Card>
                                        </Grid.Col>
                                    </Grid>
                                    
                                    <Text c="dimmed" mt="md" ta="center" fs="italic">"{duelResult.scores?.comment}"</Text>
                                    
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
                                                <Switch 
													label="Word Challenge" 
													checked={wordMode} 
													onChange={(e) => {
														const isOn = e.currentTarget.checked;
														setWordMode(isOn); 
														if (isOn) refreshWord();}}
													size="md"
												/>
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
                                            
											{/* HEADER: SHOW RESULT OR LOADING */}
											<Group justify="space-between" mb="sm">
                                                <Title order={4}>Results</Title>
                                                {lastBattle.scores ? (
                                                    <Badge color={lastBattle.result === 'win' ? 'green' : 'red'} size="lg">
                                                        {lastBattle.result.toUpperCase()}
                                                    </Badge>
                                                ) : (
                                                    <Badge color="orange" size="lg">JUDGING...</Badge>
                                                )}
                                            </Group>

                                            {/* SECTION 1: SCOREBOARD */}
											{lastBattle.scores ? (
												<>
													<Grid>
														{/* USER SCORE CARD */}
														<Grid.Col span={6}>
															<Card bg="white" withBorder h="100%">
																<Text size="xs" c="dimmed" fw={700}>YOU ({identity?.mc_name || 'User'})</Text>
																<Title order={2} c="blue">
																	{lastBattle.scores.user.total || 0}
																</Title>
																
																<Stack gap={2} mt={5}>
																	<Group justify="space-between">
																		<Text size="xs">Rhyme:</Text>
																		<Text size="xs" fw={700}>{lastBattle.scores.user.rhyme || 0}</Text>
																	</Group>
																	<Group justify="space-between">
																		<Text size="xs">Flow:</Text>
																		<Text size="xs" fw={700}>{lastBattle.scores.user.flow || 0}</Text>
																	</Group>
																	<Group justify="space-between">
																		<Text size="xs">Roasts:</Text>
																		<Text size="xs" fw={700}>{lastBattle.scores.user.insults || 0}</Text>
																	</Group>
																	<Group justify="space-between">
																		<Text size="xs">Creative:</Text>
																		<Text size="xs" fw={700}>{lastBattle.scores.user.creativity || 0}</Text>
																	</Group>
																	
																	{/* Word Bonus Display */}
																	{lastBattle.scores.user.word_bonus > 0 && (
																		<Group justify="space-between">
																			<Text size="xs" c="orange" fw={700}>Word Bonus:</Text>
																			<Text size="xs" c="orange" fw={700}>+10</Text>
																		</Group>
																	)}
																</Stack>
															</Card>
														</Grid.Col>

														{/* AI SCORE CARD */}
														<Grid.Col span={6}>
															<Card bg="white" withBorder h="100%">
																<Text size="xs" c="dimmed" fw={700}>{lastBattle.opponent?.toUpperCase() || "AI"}</Text>
																<Title order={2} c="red">
																	{lastBattle.scores.ai.total || 0}
																</Title>
																
																<Stack gap={2} mt={5}>
																	<Group justify="space-between">
																		<Text size="xs">Rhyme:</Text>
																		<Text size="xs" fw={700}>{lastBattle.scores.ai.rhyme || 0}</Text>
																	</Group>
																	<Group justify="space-between">
																		<Text size="xs">Flow:</Text>
																		<Text size="xs" fw={700}>{lastBattle.scores.ai.flow || 0}</Text>
																	</Group>
																	<Group justify="space-between">
																		<Text size="xs">Roasts:</Text>
																		<Text size="xs" fw={700}>{lastBattle.scores.ai.insults || 0}</Text>
																	</Group>
																	<Group justify="space-between">
																		<Text size="xs">Creative:</Text>
																		<Text size="xs" fw={700}>{lastBattle.scores.ai.creativity || 0}</Text>
																	</Group>
																</Stack>
															</Card>
														</Grid.Col>
													</Grid>

													{/* JUDGE'S COMMENT */}
													<Text size="sm" mt="md" fs="italic" c="dimmed" ta="center">
														"{lastBattle.scores.comment}"
													</Text>

													{/* RETRY BUTTON */}
													{(lastBattle.scores.user.total === 0 && lastBattle.scores.ai.total === 0) && (
														<Center mt="md">
															<Button 
																color="orange" 
																variant="light" 
																leftSection={<IconRefresh size={16} />} 
																onClick={retryJudging}
																loading={isLoading}
															>
																Retry Judging
															</Button>
														</Center>
													)}
												</>
											) : (
												/* JUDGING SKELETON*/
												<Card bg="white" withBorder p="md">
													<Stack align="center" gap="md">
														<Loader size="md" type="bars" color="orange" />
														<Text c="dimmed" size="sm" fs="italic">The judges are reviewing the transcript...</Text>
														<Group style={{ width: '100%' }}>
															<Skeleton height={8} radius="xl" width="60%" />
															<Skeleton height={8} radius="xl" width="80%" />
														</Group>
													</Stack>
												</Card>
											)}
                                            
                                            <Divider my="md" />

                                            {/* SECTION 2: VERSES */}
                                            <VerseDisplay
                                                p1Verse={lastBattle.userRap}
                                                p2Verse={lastBattle.aiVerse}
                                                p1Title="YOUR VERSE"
                                                p2Title="AI RESPONSE"
                                                onPlayAudio={() => loadAndPlayAudio('last-battle', lastBattle.aiVerse, opponent)} 
                                                playDisabled={isPlaying}
                                                isReady={readyAudioIds.has('last-battle')} // <--- Check the state here
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

											{/* ROUND SELECTOR */}
                                            <Group>
                                                <Text size="sm" fw={700}>Rounds:</Text>
                                                <SegmentedControl 
                                                    value={String(rounds)} 
                                                    onChange={(val) => setRounds(Number(val))} 
                                                    data={[
                                                        { label: '1', value: '1' },
                                                        { label: '2', value: '2' },
                                                        { label: '3', value: '3' }
                                                    ]} 
                                                />
                                            </Group>

                                            {/* TIME SELECTOR */}
                                            <Group>
                                                <Text size="sm" fw={700}>Time:</Text>
                                                <SegmentedControl 
                                                    value={String(timeLeft)} // We'll reuse timeLeft state for the setting
                                                    onChange={(val) => setTimeLeft(Number(val))} 
                                                    data={[
                                                        { label: '30s', value: '30' },
                                                        { label: '45s', value: '45' },
                                                        { label: '60s', value: '60' }
                                                    ]} 
                                                />
                                            </Group>

											{/* MODE SELECTOR */}
                                            <SegmentedControl 
                                                value={battleMode} 
                                                onChange={setBattleMode} 
                                                data={[{ label: 'Text Mode', value: 'text' }, { label: 'Audio Mode', value: 'audio' }]} 
                                            />
                                            
                                            <Switch 
													label="Word Challenge" 
													checked={wordMode} 
													onChange={(e) => {
														const isOn = e.currentTarget.checked;
														setWordMode(isOn); 
														if (isOn) refreshWord();}}
													size="md"
												/>
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

								{mode === 'pre_battle' && (
                                    <PreBattleCard 
                                        user={user}
                                        identity={identity} // <--- ADD THIS PROP
                                        opponent={p1Data} 
                                        avatarTs={avatarTs}
                                        config={{
                                            rounds: rounds,
                                            turnTime: 30, 
                                            battleMode: battleMode,
                                            mandatoryWord: wordMode ? targetWord : null
                                        }}
                                    />
                                )}

                                {mode === 'arena' && (
                                    <Card shadow="sm" padding="lg" withBorder>
                                        <Stack gap="md">
                                            <Group justify="space-between">
                                                <Group>
                                                    <Avatar src={p1Data?.id ? `/avatar/${user.id}` : null} radius="xl" color="blue">{p1Data?.name?.[0]}</Avatar>
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
												<div ref={chatEndRef}/>
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

								{mode === 'judging...' && (
                                    <Card shadow="sm" padding="xl" withBorder>
                                        <Stack align="center" gap="xl" py="xl">
                                            {/* Animated Bars Loader */}
                                            <Loader size="xl" type="bars" color="orange" />
                                            
                                            <Stack align="center" gap={5}>
                                                <Title order={2}>Judges Deliberating</Title>
                                                <Text c="dimmed" fs="italic">Analyzing rhymes, flow, and aggression...</Text>
                                            </Stack>

                                            <Card bg="gray.0" p="md" radius="md" style={{ width: '100%' }}>
                                                <Stack gap="xs">
                                                    <Group justify="space-between">
                                                        <Text size="sm">Rhyme Scheme</Text>
                                                        <Loader size="xs" type="dots" />
                                                    </Group>
                                                    <Group justify="space-between">
                                                        <Text size="sm">Flow Check</Text>
                                                        <Loader size="xs" type="dots" />
                                                    </Group>
                                                    <Group justify="space-between">
                                                        <Text size="sm">Roast Detection</Text>
                                                        <Loader size="xs" type="dots" />
                                                    </Group>
                                                </Stack>
                                            </Card>
                                        </Stack>
                                    </Card>
                                )}

								{showVoting && (
									<Modal 
										opened={true} 
										onClose={() => {}} 
										withCloseButton={false} 
										title={<Group><IconSwords/><Text fw={700}>WHO WON?</Text></Group>}
										centered
									>
										<Stack align="center">
											<Text size="xl" fw={900} c="orange">{voteTimer}s remaining</Text>
											<Text c="dimmed" size="sm" ta="center">Cast your vote to influence the final score!</Text>

											{!hasVoted ? (
												<Group grow style={{ width: '100%' }}>
													<Button 
														size="xl" color="blue" variant="light"
														onClick={() => { ws.current.send(JSON.stringify({ type: 'VOTE', vote: 'p1' })); setHasVoted(true); }}
													>
														{p1Data?.name || "Player 1"}
													</Button>
													<Button 
														size="xl" color="red" variant="light"
														onClick={() => { ws.current.send(JSON.stringify({ type: 'VOTE', vote: 'p2' })); setHasVoted(true); }}
													>
														{p1Data?.name ? "Player 2" : "Player 2"} 
													</Button>
												</Group>
											) : (
												<Card bg="green.1" w="100%" ta="center" p="lg">
													<Title order={3} c="green">VOTE CAST</Title>
												</Card>
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
                                                    p1Title="PLAYER 1"
                                                    p2Title="PLAYER 2"
                                                />
                                            </div>

                                            {/* DETAILED SCOREBOARD FOR PVP */}
                                            <Grid style={{ width: '100%' }} mt="md">
                                                {/* PLAYER 1 SCORES */}
                                                <Grid.Col span={6}>
                                                    <Card bg="blue.0" withBorder h="100%">
                                                        <Text size="xs" c="dimmed" fw={700}>PLAYER 1</Text>
                                                        <Title order={2} c="blue">{duelResult.scores.p1?.total || duelResult.scores.p1_score || 0}</Title>
                                                        
                                                        {duelResult.scores.p1?.rhyme !== undefined && (
                                                            <Stack gap={2} mt={5}>
                                                                <Group justify="space-between"><Text size="xs">Rhyme:</Text><Text size="xs" fw={700}>{duelResult.scores.p1.rhyme}</Text></Group>
                                                                <Group justify="space-between"><Text size="xs">Flow:</Text><Text size="xs" fw={700}>{duelResult.scores.p1.flow}</Text></Group>
                                                                <Group justify="space-between"><Text size="xs">Bars:</Text><Text size="xs" fw={700}>{duelResult.scores.p1.bars}</Text></Group>
                                                                <Group justify="space-between"><Text size="xs">Aggro:</Text><Text size="xs" fw={700}>{duelResult.scores.p1.aggression}</Text></Group>
																<Group justify="space-between">
																	<Text size="xs" fw={900} c="grape">Audience:</Text>
																	<Text size="xs" fw={900} c="grape">+{duelResult.scores?.p1?.audience || 0}</Text>
																</Group>
                                                            </Stack>
                                                        )}
                                                    </Card>
                                                </Grid.Col>

                                                {/* PLAYER 2 SCORES */}
                                                <Grid.Col span={6}>
                                                    <Card bg="red.0" withBorder h="100%">
                                                        <Text size="xs" c="dimmed" fw={700}>PLAYER 2</Text>
                                                        <Title order={2} c="red">{duelResult.scores.p2?.total || duelResult.scores.p2_score || 0}</Title>
                                                        
                                                        {duelResult.scores.p2?.rhyme !== undefined && (
                                                            <Stack gap={2} mt={5}>
                                                                <Group justify="space-between"><Text size="xs">Rhyme:</Text><Text size="xs" fw={700}>{duelResult.scores.p2.rhyme}</Text></Group>
                                                                <Group justify="space-between"><Text size="xs">Flow:</Text><Text size="xs" fw={700}>{duelResult.scores.p2.flow}</Text></Group>
                                                                <Group justify="space-between"><Text size="xs">Bars:</Text><Text size="xs" fw={700}>{duelResult.scores.p2.bars}</Text></Group>
                                                                <Group justify="space-between"><Text size="xs">Aggro:</Text><Text size="xs" fw={700}>{duelResult.scores.p2.aggression}</Text></Group>
                                                            </Stack>
                                                        )}
                                                    </Card>
                                                </Grid.Col>
                                            </Grid>
                                            
                                            <Text c="dimmed" mt="md" ta="center" fs="italic">"{duelResult.scores.comment}"</Text>
                                            
                                            <Group justify="center" mt="lg">
											<Button onClick={() => { setMode("menu"); setInput(''); }}>Back to Menu</Button>
											<Button 
												variant="light" 
												leftSection={<IconShare size={16}/>} 
												onClick={shareReplay}
											>
												Share Replay
											</Button>
										</Group>
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
										<Stack gap="md">
											{history.map((item) => (
												<HistoryItem 
													key={item.id} 
													item={item} 
													playAudio={loadAndPlayAudio} 
													identity={identity} // <--- CRITICAL: Do not forget this!
												/>
											))}
										</Stack>
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