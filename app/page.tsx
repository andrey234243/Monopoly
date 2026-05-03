'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BOARD_CELLS } from '@/lib/board-data';
import { GameEngine } from '@/lib/game-engine';
import { NetworkManager } from '@/lib/network-manager';
import { GameState, Player, CellType } from '@/types/game';

// Custom Hook to manage dice animation
function useFastDiceRoller(lastRoll: [number, number] | null | undefined, turnStatus?: string, onComplete?: () => void) {
  const [animatedRoll, setAnimatedRoll] = useState<[number, number]>([1, 1]);

  const latestOnComplete = useRef(onComplete);
  useEffect(() => {
     latestOnComplete.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!lastRoll || turnStatus !== 'ROLLING') return;

    let iterations = 0;
    const maxIterations = 10;
    const interval = setInterval(() => {
      setAnimatedRoll([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
      iterations++;
      if (iterations >= maxIterations) {
        clearInterval(interval);
        if (latestOnComplete.current) latestOnComplete.current();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [lastRoll, turnStatus]);

  const displayRoll = turnStatus === 'ROLLING' ? animatedRoll : (lastRoll || [1, 1]);
  return { displayRoll };
}

export default function GamePage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const netRef = useRef<NetworkManager | null>(null);

  const [peerId, setPeerId] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [status, setStatus] = useState<string>('Инициализация...');
  const [isJoined, setIsJoined] = useState(false);
  const [localPlayerId, setLocalPlayerId] = useState<string>('');
  const [localPlayerName, setLocalPlayerName] = useState<string>('');
  const [localColor, setLocalColor] = useState<string>('#3390EC');
  const [recentRooms, setRecentRooms] = useState<{id: string, name: string}[]>([]);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [publicRooms, setPublicRooms] = useState<{id: string, name: string, hostName: string, playerCount: number, maxPlayers: number, isStarted: boolean}[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [localAvatar, setLocalAvatar] = useState<string>('https://api.dicebear.com/7.x/pixel-art/svg?seed=Felix');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<'stats' | 'settings' | 'friends'>('stats');
  const [friendSearchText, setFriendSearchText] = useState('');
  const [friendsData, setFriendsData] = useState<any[]>([]);
  const [friendRequestsData, setFriendRequestsData] = useState<any[]>([]);
  const [isSearchingFriend, setIsSearchingFriend] = useState(false);
  const [friendSearchResults, setFriendSearchResults] = useState<any[]>([]);
  const [roomSettings, setRoomSettings] = useState({
    roomName: 'Офис Магната',
    maxPlayers: 4,
    initialBalance: 1500,
    password: ''
  });
  const [joiningPassword, setJoiningPassword] = useState('');

  const [zoomedCell, setZoomedCell] = useState<number | null>(null);
  const [isSurrenderModalOpen, setIsSurrenderModalOpen] = useState(false);
  const [isRoomSettingsOpen, setIsRoomSettingsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isCloudRestoreOpen, setIsCloudRestoreOpen] = useState(false);
  const [cloudRestoreId, setCloudRestoreId] = useState('');
  const [viewingPlayerProfileId, setViewingPlayerProfileId] = useState<string | null>(null);
  const [viewingPlayerProfileData, setViewingPlayerProfileData] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<{ gamesPlayed: number, wins: number, totalWealthPeak: number, totalRentsCollected: number } | null>(null);
  const [hasSavedProfileStats, setHasSavedProfileStats] = useState(false);
  const [advancedTradeSetup, setAdvancedTradeSetup] = useState<{ active: boolean, targetId: string, offerCells: number[], requestCells: number[], offerMoney: string, requestMoney: string } | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  const isSoundEnabledRef = useRef(isSoundEnabled);

  useEffect(() => {
    isSoundEnabledRef.current = isSoundEnabled;
  }, [isSoundEnabled]);

  const prevChatMessagesLength = useRef(0);
  const lastChatMsgId = useRef<string | null>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
    
    const messages = gameState?.chatMessages || [];
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.id !== lastChatMsgId.current && lastMsg.senderId !== localPlayerId && isSoundEnabledRef.current) {
         try {
             const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
             audio.volume = 0.4;
             audio.play().catch(e => console.log('Audio play failed', e));
         } catch(e){}
      }
      lastChatMsgId.current = lastMsg.id;
    }
    prevChatMessagesLength.current = messages.length;
  }, [gameState?.chatMessages, localPlayerId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.ready();
      tg.expand();
      // Set header color to match our theme
      tg.setHeaderColor('#1C1C1D');
      tg.setBackgroundColor('#1C1C1D');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initProfile = async () => {
        let tmaName = '';
        let tmaAvatar = '';
        
        try {
           let user = null;
           // Try SDK
           try {
              const WebApp = (await import('@twa-dev/sdk')).default;
              if (WebApp.initDataUnsafe?.user) user = WebApp.initDataUnsafe.user;
           } catch(e){}
           
           // Fallback to global
           if (!user && typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initDataUnsafe?.user) {
              user = (window as any).Telegram.WebApp.initDataUnsafe.user;
           }
           
           if (user) {
              tmaName = user.first_name || user.username || '';
              if (user.photo_url) tmaAvatar = user.photo_url;
           }
        } catch(e){}

        let localId = localStorage.getItem('tycoon_id');
        if (!localId) {
          localId = Math.random().toString(36).substring(7);
          localStorage.setItem('tycoon_id', localId!);
        }
        setLocalPlayerId(localId!);

        const savedName = localStorage.getItem('tycoon_name');
        const finalName = tmaName || savedName || `Игрок`;
        setLocalPlayerName(finalName);
        if (tmaName) localStorage.setItem('tycoon_name', tmaName);

        const savedColor = localStorage.getItem('tycoon_color');
        setLocalColor(savedColor || '#3390EC');

        const savedAvatar = localStorage.getItem('tycoon_avatar');
        const finalAvatar = tmaAvatar || savedAvatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${localId}`;
        setLocalAvatar(finalAvatar);
        if (tmaAvatar) localStorage.setItem('tycoon_avatar', tmaAvatar);

        const savedRooms = localStorage.getItem('tycoon_recent_rooms');
        if (savedRooms) setRecentRooms(JSON.parse(savedRooms));
    };

    initProfile();
  }, []);

  // Lobby Sync
  useEffect(() => {
    const handleUnload = () => {
      const isHost = engineRef.current?.getState().players.find(p => p.id === localPlayerId)?.isHost;
      if (isHost && peerId && engineRef.current && !engineRef.current.getState().isStarted) {
        // We can't await here, but we can try a beacon or a simple fetch
        navigator.sendBeacon('/api/rooms', JSON.stringify({ id: peerId, _method: 'DELETE' }));
        // Note: DELETE method is not supported by sendBeacon usually, so we might need to handle it in the API as a POST with a flag or just hope for the best.
        // For simplicity in this environment, I'll stick to the explicit exitRoom in UI.
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [peerId, localPlayerId]);

  useEffect(() => {
    if (isJoined || typeof window === 'undefined') return;

    const fetchRooms = async () => {
      try {
        const res = await fetch('/api/rooms');
        const data = await res.json();
        setPublicRooms(data);
      } catch (e) {
        console.error('Failed to fetch rooms', e);
      }
    };

    const fetchMatches = async () => {
       try {
           const { collection, query, orderBy, limit, getDocs } = await import('firebase/firestore');
           const { db } = await import('@/lib/firebase');
           const q = query(collection(db, 'matches'), orderBy('createdAt', 'desc'), limit(20));
           const snap = await getDocs(q);
           const mDates = snap.docs.map(d => d.data());
           setRecentMatches(mDates);
       } catch (e) {
           console.error('Failed to fetch matches', e);
       }
    };

    fetchRooms();
    fetchMatches();
    const interval = setInterval(fetchRooms, 10000);
    return () => clearInterval(interval);
  }, [isJoined]);

  // Host Ping
  useEffect(() => {
    const isHost = gameState?.players.find(p => p.id === localPlayerId)?.isHost;
    if (!isHost || !peerId || !gameState) return;

    const pingRoom = async () => {
      try {
        await fetch('/api/rooms', {
          method: 'POST',
          body: JSON.stringify({
            id: peerId,
            name: gameState.roomName || 'Без названия',
            hostName: localPlayerName,
            playerCount: gameState.players.length,
            maxPlayers: gameState.maxPlayers || 4,
            isStarted: gameState.isStarted
          })
        });
      } catch (e) {
        console.error('Failed to ping room', e);
      }
    };

    pingRoom();
    const interval = setInterval(pingRoom, 15000);
    return () => clearInterval(interval);
  }, [gameState, peerId, localPlayerId, localPlayerName]);

  useEffect(() => {
    if (typeof window === 'undefined' || !localPlayerId) return;

    const initTMA = async () => {
      try {
        const WebApp = (await import('@twa-dev/sdk')).default;
        WebApp.ready();
        WebApp.expand();
        WebApp.headerColor = '#1C1C1D';
        WebApp.backgroundColor = '#1C1C1D';
      } catch (e) {
        console.error('Failed to init TMA SDK', e);
      }
      
      try {
        const { signInAnonymously } = await import('firebase/auth');
        const { auth } = await import('@/lib/firebase');
        await signInAnonymously(auth);
      } catch (e: any) {
        if (e.code === 'auth/admin-restricted-operation') {
           const msg = 'FIREBASE SETUP REQUIRED: Please enable "Anonymous" provider in Firebase Console -> Authentication -> Sign-in methods.';
           console.error(msg);
           setStatus('ОШИБКА: Включите Anonymous Auth в Firebase Console!');
        } else {
           console.error('Firebase Auth Error:', e);
           setStatus('Ошибка авторизации');
        }
      }
    };

    initTMA();

    const notifyError = async (errorText: string) => {
        try {
            const WebApp = (await import('@twa-dev/sdk')).default;
            if (WebApp.isVersionAtLeast('6.2')) {
                WebApp.showAlert(errorText);
            } else {
                alert(errorText);
            }
        } catch {
            alert(errorText);
        }
    };

    const network = new NetworkManager(
      (msg) => {
        if (msg.type === 'GAME_STATE') {
          const currentVersion = engineRef.current?.getState().version || 0;
          if (msg.payload.version > currentVersion) {
            engineRef.current?.setStateSilently(msg.payload);
            setGameState(msg.payload);
            
            const isHost = engineRef.current?.getState().players.find(p => p.id === localPlayerId)?.isHost;
            if (isHost && msg.senderId !== localPlayerId) {
              netRef.current?.broadcast('GAME_STATE', msg.payload, localPlayerId, msg.senderId);
            }
          }
        } else if (msg.type === 'JOIN') {
          const engine = engineRef.current;
          const state = engine?.getState();
          if (engine && state && state.players.some(p => p.id === localPlayerId && p.isHost)) {
            // Check password
            if (state.roomPassword && msg.payload.password !== state.roomPassword) {
               netRef.current?.broadcast('AUTH_ERROR', 'Неверный пароль', localPlayerId);
               return;
            }
            engine.addPlayer(msg.payload.player);
            // After joining, host sends full state WHICH INCLUDES chat messages
            netRef.current?.broadcast('GAME_STATE', engine.getState(), localPlayerId);
          }
        } else if (msg.type === 'CHAT') {
           const engine = engineRef.current;
           const isHost = engine?.getState().players.find(p => p.id === localPlayerId)?.isHost;
           
           engine?.addChatMessage('player', msg.payload.senderName, msg.payload.text, msg.payload.senderId, msg.payload.id);
           if (isHost && msg.senderId !== localPlayerId) {
             // Host relays to other clients, excluding original sender
             netRef.current?.broadcast('CHAT', msg.payload, localPlayerId, msg.senderId);
           }
        } else if (msg.type === 'AUTH_ERROR') {
           setStatus(`ERROR:${msg.payload}`);
           notifyError(msg.payload);
           setIsJoined(false);
           engineRef.current = null;
        }
      },
      (statusMsg) => {
        setStatus(statusMsg);
        if (statusMsg.startsWith('PEER_OPEN:')) {
          setPeerId(statusMsg.split(':')[1]);
        }
        if (statusMsg.startsWith('ERROR:')) {
            const errType = statusMsg.split(':')[1];
            let errorText = 'Произошла ошибка связи';
            if (errType === 'NODE_NOT_FOUND') errorText = 'Узел не найден. Проверьте ID комнаты.';
            else if (errType === 'NETWORK_FAILURE') errorText = 'Сбой сети. Проверьте интернет.';
            else if (errType === 'SERVER_OFFLINE') errorText = 'Сервер сигнализации недоступен.';
            else if (errType === 'DISCONNECTED') errorText = 'Связь с сервером потеряна. Попытка переподключения...';
            
            notifyError(errorText);
            if (errType !== 'DISCONNECTED') setStatus('Готов к подключению');
        }
        if (statusMsg === 'DISCONNECTED_FROM_SERVER') {
            setStatus('Переподключение к серверу...');
        }
        if (statusMsg.startsWith('CONNECTED:')) {
          setIsJoined(true);
          const engine = engineRef.current;
          if (engine && !engine.getState().players.find(p => p.id === localPlayerId)?.isHost) {
             const p: Player = { 
                id: localPlayerId, 
                name: localPlayerName, 
                position: 0, 
                balance: 1500, 
                color: localColor, 
                avatarUrl: localAvatar,
                isHost: false 
              };
              netRef.current?.broadcast('JOIN', { player: p, password: joiningPassword }, localPlayerId);
          }
        }
      }
    );

    network.init().catch(console.error);
    netRef.current = network;

    return () => {
      network.disconnect();
    };
  }, [localPlayerId]); // Only restart if ID changes (which shouldn't happen)

    const onEngineStateChange = async (state: GameState, previousState?: GameState) => {
      setGameState(state);
      
      const wasLocalTurn = previousState?.currentPlayerId === localPlayerId;
      const isLocalTurn = state.currentPlayerId === localPlayerId;
      const isHost = engineRef.current?.getState().players.find(p => p.id === localPlayerId)?.isHost;
      
      // Broadcast if it IS our turn, WAS our turn, or we are the host syncing.
      if (isLocalTurn || wasLocalTurn || isHost) {
        netRef.current?.broadcast('GAME_STATE', state, localPlayerId);
      }
      
      // FIREBASE CLOUD SAVE (Host Only)
      if (isHost && isJoined) {
          try {
             const { doc, setDoc } = await import('firebase/firestore');
             const { db, auth } = await import('@/lib/firebase');
             if (auth.currentUser) {
                 await setDoc(doc(db, 'rooms', peerId || roomId), {
                    id: peerId || roomId,
                    name: state.roomName || 'Room',
                    hostId: auth.currentUser.uid,
                    gameState: JSON.stringify(state),
                    createdAt: state.isStarted ? +(new Date()) : +(new Date()),
                    updatedAt: +(new Date())
                 }, { merge: true });
             }
          } catch (e) {
             console.error("Cloud save failed", e);
          }
      }
    };

    // BOT LOGIC (Host solely responsible for bots)
    useEffect(() => {
       if (!gameState || !gameState.isStarted || !isJoined || !engineRef.current) return;
       const isHost = gameState.players.find(p => p.id === localPlayerId)?.isHost;
       if (!isHost) return;

       const engine = engineRef.current;

       // BOT TRADE RESPONSE logic
       if (gameState.pendingTrade) {
          const targetId = gameState.pendingTrade.toId;
          const target = gameState.players.find(p => p.id === targetId);
          if (target?.isBot) {
             const tradeId = gameState.pendingTrade.id || Math.random().toString();
             if ((window as any).lastProcessedTrade !== tradeId) {
                (window as any).lastProcessedTrade = tradeId;
                setTimeout(() => {
                   const s = engine.getState();
                   if (!s.pendingTrade) return;
                   
                   const trade = s.pendingTrade;
                   let botEvaluation = 0;
                   
                   // Add value for what bot gets
                   trade.offerCellIds.forEach((id: number) => {
                       const cell = s.cells[id];
                       botEvaluation += (cell.price || 100) * 1.5;
                   });
                   botEvaluation += trade.offerMoney;
                   
                   // Subtract value for what bot gives
                   trade.requestCellIds.forEach((id: number) => {
                       const cell = s.cells[id];
                       botEvaluation -= (cell.price || 100) * 1.5;
                   });
                   botEvaluation -= trade.requestMoney;
                   
                   if (target.balance >= trade.requestMoney && botEvaluation >= 0) {
                      engine.acceptTrade();
                      engine.addChatMessage('system', 'Бот', `${target.name} принял предложение об обмене.`);
                   } else {
                      engine.rejectTrade();
                      engine.addChatMessage('system', 'Бот', `${target.name} отклонил предложение об обмене.`);
                   }
                }, 2000);
             }
          }
       }

       const tStatus = gameState.turnStatus;
       
       if (tStatus === 'AUCTION') {
          const auc = gameState.activeAuction;
          if (!auc) return;
          const bidderId = auc.bidders[auc.turnIndex];
          const bidder = gameState.players.find(p => p.id === bidderId);
          if (bidder?.isBot) {
             const aucKey = `auc_${auc.cellId}_${auc.currentBid}_${auc.turnIndex}_${gameState.version}`;
             if ((window as any).lastAucKey === aucKey) return;
             (window as any).lastAucKey = aucKey;

             setTimeout(() => {
                const s = engine.getState();
                const currentAuc = s.activeAuction;
                if (!currentAuc || currentAuc.bidders[currentAuc.turnIndex] !== bidderId) return;

                const cell = s.cells[currentAuc.cellId];
                if (bidder.balance > currentAuc.currentBid + 50 && (currentAuc.currentBid < (cell.price || 0) * (bidder.botStrategy === 'AGGRESSIVE' ? 1.5 : 0.8))) {
                   engine.auctionBid(bidder.id, currentAuc.currentBid + 10);
                } else {
                   engine.auctionPass(bidder.id);
                }
             }, 1000);
          }
          return;
       }

       const player = gameState.players.find(p => p.id === gameState.currentPlayerId);
       if (player?.isBot) {
          const actionKey = `bot_${player.id}_${tStatus}_${gameState.currentAction?.cellId || 'no_action'}_${gameState.version}`;
          if ((window as any).lastActionKey === actionKey) return;
          (window as any).lastActionKey = actionKey;

          if (tStatus === 'WAITING_ROLL') {
             setTimeout(() => {
                const s = engine.getState();
                if (s.turnStatus !== 'WAITING_ROLL' || s.currentPlayerId !== player.id) return;

                engine.rollDice();
             }, 1500);
          } else if (tStatus === 'ACTION_REQUIRED' && gameState.currentAction?.type === 'BUY') {
             setTimeout(() => {
                const s = engine.getState();
                if (s.turnStatus !== 'ACTION_REQUIRED' || s.currentPlayerId !== player.id) return;

                const cell = s.cells[s.currentAction!.cellId!];
                if (player.balance >= (cell.price || 0) + (player.botStrategy === 'ECONOMICAL' ? 300 : 50)) {
                   engine.buyAsset();
                } else {
                   engine.skipBuy();
                }
             }, 1500);
          } else if (tStatus === 'END_TURN') {
             setTimeout(() => {
                const s = engine.getState();
                if (s.turnStatus !== 'END_TURN' || s.currentPlayerId !== player.id) return;

                if (player.balance < 0) {
                   engine.surrender(player.id);
                } else {
                   // Smarter upgrades
                   const myAssets = s.cells.filter(c => c.ownerId === player.id);
                   const mortgaged = myAssets.filter(c => c.isMortgaged);
                   
                   // Unmortgage if wealthy
                   if (mortgaged.length > 0 && player.balance > (mortgaged[0].price || 100) * 1.5) {
                      engine.unmortgageAsset(mortgaged[0].id);
                   }

                   // Upgrade if monopoly owned
                   const upgradable = s.cells.filter(c => c.ownerId === player.id && (c.upgradeLevel || 0) < 2);
                   const colorToUpgrade = upgradable.find(u => {
                       const set = s.cells.filter(c => c.type === CellType.ASSET && c.color === u.color);
                       return set.every(c => c.ownerId === player.id && !c.isMortgaged);
                   });

                   if (colorToUpgrade && player.balance > 400) {
                      engine.upgradeAsset(colorToUpgrade.id);
                   }

                   engine.nextTurn();
                }
             }, 1000);
          }
       }
    }, [gameState?.turnStatus, gameState?.currentPlayerId, gameState?.activeAuction?.turnIndex, gameState?.pendingTrade]);

    // Save profile stats on game over
    useEffect(() => {
       if (gameState?.turnStatus === 'GAME_OVER' && gameState.isStarted && !hasSavedProfileStats) {
          const saveStats = async () => {
             setHasSavedProfileStats(true);
             try {
                const { doc, getDoc, setDoc } = await import('firebase/firestore');
                const { db, auth } = await import('@/lib/firebase');
                if (!auth.currentUser) return;
                
                const userRef = doc(db, 'users', auth.currentUser.uid);
                const userSnap = await getDoc(userRef);
                
                let currentProfile: any = { gamesPlayed: 0, wins: 0, totalWealthPeak: 0, totalRentsCollected: 0 };
                if (userSnap.exists()) {
                   currentProfile = userSnap.data();
                }
                
                const p = gameState.players.find(p => p.id === localPlayerId);
                const isWinner = gameState.winnerId === localPlayerId;
                
                let myWealth = 0;
                if (p) {
                   myWealth = p.balance + gameState.cells.filter(c => c.ownerId === p.id).reduce((sum, c) => sum + (c.price || 0), 0);
                }
                
                const myCollectedRent = gameState.cells.filter(c => c.ownerId === localPlayerId).reduce((sum, c) => sum + (gameState.stats?.cellRents[c.id] || 0), 0);

                await setDoc(userRef, {
                   id: auth.currentUser.uid,
                   gamesPlayed: currentProfile.gamesPlayed + 1,
                   wins: currentProfile.wins + (isWinner ? 1 : 0),
                   totalWealthPeak: Math.max(currentProfile.totalWealthPeak || 0, myWealth),
                   totalRentsCollected: (currentProfile.totalRentsCollected || 0) + myCollectedRent,
                   createdAt: currentProfile.createdAt || +(new Date()),
                   updatedAt: +(new Date())
                }, { merge: true });

                const isHost = gameState.players.find(p => p.id === localPlayerId)?.isHost;
                if (isHost && peerId) {
                   const matchRef = doc(db, 'matches', peerId);
                   let maxCap = 0;
                   const pls = gameState.players.map(pl => {
                      const plWealth = pl.balance + gameState.cells.filter(c => c.ownerId === pl.id).reduce((sum, c) => sum + (c.price || 0), 0);
                      if (plWealth > maxCap) maxCap = plWealth;
                      return {
                         id: pl.id,
                         name: pl.name,
                         color: pl.color,
                         wealth: plWealth
                      };
                   });
                   const winner = gameState.players.find(pl => pl.id === gameState.winnerId);
                   await setDoc(matchRef, {
                      id: peerId,
                      roomName: gameState.roomName || 'Без названия',
                      winnerName: winner ? winner.name : 'Неизвестно',
                      winnerId: gameState.winnerId || '',
                      players: pls,
                      durationStr: `${gameState.version} ходов`,
                      maxCapital: maxCap,
                      createdAt: +(new Date())
                   });
                }
             } catch (e) {
                console.error("Failed to save profile stats", e);
             }
          };
          saveStats();
       }
    }, [gameState?.turnStatus, gameState?.isStarted, hasSavedProfileStats, localPlayerId]);

    const startAsHost = () => {
      const p: Player = { 
        id: localPlayerId, 
        name: localPlayerName, 
        position: 0, 
        balance: roomSettings.initialBalance, 
        color: localColor, 
        avatarUrl: localAvatar,
        isHost: true 
      };

      const engine = new GameEngine([p], onEngineStateChange);
      const initialState = engine.getState();
      initialState.roomName = roomSettings.roomName;
      initialState.maxPlayers = roomSettings.maxPlayers;
      initialState.initialBalance = roomSettings.initialBalance;
      initialState.roomPassword = roomSettings.password;
      
      engineRef.current = engine;
      setGameState(initialState);
      setIsJoined(true);

      // Save recent
      const newRecent = [{id: peerId, name: roomSettings.roomName}, ...recentRooms.filter(r => r.id !== peerId)].slice(0, 5);
      setRecentRooms(newRecent);
      localStorage.setItem('tycoon_recent_rooms', JSON.stringify(newRecent));
    };

    const handleStartGame = () => {
      engineRef.current?.startGame({
        roomName: roomSettings.roomName,
        roomPassword: roomSettings.password,
        maxPlayers: roomSettings.maxPlayers,
        initialBalance: roomSettings.initialBalance
      });
    };

    const handleSurrender = () => {
      if (engineRef.current) {
        engineRef.current.surrender(localPlayerId);
      }
      setIsSurrenderModalOpen(false);
    };
    
    // Fetch profile and friends
    useEffect(() => {
       if (isProfileOpen) {
          const fetchProfile = async () => {
             try {
                const { doc, getDoc, collection, getDocs } = await import('firebase/firestore');
                const { db, auth } = await import('@/lib/firebase');
                
                if (auth.currentUser) {
                  const user = auth.currentUser;
                  const userRef = doc(db, 'users', user.uid);
                  const userSnap = await getDoc(userRef);
                  if (userSnap.exists()) {
                     setUserProfile(userSnap.data() as any);
                  } else {
                     setUserProfile({ gamesPlayed: 0, wins: 0, totalWealthPeak: 0, totalRentsCollected: 0 });
                  }

                  // fetch friends
                  const friendsRef = collection(db, 'users', user.uid, 'friends');
                  const friendsSnap = await getDocs(friendsRef);
                  setFriendsData(friendsSnap.docs.map(d => d.data()));
                  
                  // fetch requests
                  const reqRef = collection(db, 'users', user.uid, 'friendRequests');
                  const reqSnap = await getDocs(reqRef);
                  setFriendRequestsData(reqSnap.docs.map(d => d.data()));
                } else {
                  setUserProfile({ gamesPlayed: 0, wins: 0, totalWealthPeak: 0, totalRentsCollected: 0 });
                }
             } catch (e) {
                console.error("Failed to load profile", e);
             }
          };
          fetchProfile();
       }
    }, [isProfileOpen]);

    // Fetch viewed player profile
    useEffect(() => {
       if (viewingPlayerProfileId) {
          const fetchViewedProfile = async () => {
             try {
                const { doc, getDoc } = await import('firebase/firestore');
                setViewingPlayerProfileData(null);
                const { db } = await import('@/lib/firebase');
                
                const userRef = doc(db, 'users', viewingPlayerProfileId);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                   setViewingPlayerProfileData(userSnap.data());
                } else {
                   setViewingPlayerProfileData({ notFound: true });
                }
             } catch (e) {
                console.error("Failed to load viewed profile", e);
             }
          };
          fetchViewedProfile();
       } else {
          setTimeout(() => setViewingPlayerProfileData(null), 0);
       }
    }, [viewingPlayerProfileId]);

    const handleCloudRestore = async () => {
       if (!cloudRestoreId.trim()) return;
       try {
           const { doc, getDoc } = await import('firebase/firestore');
           const { db } = await import('@/lib/firebase');
           const snap = await getDoc(doc(db, 'rooms', cloudRestoreId.trim()));
           if (snap.exists()) {
              const data = snap.data();
              if (data.gameState) {
                 const parsedState = JSON.parse(data.gameState);
                 
                 // Restore it locally
                 const p: Player = parsedState.players.find((p: Player) => p.isHost) || { 
                   id: localPlayerId, 
                   name: localPlayerName, 
                   position: 0, 
                   balance: roomSettings.initialBalance, 
                   color: localColor, 
                   avatarUrl: localAvatar,
                   isHost: true 
                 };
                 // We will act as Host
                 // Notice that players might have different IDs. For now, Host gets the game.
                 const engine = new GameEngine(parsedState.players, onEngineStateChange);
                 engineRef.current = engine;
                 // Set state manually to the engine
                 // Oh wait, GameEngine has updateState method
                 engine.updateState(parsedState);
                 setGameState(parsedState);
                 setIsJoined(true);
                 setIsCloudRestoreOpen(false);
                 alert("Игра успешно восстановлена! Поделитесь новым кодом комнаты или используйте старый для возвращения.");
              }
           } else {
              alert("Сохранение не найдено");
           }
       } catch (e) {
           console.error("Restore failed", e);
           alert("Ошибка при загрузке облачного сохранения");
       }
    };

    const handleSendMessage = () => {
      if (!chatInput.trim() || !engineRef.current) return;
      const player = engineRef.current.getState().players.find(p => p.id === localPlayerId);
      if (!player) return;
      
      const msgId = Math.random().toString(36).substring(7);
      engineRef.current.addChatMessage('player', player.name, chatInput, localPlayerId, msgId);
      netRef.current?.broadcast('CHAT', {
          id: msgId,
          senderId: localPlayerId,
          senderName: player.name,
          text: chatInput
      }, localPlayerId);
      
      setChatInput('');
    };

    const exitRoom = async () => {
      const isHost = gameState?.players.find(p => p.id === localPlayerId)?.isHost;
      if (isHost && peerId && !gameState?.isStarted) {
        try {
          await fetch('/api/rooms', {
            method: 'DELETE',
            body: JSON.stringify({ id: peerId })
          });
        } catch (e) {
          console.error('Failed to cleanup room', e);
        }
      }
      netRef.current?.disconnect();
      setIsJoined(false);
      engineRef.current = null;
      setGameState(null);
      window.location.reload();
    };

    const joinRoom = (id?: string) => {
      const targetId = id || roomId;
      if (!targetId) return;
      setStatus('Подключение...');
      netRef.current?.connect(targetId);
      
      const p: Player = { 
        id: localPlayerId, 
        name: localPlayerName, 
        position: 0, 
        balance: 1500, 
        color: localColor, 
        avatarUrl: localAvatar,
        isHost: false 
      };

      const engine = new GameEngine([p], onEngineStateChange);
      engineRef.current = engine;

      // Add to recent rooms
      const newRecent = [{id: targetId, name: `Комната ${targetId.slice(0, 4)}`}, ...recentRooms.filter(r => r.id !== targetId)].slice(0, 5);
      setRecentRooms(newRecent);
      localStorage.setItem('tycoon_recent_rooms', JSON.stringify(newRecent));
    };

  const handleRoll = () => {
    if (gameState?.currentPlayerId !== localPlayerId) return;
    engineRef.current?.rollDice();
  };

  const handleBuy = () => {
    if (gameState?.currentPlayerId !== localPlayerId) return;
    engineRef.current?.buyAsset();
  };

  const handleNext = () => {
    if (gameState?.currentPlayerId !== localPlayerId) return;
    engineRef.current?.nextTurn();
  };

  const handleUpgrade = (cellId: number) => {
    engineRef.current?.upgradeAsset(cellId);
  };

  const saveSettings = async () => {
    localStorage.setItem('tycoon_name', localPlayerName);
    localStorage.setItem('tycoon_color', localColor);
    localStorage.setItem('tycoon_avatar', localAvatar);
    
    if (gameState && !gameState.isStarted && engineRef.current) {
        engineRef.current.updatePlayerProfile(localPlayerId, {
            name: localPlayerName,
            color: localColor,
            avatarUrl: localAvatar
        });
    }

    try {
      const { doc, setDoc, getDoc } = await import('firebase/firestore');
      const { db, auth } = await import('@/lib/firebase');
      if (auth.currentUser) {
         const userRef = doc(db, 'users', auth.currentUser.uid);
         const snap = await getDoc(userRef);
         if (snap.exists()) {
             await setDoc(userRef, {
                 nickname: localPlayerName,
                 nicknameLower: localPlayerName.toLowerCase(),
                 avatarUrl: localAvatar,
                 updatedAt: +(new Date())
             }, { merge: true });
         } else {
             await setDoc(userRef, {
                 id: auth.currentUser.uid,
                 nickname: localPlayerName,
                 nicknameLower: localPlayerName.toLowerCase(),
                 avatarUrl: localAvatar,
                 gamesPlayed: 0,
                 wins: 0,
                 totalWealthPeak: 0,
                 totalRentsCollected: 0,
                 createdAt: +(new Date()),
                 updatedAt: +(new Date())
             });
         }
      }
    } catch (e) {
      console.error('Failed to sync profile settings to firestore', e);
    }
  };

  const handleDiceAnimationComplete = useCallback(() => {
    if (!gameState || !engineRef.current || gameState.turnStatus !== 'ROLLING') return;
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
    const isHost = gameState.players.find(p => p.id === localPlayerId)?.isHost;
    if (gameState.currentPlayerId === localPlayerId || (isHost && currentPlayer?.isBot)) {
        engineRef.current.completeRoll();
    }
  }, [gameState, localPlayerId]);

  const { displayRoll } = useFastDiceRoller(gameState?.lastRoll, gameState?.turnStatus, handleDiceAnimationComplete);

  const TURN_DURATION = 30;
  const [timeLeft, setTimeLeft] = useState(TURN_DURATION);

  useEffect(() => {
    if (!gameState?.turnStartedAt || !gameState?.isStarted || gameState?.turnStatus === 'GAME_OVER') {
      // Avoid sync setState error
      const resetTime = () => {
         if (timeLeft !== TURN_DURATION) setTimeLeft(TURN_DURATION);
      };
      resetTime();
      return;
    }

    const interval = setInterval(() => {
      const elapsed = (Date.now() - (gameState.turnStartedAt || Date.now())) / 1000;
      const remaining = Math.max(0, Math.ceil(TURN_DURATION - elapsed));
      setTimeLeft(remaining);

      const isHost = gameState.players.find(p => p.id === localPlayerId)?.isHost;
      if (isHost && remaining <= 0 && engineRef.current) {
        engineRef.current.handleTimeout();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.turnStartedAt, gameState?.turnStatus, localPlayerId, gameState?.isStarted]);

  const searchFriend = async () => {
     if (!friendSearchText.trim()) return;
     setIsSearchingFriend(true);
     setFriendSearchResults([]);
     try {
        const { collection, getDocs, query, where, doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        
        let results: any[] = [];
        
        // Exact match by ID
        try {
           const userSnap = await getDoc(doc(db, 'users', friendSearchText.trim()));
           if (userSnap.exists() && userSnap.id !== localPlayerId) {
              results.push(userSnap.data());
           }
        } catch(e) {}
        
        // By nickname (prefix search)
        if (results.length === 0) {
           const usersRef = collection(db, 'users');
           const searchText = friendSearchText.trim().toLowerCase();
           const q = query(
               usersRef, 
               where('nicknameLower', '>=', searchText),
               where('nicknameLower', '<=', searchText + '\uf8ff')
           );
           const querySnapshot = await getDocs(q);
           querySnapshot.forEach((doc) => {
               if (doc.id !== localPlayerId && !results.find(r => r.id === doc.id)) {
                   results.push(doc.data());
               }
           });
        }
        
        setFriendSearchResults(results);
     } catch(e) {
        console.error("Search friend failed", e);
     } finally {
        setIsSearchingFriend(false);
     }
  };

  const sendFriendRequest = async (friend: any) => {
     try {
         const { doc, setDoc } = await import('firebase/firestore');
         const { db, auth } = await import('@/lib/firebase');
         if (!auth.currentUser) return;
         
         await setDoc(doc(db, 'users', friend.id, 'friendRequests', auth.currentUser.uid), {
             id: auth.currentUser.uid,
             requesterId: auth.currentUser.uid,
             nickname: localPlayerName,
             avatarUrl: localAvatar,
             status: 'pending',
             createdAt: +(new Date())
         });
         
         setFriendSearchText('');
         setFriendSearchResults([]);
     } catch(e) {
         console.error("Failed to send friend request", e);
     }
  };

  const acceptFriendRequest = async (req: any) => {
     try {
         const { doc, setDoc, deleteDoc } = await import('firebase/firestore');
         const { db, auth } = await import('@/lib/firebase');
         if (!auth.currentUser) return;
         
         // 1. Add them to my friends list
         await setDoc(doc(db, 'users', auth.currentUser.uid, 'friends', req.id), {
             id: req.id,
             friendId: req.id,
             nickname: req.nickname || 'Игрок',
             avatarUrl: req.avatarUrl || '',
             addedAt: +(new Date())
         });
         
         // 2. Add myself to their friends list
         await setDoc(doc(db, 'users', req.id, 'friends', auth.currentUser.uid), {
             id: auth.currentUser.uid,
             friendId: auth.currentUser.uid,
             nickname: localPlayerName,
             avatarUrl: localAvatar,
             addedAt: +(new Date())
         });

         // 3. Delete the request
         await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'friendRequests', req.id));

         setFriendsData(prev => [...prev, {
             id: req.id,
             nickname: req.nickname,
             avatarUrl: req.avatarUrl
         }]);
         setFriendRequestsData(prev => prev.filter(r => r.id !== req.id));

     } catch(e) {
         console.error("Failed to accept request", e);
     }
  };

  const inviteToGame = (friend: any) => {
      // For TMA:
      try {
         const roomIdToShare = peerId || roomId;
         const txt = encodeURIComponent('Ваш друг приглашает вас сыграть в Магнат!');
         const urlExt = encodeURIComponent(`https://t.me/ais_magnat_bot/app?startapp=${roomIdToShare}`);
         const url = `https://t.me/share/url?url=${urlExt}&text=${txt}`;
         window.open(url, '_blank');
      } catch(e) { console.error(e); }
  };

  if (viewingPlayerProfileId) {
    const gamePlayer = gameState?.players?.find(p => p.id === viewingPlayerProfileId);
    const playerAssets = gameState?.cells?.filter(c => c.ownerId === viewingPlayerProfileId) || [];
    
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center bg-[#1C1C1D]/80 backdrop-blur-sm z-[60] p-6 text-white text-center">
        <div className="w-full max-w-sm space-y-6 bg-[#2C2C2E] p-6 rounded-3xl border border-white/5 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl animate-in zoom-in-95">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-[#3390EC] uppercase tracking-widest">Игрок</h2>
            <button onClick={() => setViewingPlayerProfileId(null)} className="text-gray-400 hover:text-white transition-colors">
              ✕
            </button>
          </div>
          
          <div className="flex flex-col items-center gap-4">
             <div className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-3xl overflow-hidden shadow-lg border-2 border-[#1C1C1D]" style={{ backgroundColor: gamePlayer?.color || '#3390EC' }}>
               {viewingPlayerProfileData?.avatarUrl || gamePlayer?.avatarUrl ? (
                  <img src={viewingPlayerProfileData?.avatarUrl || gamePlayer?.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
               ) : (
                  (viewingPlayerProfileData?.nickname || gamePlayer?.name || '?').charAt(0).toUpperCase()
               )}
             </div>
             <div className="text-center">
               <h3 className="text-2xl font-black">{viewingPlayerProfileData?.nickname || gamePlayer?.name || 'Неизвестный'}</h3>
               <p className="text-xs text-gray-500 font-mono mt-1">{viewingPlayerProfileId}</p>
             </div>
          </div>

          <div className="flex bg-[#1C1C1D] rounded-xl p-1 gap-1">
             <div className="flex-1 text-center py-2">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Игр</p>
                <p className="font-black text-lg">{viewingPlayerProfileData?.gamesPlayed || 0}</p>
             </div>
             <div className="flex-1 text-center py-2 bg-white/5 rounded-lg">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Побед</p>
                <p className="font-black text-lg text-yellow-500">{viewingPlayerProfileData?.wins || 0}</p>
             </div>
          </div>
          
          {gameState?.isStarted && (
            <div className="bg-[#1C1C1D] p-3 rounded-xl border border-white/5">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider px-2 border-b border-white/5 pb-1 mb-2 text-left">В текущей игре</p>
                <div className="flex justify-between items-center mb-3 px-2">
                   <p className="text-sm font-bold">Баланс:</p>
                   <p className="text-[#34C759] font-black">${gamePlayer?.balance || 0}</p>
                </div>
                <div className="flex flex-wrap gap-1 px-2">
                   {playerAssets.length === 0 ? (
                      <p className="text-xs text-gray-500 italic">Нет активов</p>
                   ) : (
                      playerAssets.map((asset, i) => (
                         <div key={i} className="text-[10px] bg-[#2C2C2E] px-2 py-1 rounded font-bold uppercase border border-gray-700/50 flex gap-1 items-center">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: asset.color }}></span>
                            {asset.name}
                         </div>
                      ))
                   )}
                </div>
            </div>
          )}

          {viewingPlayerProfileId !== localPlayerId && !viewingPlayerProfileData?.notFound && (
              <button 
                onClick={() => {
                   sendFriendRequest({ id: viewingPlayerProfileId, nickname: viewingPlayerProfileData?.nickname, avatarUrl: viewingPlayerProfileData?.avatarUrl });
                   setViewingPlayerProfileId(null);
                }}
                className="w-full bg-[#3390EC]/10 text-[#3390EC] p-3 rounded-xl font-bold hover:bg-[#3390EC]/20 active:scale-95 transition-all text-sm uppercase tracking-widest mt-4"
              >
                Отправить заявку в друзья
              </button>
          )}
        </div>
      </main>
    );
  }

  if (isProfileOpen) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center bg-[#1C1C1D] z-50 p-6 text-white text-center">
        <div className="w-full max-w-sm space-y-6 bg-[#2C2C2E] p-6 rounded-3xl border border-white/5 max-h-[90vh] overflow-y-auto no-scrollbar">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-[#3390EC] uppercase tracking-widest">Профиль</h2>
            <button onClick={() => { setIsProfileOpen(false); saveSettings(); }} className="text-gray-400 hover:text-white transition-colors">
              ✕
            </button>
          </div>
          
          <div className="flex flex-col items-center gap-4">
             <div className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-3xl overflow-hidden shadow-lg border-2 border-[#3390EC]" style={{ backgroundColor: localColor }}>
               {localAvatar ? (
                  <img src={localAvatar} alt="Avatar" className="w-full h-full object-cover" />
               ) : (
                  localPlayerName.charAt(0).toUpperCase()
               )}
             </div>
             <div>
                <h3 className="text-2xl font-black">{localPlayerName || 'Игрок'}</h3>
                <p className="text-xs text-gray-500 font-mono tracking-widest uppercase">ID: {localPlayerId.slice(0, 8)}</p>
             </div>
          </div>
          
          <div className="flex bg-[#1C1C1D] rounded-xl p-1 overflow-x-auto no-scrollbar">
            <button 
              className={`flex-1 py-2 px-3 whitespace-nowrap text-xs font-bold uppercase rounded-lg transition-colors ${profileTab === 'stats' ? 'bg-[#3390EC] text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setProfileTab('stats')}
            >
              Стат
            </button>
            <button 
              className={`flex-1 py-2 px-3 whitespace-nowrap text-xs font-bold uppercase rounded-lg transition-colors ${profileTab === 'friends' ? 'bg-[#3390EC] text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setProfileTab('friends')}
            >
              Друзья
            </button>
            <button 
              className={`flex-1 py-2 px-3 whitespace-nowrap text-xs font-bold uppercase rounded-lg transition-colors ${profileTab === 'settings' ? 'bg-[#3390EC] text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setProfileTab('settings')}
            >
              Настройки
            </button>
          </div>

          {profileTab === 'friends' && (
            <div className="space-y-4 text-left animate-in fade-in zoom-in-95">
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={friendSearchText}
                  onChange={(e) => setFriendSearchText(e.target.value)}
                  placeholder="ID или ник"
                  className="flex-1 bg-[#1C1C1D] p-3 rounded-xl text-white outline-none focus:ring-1 focus:ring-[#3390EC] text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && searchFriend()}
                />
                <button 
                  onClick={searchFriend}
                  disabled={isSearchingFriend || !friendSearchText.trim()}
                  className="bg-[#3390EC] p-3 rounded-xl text-white font-bold disabled:opacity-50"
                >
                  {isSearchingFriend ? '...' : 'Поиск'}
                </button>
              </div>
              
              {friendSearchResults.length > 0 && (
                <div className="bg-[#1C1C1D] rounded-xl p-2 space-y-2 max-h-[150px] overflow-y-auto">
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-wider px-2 pt-1 border-b border-white/5 pb-1">Результаты</p>
                  {friendSearchResults.map(res => (
                    <div key={res.id} className="flex items-center justify-between p-2 rounded-lg bg-[#2C2C2E] border border-white/5">
                      <div className="flex items-center gap-2 overflow-hidden">
                         <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 shrink-0 border border-[#3390EC]/30">
                            {res.avatarUrl ? <img src={res.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold">{res.nickname?.charAt(0) || '?'}</div>}
                         </div>
                         <div className="flex flex-col truncate">
                            <span className="font-bold text-sm truncate">{res.nickname || 'Unknown'}</span>
                            <span className="text-[10px] text-gray-500 font-mono truncate">{res.id}</span>
                         </div>
                      </div>
                      <button onClick={() => sendFriendRequest(res)} className="text-[#3390EC] font-bold text-xs bg-[#3390EC]/10 px-2 py-1 rounded">Добавить</button>
                    </div>
                  ))}
                </div>
              )}

              {friendRequestsData.length > 0 && (
                <div className="bg-[#1C1C1D] rounded-xl p-2 space-y-2">
                   <p className="text-xs text-yellow-500 font-bold uppercase tracking-wider px-2 pt-1 border-b border-white/5 pb-1">Заявки ({friendRequestsData.length})</p>
                   <div className="space-y-2 max-h-[150px] overflow-y-auto no-scrollbar">
                     {friendRequestsData.map(req => (
                        <div key={req.id} className="flex items-center justify-between p-2 rounded-lg bg-[#2C2C2E] border border-white/5">
                           <div className="flex items-center gap-2 overflow-hidden shrink-0 max-w-[60%]">
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 shrink-0 border border-white/10">
                                 {req.avatarUrl ? <img src={req.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-lg">{req.nickname?.charAt(0) || '?'}</div>}
                              </div>
                              <div className="flex flex-col truncate">
                                 <span className="font-bold text-sm truncate">{req.nickname || 'Unknown'}</span>
                              </div>
                           </div>
                           <button onClick={() => acceptFriendRequest(req)} className="text-green-500 font-bold text-xs bg-green-500/10 px-2 py-1 rounded">Принять</button>
                        </div>
                     ))}
                   </div>
                </div>
              )}

              <div className="bg-[#1C1C1D] rounded-xl p-2 space-y-2">
                 <p className="text-xs text-gray-500 font-bold uppercase tracking-wider px-2 pt-1 border-b border-white/5 pb-1">Мои друзья ({friendsData.length})</p>
                 {friendsData.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 py-4">Нет друзей</p>
                 ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto no-scrollbar">
                      {friendsData.map(friend => (
                        <div key={friend.id} className="flex items-center justify-between p-2 rounded-lg bg-[#2C2C2E] border border-white/5">
                           <div className="flex items-center gap-3 shrink-0 max-w-[60%]">
                             <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700 shrink-0 border border-white/10">
                                {friend.avatarUrl ? <img src={friend.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-lg">{friend.nickname?.charAt(0) || '?'}</div>}
                             </div>
                             <div className="flex flex-col truncate">
                                <span className="font-bold text-sm truncate">{friend.nickname || 'Unknown'}</span>
                             </div>
                           </div>
                           {(peerId || roomId) && gameState?.isStarted === false && (
                              <button onClick={() => inviteToGame(friend)} className="text-[#3390EC] font-bold text-xs bg-[#3390EC]/10 px-2 py-1 rounded">В игру</button>
                           )}
                        </div>
                      ))}
                    </div>
                 )}
              </div>
            </div>
          )}

          {profileTab === 'stats' && (
            <div className="bg-[#1C1C1D] rounded-2xl p-4 space-y-4 text-left animate-in fade-in zoom-in-95">
              {!userProfile ? (
                <div className="flex justify-center p-4">
                   <div className="w-8 h-8 border-4 border-[#3390EC] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                   <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-sm text-gray-400 font-bold uppercase tracking-wider">Всего игр</span>
                      <span className="text-lg font-black text-white">{userProfile.gamesPlayed || 0}</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-sm text-gray-400 font-bold uppercase tracking-wider">Побед</span>
                      <span className="text-lg font-black text-yellow-500">{userProfile.wins || 0}</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-sm text-gray-400 font-bold uppercase tracking-wider">Пик капитала</span>
                      <span className="text-lg font-black text-[#34C759]">${(userProfile.totalWealthPeak || 0).toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400 font-bold uppercase tracking-wider">Собрано аренды</span>
                      <span className="text-lg font-black text-[#5E5CE6]">${(userProfile.totalRentsCollected || 0).toLocaleString()}</span>
                   </div>
                   
                   {(userProfile.gamesPlayed || 0) > 0 && (
                     <div className="pt-2 text-center">
                       <span className="text-xs text-gray-500 font-bold">Винрейт: {Math.round(((userProfile.wins || 0) / userProfile.gamesPlayed) * 100)}%</span>
                     </div>
                   )}
                </>
              )}
            </div>
          )}

          {profileTab === 'settings' && (
            <div className="space-y-4 text-left animate-in fade-in slide-in-from-right-4">
              <div>
                <p className="text-sm text-gray-400 mb-2 font-bold uppercase tracking-wider">Псевдоним</p>
                <input 
                  type="text"
                  value={localPlayerName}
                  onChange={(e) => setLocalPlayerName(e.target.value)}
                  className="w-full bg-[#1C1C1D] rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-[#3390EC] transition-all"
                  placeholder="Ваше имя"
                  maxLength={12}
                />
              </div>

              <div>
                <p className="text-sm text-gray-400 mb-2 font-bold uppercase tracking-wider">Аватар</p>
                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                  {['Felix', 'Aneka', 'Caleb', 'Cookie', 'Charlie', 'Misty', 'Boots'].map(seed => {
                    const url = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}`;
                    return (
                      <button 
                        key={seed}
                        onClick={() => setLocalAvatar(url)}
                        className={`w-14 h-14 rounded-xl flex-shrink-0 transition-all border-2 ${localAvatar === url ? 'border-[#3390EC] scale-110 bg-[#3390EC]/10' : 'border-transparent bg-[#1C1C1D]'}`}
                      >
                        <img src={url} alt={seed} className="w-full h-full p-1" />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2">
                   <input 
                     type="text"
                     placeholder="Вставьте URL аватара"
                     value={localAvatar}
                     onChange={(e) => setLocalAvatar(e.target.value)}
                     className="w-full bg-[#1C1C1D] p-3 rounded-xl text-xs text-gray-400 outline-none focus:ring-1 focus:ring-[#3390EC]"
                   />
                </div>
              </div>

              <div className="flex items-center justify-between bg-[#1C1C1D] p-4 rounded-xl border border-white/5 mb-4">
                <span className="text-sm font-bold text-white uppercase tracking-wider">Звук</span>
                <button 
                  onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isSoundEnabled ? 'bg-[#3390EC]' : 'bg-gray-600'}`}
                >
                  <div 
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${isSoundEnabled ? 'left-[26px]' : 'left-[4px]'}`}
                  />
                </button>
              </div>

              <div>
                <p className="text-sm text-gray-400 mb-2 font-bold uppercase tracking-wider">Цвет</p>
                <div className="flex gap-4 flex-wrap">
                  {['#3390EC', '#FF3B30', '#34C759', '#FF9500', '#AF52DE', '#FFCC00'].map(c => (
                    <button 
                      key={c}
                      onClick={() => setLocalColor(c)}
                      className={`w-10 h-10 rounded-full transition-transform ${localColor === c ? 'scale-125 ring-2 ring-white' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <button 
            onClick={() => { setIsProfileOpen(false); saveSettings(); }}
            className="w-full bg-[#3390EC] text-white p-4 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest mt-4"
          >
            {profileTab === 'settings' ? 'Сохранить' : 'Закрыть'}
          </button>
        </div>
      </main>
    );
  }

  if (isCloudRestoreOpen) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center bg-[#1C1C1D] z-50 p-6 text-white text-center">
        <div className="w-full max-w-sm space-y-8 bg-[#2C2C2E] p-6 rounded-3xl border border-white/5">
          <h2 className="text-xl font-bold text-[#3390EC]">Восстановить игру</h2>
          <p className="text-sm text-gray-400">Введите ID комнаты, чтобы продолжить с последнего облачного сохранения.</p>
          
          <div className="space-y-4">
             <input 
               type="text"
               value={cloudRestoreId}
               onChange={(e) => setCloudRestoreId(e.target.value)}
               className="w-full bg-[#1C1C1D] rounded-xl p-4 text-center text-white outline-none focus:ring-2 focus:ring-[#3390EC] transition-all font-mono"
               placeholder="ID Комнаты"
             />
          </div>

          <div className="pt-4 flex flex-col gap-3">
            <button 
              onClick={handleCloudRestore}
              className="w-full bg-[#3390EC] text-white p-4 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all"
            >
              Загрузить
            </button>
            <button 
              onClick={() => setIsCloudRestoreOpen(false)}
              className="w-full text-gray-400 p-4 font-bold hover:text-white"
            >
              Отмена
            </button>
          </div>
        </div>
      </main>
    );
  }

  // --- HTML DOM BOARD CALCULATION ---
  const cellsToDraw = gameState ? gameState.cells : BOARD_CELLS;
  const isLocalTurn = gameState?.currentPlayerId === localPlayerId;

  return (
    <main className="min-h-screen bg-[#1C1C1D] font-sans overflow-hidden">
      <AnimatePresence mode="wait">
        {!isJoined ? (
          <motion.main 
            key="lobby-main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex flex-col items-center justify-center bg-[#1C1C1D] text-white p-6"
          >
            <div className="w-full max-w-sm space-y-10">
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-black tracking-tight text-[#3390EC]">МАГНАТ</h1>
                <p className="text-sm text-gray-400">Telegram Edition</p>
              </div>
              
              <div className="flex gap-2">
                <div className="flex-1 bg-[#2C2C2E] rounded-2xl p-4 flex items-center justify-between cursor-pointer" onClick={() => { setIsProfileOpen(true); setProfileTab('settings'); }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg overflow-hidden shrink-0" style={{ backgroundColor: localColor }}>
                      {localAvatar ? (
                         <img src={localAvatar} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                         localPlayerName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <span className="font-bold truncate">{localPlayerName}</span>
                  </div>
                  <span className="text-[#3390EC] text-sm shrink-0">Изм.</span>
                </div>
                
                <button 
                  onClick={() => setIsProfileOpen(true)}
                  className="bg-[#2C2C2E] rounded-2xl p-4 flex items-center justify-center text-[#3390EC] hover:bg-[#3390EC]/10 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
                </button>
              </div>

              <div className="space-y-6">
                {publicRooms.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-[#3390EC] uppercase font-black text-center tracking-widest">Открытые игры</p>
                    <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto no-scrollbar pr-1">
                      {publicRooms.map(room => (
                        <button 
                          key={room.id}
                          onClick={() => joinRoom(room.id)}
                          disabled={room.isStarted || room.playerCount >= room.maxPlayers}
                          className="group w-full bg-[#2C2C2E] border border-white/5 p-4 rounded-2xl flex items-center justify-between text-left hover:bg-[#3390EC]/10 transition-colors disabled:opacity-50"
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-black text-white group-hover:text-[#3390EC] transition-colors">{room.name}</span>
                            <span className="text-[10px] text-gray-500 uppercase font-bold">Офис {room.hostName}</span>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] bg-[#3390EC] text-white px-2 py-0.5 rounded-full font-black">
                              {room.playerCount}/{room.maxPlayers}
                            </span>
                            {room.isStarted && <span className="text-[8px] text-gray-500 font-bold uppercase italic">В игре</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <button 
                    onClick={() => setIsRoomSettingsOpen(true)}
                    className="w-full bg-[#3390EC] text-white p-4 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(51,144,236,0.3)]"
                  >
                    Создать игру
                  </button>
                  <button 
                    onClick={() => setIsCloudRestoreOpen(true)}
                    className="w-full bg-transparent border-2 border-[#3390EC]/30 text-[#3390EC] p-3 rounded-xl font-bold hover:bg-[#3390EC]/10 active:scale-95 transition-all"
                  >
                    ☁ Восстановить из облака
                  </button>
                  {peerId && <p className="text-xs text-center text-gray-400">ID: <span className="font-mono text-white select-all">{peerId}</span></p>}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-700"></div></div>
                  <div className="relative flex justify-center"><span className="bg-[#1C1C1D] px-4 text-xs text-gray-500 uppercase">Или</span></div>
                </div>

                <div className="space-y-3">
                  <input 
                    type="text" 
                    placeholder="ID Комнаты"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    className="w-full bg-[#2C2C2E] p-4 rounded-xl text-center text-white focus:ring-2 focus:ring-[#3390EC] outline-none font-mono"
                  />
                  <input 
                    type="password" 
                    placeholder="Пароль (если есть)"
                    value={joiningPassword}
                    onChange={(e) => setJoiningPassword(e.target.value)}
                    className="w-full bg-[#2C2C2E] p-4 rounded-xl text-center text-white focus:ring-2 focus:ring-[#3390EC] outline-none"
                  />
                  <button 
                    onClick={() => joinRoom()}
                    disabled={!roomId}
                    className="w-full bg-white text-[#1C1C1D] p-4 rounded-xl font-bold disabled:opacity-50 active:scale-95 transition-all"
                  >
                    Присоединиться
                  </button>
                </div>

                {recentMatches.length > 0 && (
                  <div className="space-y-3 mt-8 max-h-[400px] overflow-y-auto no-scrollbar">
                    <p className="text-[10px] text-gray-500 uppercase font-black text-center tracking-widest sticky top-0 bg-[#1C1C1D] py-2 z-10">Истории матчей</p>
                    <div className="flex flex-col gap-2">
                       {recentMatches.map(match => (
                           <div key={match.id} className="w-full bg-[#2C2C2E]/50 border border-white/5 p-4 rounded-xl space-y-3">
                               <div className="flex justify-between items-center pb-2 border-b border-white/5">
                                   <span className="text-[#3390EC] font-bold text-xs uppercase tracking-widest">{match.roomName}</span>
                                   <span className="text-gray-500 text-[10px] uppercase font-bold">{new Date(match.createdAt).toLocaleDateString()}</span>
                               </div>
                               <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                     <span className="text-yellow-500 text-lg">🏆</span>
                                     <span className="text-white font-black text-sm">{match.winnerName}</span>
                                  </div>
                                  <span className="text-[#34C759] font-bold">${match.maxCapital}</span>
                               </div>
                               <div className="flex flex-wrap gap-1">
                                  {match.players?.map((p: any) => (
                                     <div key={p.id} className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} title={p.name} />
                                  ))}
                               </div>
                           </div>
                       ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="absolute bottom-6 text-[10px] text-gray-500 uppercase tracking-widest">
              {status}
            </div>
          </motion.main>
        ) : (
          <motion.main 
            key="game-main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#1C1C1D] text-white overflow-hidden flex flex-col user-select-none touch-none"
          >

      {/* DASHBOARD TOP */}
      <div className="h-[80px] bg-[#1C1C1D] z-10 flex items-center justify-between px-4 sticky top-0 shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (gameState?.isStarted) setIsSurrenderModalOpen(true);
              else { setIsProfileOpen(true); setProfileTab('settings'); }
            }} 
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-sm cursor-pointer overflow-hidden" 
            style={{ backgroundColor: localColor }}
          >
            {localAvatar ? (
               <img src={localAvatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
               localPlayerName.charAt(0).toUpperCase()
            )}
          </button>
          <div className="flex flex-col relative" onClick={() => gameState?.isStarted && setIsSurrenderModalOpen(true)}>
            <span className="text-sm font-bold text-gray-400">БАЛАНС</span>
            <div className="flex items-center gap-1">
              <span className="text-xl font-black">${gameState?.players.find(p => p.id === localPlayerId)?.balance || 0}</span>
              
              {/* Balance Change Float */}
              <AnimatePresence>
                {gameState?.lastBalanceChange?.playerId === localPlayerId && (
                  <motion.span
                    key={`bal-${gameState.lastBalanceChange.timestamp}`}
                    initial={{ opacity: 0, y: 0 }}
                    animate={{ 
                      opacity: [0, 1, 1, 0], 
                      y: [0, -20, -25, -30] 
                    }}
                    transition={{ duration: 3, times: [0, 0.1, 0.8, 1] }}
                    exit={{ opacity: 0 }}
                    className={`absolute right-0 font-bold text-sm ${gameState.lastBalanceChange.amount > 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}
                  >
                    {gameState.lastBalanceChange.amount > 0 ? '+' : ''}${gameState.lastBalanceChange.amount}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsChatOpen(true)}
            className="w-10 h-10 bg-[#2C2C2E] rounded-full flex items-center justify-center relative"
          >
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
             {gameState?.chatMessages.length && (
               <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#3390EC] rounded-full text-[8px] font-black flex items-center justify-center border-2 border-[#1C1C1D]">
                 {gameState.chatMessages.length}
               </div>
             )}
          </button>

          <div className="flex items-center gap-2 pr-2">
            {gameState?.players.map(p => (
              <button 
                 key={p.id} 
                 onClick={() => setViewingPlayerProfileId(p.id)}
                 className={`flex items-center gap-1.5 bg-[#2C2C2E]/50 px-2 py-1 rounded-full border active:scale-95 transition-transform ${p.id === gameState.currentPlayerId ? 'border-[#3390EC]' : 'border-white/5'}`}
              >
                <div className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[8px] overflow-hidden" style={{ backgroundColor: p.color }}>
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    p.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex flex-col -gap-0.5 text-left">
                  <span className={`text-[8px] font-black uppercase tracking-tighter ${p.id === gameState.currentPlayerId ? 'text-[#3390EC]' : 'text-gray-500'}`}>
                    {p.name.split(' ')[0]}
                  </span>
                  <span className="text-[10px] font-black text-white leading-none">${p.balance}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BOARD AREA */}
      <div className="flex-1 relative mx-2 mb-2 bg-[#1C1C1D] rounded-3xl overflow-hidden flex items-center justify-center p-8">
        
        {/* Waiting for players overlay */}
        {gameState?.isStarted && gameState.players.length < (gameState.maxPlayers || 2) && (
          <div className="absolute inset-0 z-40 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-6">
             <div className="bg-[#2C2C2E] p-8 rounded-3xl border border-white/5 shadow-2xl animate-pulse">
                <div className="w-16 h-16 border-4 border-[#3390EC] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                <h3 className="text-xl font-black mb-2 uppercase">СИНХРОНИЗАЦИЯ СЕТИ</h3>
                <p className="text-gray-400 font-bold">Ожидание подключения всех участников...</p>
                <div className="mt-6 flex justify-center gap-2">
                   {[...Array(gameState.maxPlayers || 2)].map((_, i) => (
                     <div 
                       key={i} 
                       className={`w-3 h-3 rounded-full ${i < gameState.players.length ? 'bg-[#3390EC]' : 'bg-gray-700'}`} 
                     />
                   ))}
                </div>
                <p className="mt-4 text-[10px] text-gray-500 font-black uppercase tracking-widest">{gameState.players.length} / {gameState.maxPlayers || 2} МАГНАТОВ</p>
             </div>
          </div>
        )}

        {/* LOG IN CENTER */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-40 p-16 pointer-events-none">
             {gameState ? (
                <div className="w-full h-full max-w-[300px] flex flex-col items-center justify-center gap-4 pointer-events-auto">
                 {!gameState.isStarted && gameState.players.find(p => p.id === localPlayerId)?.isHost ? (
                   <motion.div 
                     initial={{ opacity: 0, scale: 0.9 }}
                     animate={{ opacity: 1, scale: 1 }}
                     className="w-full space-y-6 bg-[#1C1C1D]/80 backdrop-blur-xl p-8 rounded-[32px] border border-white/10 shadow-2xl"
                   >
                     <div className="text-center space-y-1">
                       <h2 className="text-2xl font-black text-[#3390EC] tracking-tighter uppercase leading-none">{roomSettings.roomName || 'ОФИС МАГНАТА'}</h2>
                       <p className="text-[10px] text-gray-500 font-extrabold uppercase tracking-[0.2em]">{peerId.slice(0, 8)}</p>
                     </div>

                     <div className="space-y-2 bg-[#2C2C2E]/50 p-4 rounded-2xl border border-white/5">
                       {gameState.players.map(p => (
                         <div key={p.id} className="flex items-center justify-between py-1">
                           <button onClick={() => setViewingPlayerProfileId(p.id)} className="flex items-center gap-3 active:scale-95 transition-transform text-left">
                             <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center border-2 border-[#1C1C1D] shadow-inner" style={{ backgroundColor: p.color }}>
                               {p.avatarUrl ? (
                                 <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                               ) : (
                                 <span className="text-[10px] font-black text-white">{p.name.charAt(0).toUpperCase()}</span>
                               )}
                             </div>
                             <span className="text-xs font-black text-white uppercase tracking-tight">{p.name} {p.id === localPlayerId ? '(ВЫ)' : ''}</span>
                           </button>
                           {p.isHost && <span className="text-[8px] text-[#3390EC] font-black uppercase tracking-widest">Host</span>}
                         </div>
                       ))}
                     </div>

                     <div className="flex flex-col gap-3">
                       <div className="flex gap-2">
                         <button 
                           onClick={() => {
                              const botId = 'bot_' + Math.random().toString(36).substring(7);
                              engineRef.current?.addPlayer({
                                 id: botId,
                                 name: 'Бот ' + Math.floor(Math.random()*100),
                                 position: 0,
                                 balance: roomSettings.initialBalance,
                                 color: '#' + Math.floor(Math.random()*16777215).toString(16),
                                 isHost: false,
                                 isBot: true,
                                 botStrategy: Math.random() > 0.5 ? 'AGGRESSIVE' : 'ECONOMICAL'
                              });
                           }}
                           className="flex-1 h-14 bg-[#2C2C2E] text-white rounded-2xl font-black text-xs uppercase tracking-widest border border-white/10 hover:bg-white/5 disabled:opacity-50 transition-all active:scale-95"
                           disabled={gameState.players.length >= (gameState.maxPlayers || 4)}
                         >
                           + Бот
                         </button>
                         <button 
                           onClick={() => setIsRoomSettingsOpen(true)}
                           className="flex-1 h-14 bg-[#2C2C2E] text-[#3390EC] rounded-2xl font-black text-xs uppercase tracking-[0.2em] border border-[#3390EC]/20 hover:bg-[#3390EC]/10 transition-all active:scale-95"
                         >
                           Настройки
                         </button>
                       </div>
                       <button 
                         onClick={handleStartGame}
                         disabled={gameState.players.length < 2}
                         className="w-full bg-[#3390EC] text-white h-14 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-[#3390EC]/20 hover:brightness-110 disabled:opacity-50 transition-all active:scale-95"
                       >
                         {gameState.players.length < 2 ? 'Ожидание игроков' : 'Начать игру'}
                       </button>
                       <button 
                         onClick={exitRoom}
                         className="w-full h-10 text-gray-500 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors"
                       >
                         ← Закрыть комнату
                       </button>
                     </div>
                   </motion.div>
                 ) : (
                   <div className="flex flex-col items-center justify-end w-full h-full pointer-events-none pb-8">
                     <AnimatePresence>
                       {gameState.lastRoll && (
                         <motion.div 
                           initial={{ opacity: 0, scale: 0.5, y: 20 }}
                           animate={{ opacity: 1, scale: 1, y: 0 }}
                           className="flex gap-2 mb-2"
                         >
                           <div className="w-10 h-10 bg-[#2C2C2E] rounded-xl flex items-center justify-center text-xl font-black text-[#3390EC] shadow-xl border border-white/5">{displayRoll[0]}</div>
                           <div className="w-10 h-10 bg-[#2C2C2E] rounded-xl flex items-center justify-center text-xl font-black text-[#3390EC] shadow-xl border border-white/5">{displayRoll[1]}</div>
                         </motion.div>
                       )}
                     </AnimatePresence>
                     <div className="hidden">МАГНАТ</div>
                     <div className="flex flex-col justify-end gap-2 w-full h-[180px] pointer-events-none pb-4">
                       {gameState.chatMessages.slice(-5).map((msg, i, arr) => {
                         const isSystem = msg.senderId === 'system';
                         const isMe = msg.senderId === localPlayerId;
                         const sender = gameState.players.find(p => p.id === msg.senderId);
                         const bgColor = isSystem ? 'rgba(44, 44, 46, 0.8)' : (isMe ? '#3390EC' : (sender?.color || '#3390EC'));
                         const textColor = isSystem ? '#9CA3AF' : '#FFFFFF';
                         const align = isSystem ? 'center' : (isMe ? 'flex-end' : 'flex-start');
                         const borderRadius = isSystem 
                             ? 'rounded-2xl' 
                             : (isMe ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm');
                         
                         return (
                           <motion.div 
                             layout
                             initial={{ opacity: 0, scale: 0.8, y: 20 }} 
                             animate={{ opacity: 1, scale: 1, y: 0 }} 
                             key={msg.id} 
                             className="flex flex-col w-full px-4 shrink-0 transition-opacity"
                             style={{ opacity: 1 - (arr.length - 1 - i) * 0.15, alignItems: align }}
                           >
                             {!isSystem && !isMe && (
                               <span className="text-[10px] font-bold mb-1 ml-1" style={{ color: sender?.color }}>{msg.senderName}</span>
                             )}
                             <div 
                               className={`px-3 py-1.5 max-w-[85%] shadow-lg backdrop-blur-md ${borderRadius}`}
                               style={{ backgroundColor: bgColor, color: textColor }}
                             >
                               <span className="text-[11px] leading-tight font-medium inline-block">{msg.text}</span>
                             </div>
                           </motion.div>
                         );
                       })}
                     </div>
                   </div>
                 )}
               </div>
             ) : (
               <div className="hidden">МАГНАТ</div>
             )}
        </div>

        <div className="absolute inset-4">
            {cellsToDraw.map((cell, index) => {
              const corner = 16; 
              const numMid = 9; 
              const step = (100 - 2*corner) / numMid;

              const getMiddlePos = (idx: number) => corner + (idx - 1) * step;

              const isBottom = index > 0 && index < 10;
              const isLeft = index > 10 && index < 20;
              const isTop = index > 20 && index < 30;
              const isRight = index > 30 && index < 40;
              const isCorner = index % 10 === 0;

              const getRect = (i: number) => {
                if (i === 0) return { right: 0, bottom: 0, width: corner+'%', height: corner+'%' };
                if (isBottom) return { right: getMiddlePos(i)+'%', bottom: 0, width: step+'%', height: corner+'%' };
                if (i === 10) return { left: 0, bottom: 0, width: corner+'%', height: corner+'%' };

                if (isLeft) return { left: 0, bottom: getMiddlePos(i - 10)+'%', width: corner+'%', height: step+'%' };
                if (i === 20) return { left: 0, top: 0, width: corner+'%', height: corner+'%' };

                if (isTop) return { left: getMiddlePos(i - 20)+'%', top: 0, width: step+'%', height: corner+'%' };
                if (i === 30) return { right: 0, top: 0, width: corner+'%', height: corner+'%' };

                if (isRight) return { right: 0, top: getMiddlePos(i - 30)+'%', width: corner+'%', height: step+'%' };

                return { left: 0, top: 0 };
              };

              const style = getRect(index);
              const owner = gameState?.players.find(p => p.id === cell.ownerId);

              // Split name for vertical
              const shortName = cell.name.split(' ').slice(0, 2).join(' ');

              let cornerBg = '#1C1C1D';
              let cornerText = '';
              if (index === 0) { cornerBg = '#34C759'; cornerText = 'СТАРТ'; }
              if (index === 10) { cornerBg = '#FF3B30'; cornerText = 'БАН'; }
              if (index === 20) { cornerBg = '#3390EC'; cornerText = 'ПАРКИНГ'; }
              if (index === 30) { cornerBg = '#FF9500'; cornerText = 'В ТЮРЬМУ'; }

              return (
                <motion.div 
                  key={index} 
                  className={`absolute border border-[#2C2C2E] bg-[#1C1C1D] flex items-center justify-center overflow-hidden cursor-pointer group`}
                  style={style}
                  whileHover={!isCorner ? { scale: 1.05, zIndex: 30, boxShadow: "0 12px 30px -10px rgba(0,0,0,0.5)" } : {}}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setZoomedCell(index)}
                >
                    {isCorner ? (
                      <div className="w-full h-full flex items-center justify-center p-1" style={{ backgroundColor: cornerBg }}>
                          <span className="text-[10px] sm:text-xs font-black text-white transform -rotate-45 tracking-widest leading-none drop-shadow-md">
                             {cornerText}
                          </span>
                      </div>
                    ) : (
                      <div className="w-full h-full relative flex flex-col items-center">
                          {/* Color stripe facing inside */}
                          {cell.color && (
                            <div 
                              className="absolute bg-opacity-90"
                              style={{ 
                                backgroundColor: cell.color,
                                top: isBottom ? 0 : 'auto',
                                bottom: isTop ? 0 : 'auto',
                                left: isRight ? 0 : 'auto',
                                right: isLeft ? 0 : 'auto',
                                width: (isBottom || isTop) ? '100%' : '15%',
                                height: (isBottom || isTop) ? '15%' : '100%',
                              }} 
                            />
                          )}

                          {/* Upgrade Indicators */}
                          {cell.upgradeLevel ? (
                            <div className={`absolute z-20 flex gap-0.5 ${isBottom ? 'top-1 left-1' : isTop ? 'bottom-1 right-1' : isLeft ? 'right-1 top-1' : 'left-1 bottom-1'}`}>
                              {[...Array(cell.upgradeLevel)].map((_, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
                              ))}
                            </div>
                          ) : null}

                          {/* Owner Overlay & Indicator */}
                          {owner && (
                            <>
                              <div className={`absolute inset-0 opacity-10 group-hover:opacity-30 transition-opacity pointer-events-none ${cell.isMortgaged ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(255,255,255,0.1)_5px,rgba(255,255,255,0.1)_10px)]' : ''}`} style={{ backgroundColor: owner.color }} />
                              <motion.div 
                                className={`absolute top-1 right-1 w-5 h-5 rounded-full z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-0 group-hover:scale-100 transition-all duration-300 shadow-lg text-[8px] font-black text-white overflow-hidden ${cell.isMortgaged ? 'opacity-50 grayscale' : ''}`}
                                style={{ backgroundColor: owner.color, boxShadow: `0 2px 10px ${owner.color}60` }}
                              >
                                {owner.avatarUrl ? (
                                   <img src={owner.avatarUrl} alt={owner.name} className="w-full h-full object-cover" />
                                ) : (
                                   owner.name.charAt(0).toUpperCase()
                                )}
                              </motion.div>
                            </>
                          )}

                          {cell.isMortgaged && (
                             <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                                <div className="bg-red-500/80 text-white text-[6px] font-black uppercase px-2 py-0.5 -rotate-45 transform">
                                   Заложен
                                </div>
                             </div>
                          )}

                          {/* Purchase Flash Effect With Particles */}
                          {gameState?.lastPurchase?.cellId === index && (
                             <>
                               {/* Flash */}
                               <motion.div
                                 key={`flash-${gameState.lastPurchase.timestamp}`}
                                 initial={{ opacity: 0, scale: 1 }}
                                 animate={{ 
                                   opacity: [0, 1, 0],
                                   scale: [1, 1.3, 1],
                                 }}
                                 transition={{ duration: 0.6, ease: "easeOut" }}
                                 className="absolute inset-0 bg-white z-30 pointer-events-none rounded-sm"
                               />
                               {/* Particles */}
                               {[...Array(8)].map((_, pi) => (
                                 <motion.div
                                   key={`particle-${gameState.lastPurchase!.timestamp}-${pi}`}
                                   initial={{ opacity: 1, scale: 0, x: "-50%", y: "-50%", left: "50%", top: "50%" }}
                                   animate={{ 
                                     opacity: 0, 
                                     scale: Math.random() * 1.5 + 0.5,
                                     x: `calc(-50% + ${Math.cos(pi * (Math.PI/4)) * 60}px)`,
                                     y: `calc(-50% + ${Math.sin(pi * (Math.PI/4)) * 60}px)`
                                   }}
                                   transition={{ duration: 0.7, ease: "easeOut" }}
                                   className="absolute w-2 h-2 rounded-full z-40 pointer-events-none"
                                   style={{ backgroundColor: owner?.color || '#FFD700', boxShadow: `0 0 10px ${owner?.color || '#FFD700'}` }}
                                 />
                               ))}
                             </>
                          )}

                          {/* Content Container based on orientation */}
                          <div className={`absolute inset-0 flex p-1 ${isLeft || isRight ? 'flex-row' : 'flex-col'} ${isBottom ? 'pt-[20%]' : isTop ? 'pb-[20%]' : isLeft ? 'pr-[20%]' : 'pl-[20%]'}`}>
                              
                              <div className={`flex-1 flex w-full h-full items-center justify-center ${isBottom ? 'flex-col' : isTop ? 'flex-col-reverse' : isLeft ? 'flex-row-reverse' : 'flex-row'}`}>
                                  {/* Logo Area */}
                                  <div className="flex-1 flex items-center justify-center w-full h-full">
                                     <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center bg-black/20 border border-white/5 relative overflow-hidden group-hover:scale-110 transition-transform" 
                                          style={{ boxShadow: cell.color ? `inset 0 0 15px ${cell.color}20` : undefined }}>
                                         {/* Soft Glow */}
                                         <div className="absolute inset-0 opacity-10 blur-sm" style={{ backgroundColor: cell.color || '#3390EC' }} />
                                         <span className="text-sm sm:text-base md:text-xl font-black uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] z-10" 
                                               style={{ color: cell.color || '#e5e5ea' }}>
                                             {cell.name.charAt(0)}
                                         </span>
                                     </div>
                                  </div>
                                  
                                  {/* Price Area */}
                                  {cell.price && (
                                    <div className={`flex items-center justify-center opacity-60 ${isTop || isBottom ? 'w-full pb-0.5' : 'h-full px-0.5'}`}>
                                       {(isLeft || isRight) ? (
                                         <div className="flex flex-col items-center justify-center h-full">
                                           {`$${cell.price}`.split('').map((char, charIdx) => (
                                             <span key={charIdx} className="text-[7px] sm:text-[9px] font-bold text-gray-400 leading-[1]">{char}</span>
                                           ))}
                                         </div>
                                       ) : (
                                         <span className="text-[7px] sm:text-[9px] font-bold text-gray-400 tracking-tighter">${cell.price}</span>
                                       )}
                                    </div>
                                  )}
                              </div>
                          </div>
                      </div>
                    )}

                    {/* Player Tokens inside the cell */}
                    {gameState && (
                      <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-0.5 pointer-events-none z-20">
                         <AnimatePresence mode="popLayout">
                           {gameState.players.filter(p => p.position === index).map(p => (
                              <motion.div 
                                key={p.id}
                                layoutId={`token-${p.id}`}
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1, y: [0, -10, 0] }}
                                transition={{ 
                                  layout: { type: "spring", stiffness: 400, damping: 25 },
                                  y: { duration: 0.2, ease: "easeOut" }
                                }}
                                className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 rounded-full ring-1 ring-[#1C1C1D] shadow-[0_0_10px_rgba(0,0,0,0.6)] overflow-hidden flex items-center justify-center z-30"
                                style={{ backgroundColor: p.color, boxShadow: `0 0 10px ${p.color}80` }}
                              >
                                {p.avatarUrl ? (
                                   <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                                ) : (
                                   <div className="w-full h-full bg-white/20 rounded-full" />
                                )}
                              </motion.div>
                           ))}
                         </AnimatePresence>
                      </div>
                    )}
                  </motion.div>
                );
              })}
        </div>
      </div>

      {/* ACTION AREA BOTTOM (Fixed height) */}
      <div className="h-[120px] shrink-0 p-4 relative z-20">
         {gameState && gameState.isStarted && gameState.turnStatus !== 'GAME_OVER' && gameState.turnStartedAt && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-2 w-full max-w-[200px] flex flex-col items-center gap-1">
               <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: "100%" }}
                    animate={{ width: `${(timeLeft / TURN_DURATION) * 100}%` }}
                    className={`h-full transition-colors ${timeLeft < 10 ? 'bg-red-500' : 'bg-[#3390EC]'}`}
                  />
               </div>
               <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-gray-500'}`}>
                  Оставшееся время: {timeLeft}с
               </span>
            </div>
         )}
         {gameState && (
            <AnimatePresence mode="popLayout">
               {gameState.turnStatus === 'WAITING_ROLL' && isLocalTurn && (
                 <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} key="roll" className="w-full h-full flex items-center justify-center pb-6">
                    <button 
                      onClick={handleRoll}
                      className="w-full max-w-sm h-16 bg-[#3390EC] text-white rounded-[20px] font-black text-xl tracking-wide shadow-[0_0_30px_rgba(51,144,236,0.3)] active:scale-95 transition-transform relative overflow-hidden group"
                    >
                      <span className="relative z-10">
                        {gameState.players.find(p => p.id === localPlayerId)?.inJail ? 'ПОПЫТКА ВЫЙТИ' : 'БРОСИТЬ КУБИКИ'}
                      </span>
                      {/* Pulse effect */}
                      <div className="absolute inset-0 bg-white/20 opacity-0 group-active:opacity-100 transition-opacity"></div>
                    </button>
                 </motion.div>
               )}

               {(gameState.turnStatus === 'MOVING' || gameState.turnStatus === 'ROLLING') && isLocalTurn && (
                 <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} key="moving" className="w-full h-full flex items-center justify-center pb-6">
                   <div className="flex flex-col items-center gap-2">
                      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest animate-pulse">
                        {gameState.turnStatus === 'ROLLING' ? 'Бросок кубиков...' : 'Передвижение...'}
                      </p>
                   </div>
                 </motion.div>
               )}

               {gameState.turnStatus === 'END_TURN' && isLocalTurn && (!gameState.currentAction || gameState.currentAction.type === 'BUY') && (
                 <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} key="end" className="w-full h-full flex flex-col items-center justify-center pb-6 gap-2">
                    <button 
                      onClick={handleNext}
                      className={`w-full max-w-sm h-16 rounded-[20px] font-black text-xl tracking-wide border-2 active:scale-95 transition-transform ${(() => {
                         const player = gameState.players.find(p => p.id === localPlayerId);
                         return player && player.balance < 0 ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed' : 'bg-[#2C2C2E] text-[#3390EC] border-[#3390EC]/30';
                      })()}`}
                    >
                      ЗАВЕРШИТЬ ХОД
                    </button>
                    {(() => {
                       const player = gameState.players.find(p => p.id === localPlayerId);
                       if (player && player.balance < 0) {
                          return (
                             <button
                                onClick={() => {
                                   if (confirm('Вы уверены, что хотите объявить банкротство? Вы выйдете из игры, а ваши активы сгорят.')) {
                                      engineRef.current?.declareBankrupt();
                                   }
                                }}
                                className="w-full max-w-sm h-12 bg-red-500/10 text-red-500 rounded-xl font-bold uppercase active:scale-[0.98] transition-transform border-2 border-red-500/30"
                             >
                                Объявить банкротство
                             </button>
                          );
                       }
                       return null;
                    })()}
                 </motion.div>
               )}
            </AnimatePresence>
         )}

          {gameState && !isLocalTurn && (
            <div className="w-full h-full flex flex-col items-center justify-center pb-6 text-center">
              {gameState.players.find(p => p.id === localPlayerId)?.isBankrupt ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex flex-col items-center">
                    <span className="text-xl font-black text-[#FF3B30] tracking-tighter">СЕТЕВОЕ ФИАСКО</span>
                    <span className="text-xs text-gray-500 uppercase font-bold">Вы выбыли из борьбы</span>
                  </div>
                  <button 
                    onClick={exitRoom}
                    className="px-6 h-10 bg-gray-800 text-white rounded-full text-[10px] font-black uppercase tracking-widest active:scale-[0.98] transition-all hover:bg-[#FF3B30]"
                  >
                    Выйти из комнаты
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: gameState.players.find(p => p.id === gameState.currentPlayerId)?.color }}></div>
                  <span className="text-sm font-bold text-gray-400">Ходит <span className="text-white">{gameState.players.find(p => p.id === gameState.currentPlayerId)?.name}</span></span>
                </div>
              )}
            </div>
          )}
      </div>

      {/* AUCTION OVERLAY */}
      <AnimatePresence>
        {gameState?.turnStatus === 'AUCTION' && gameState.activeAuction && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-0 bottom-0 bg-[#2C2C2E] rounded-t-3xl pt-2 pb-8 px-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-40"
          >
            <div className="w-12 h-1.5 bg-gray-600 rounded-full mx-auto mb-6" />
            
            <div className="absolute top-4 right-6 flex flex-col items-end gap-1">
               <span className={`text-[10px] font-black uppercase tracking-widest ${timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-gray-500'}`}>
                  {timeLeft}с
               </span>
               <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: "100%" }}
                    animate={{ width: `${(timeLeft / TURN_DURATION) * 100}%` }}
                    className={`h-full transition-colors ${timeLeft < 10 ? 'bg-red-500' : 'bg-[#3390EC]'}`}
                  />
               </div>
            </div>

            <div className="text-center mb-6">
              <h3 className="text-2xl font-black text-white uppercase tracking-widest mb-1">АУКЦИОН</h3>
              <p className="text-gray-400 font-medium">Ожесточенные торги за <span className="text-[#3390EC] font-bold">{gameState.cells[gameState.activeAuction.cellId].name}</span></p>
            </div>

            <div className="bg-[#1C1C1D] rounded-2xl p-6 mb-6 text-center border-2 border-dashed border-[#FF9500]/30 shadow-inner">
               <span className="text-[#FF9500] font-black text-sm uppercase tracking-widest block mb-2">Текущая ставка</span>
               <span className="text-5xl font-black text-white">${gameState.activeAuction.currentBid}</span>
               {gameState.activeAuction.highestBidderId && (
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-3">
                     Лидер: <span className="text-[#FF9500]">{gameState.players.find(p => p.id === gameState.activeAuction!.highestBidderId)?.name}</span>
                  </p>
               )}
            </div>

            <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
               {gameState.activeAuction.bidders.map((bidderId, idx) => {
                  const bidder = gameState.players.find(p => p.id === bidderId);
                  const isTheirTurn = idx === gameState.activeAuction!.turnIndex;
                  return (
                      <div key={bidderId} className={`shrink-0 w-12 h-12 rounded-full overflow-hidden border-2 ${isTheirTurn ? 'border-[#3390EC] shadow-[0_0_15px_#3390EC]' : 'border-gray-700 opacity-50'} transition-all`} style={!isTheirTurn ? { backgroundColor: bidder?.color } : { backgroundColor: bidder?.color }}>
                          {bidder?.avatarUrl ? (
                              <img src={bidder.avatarUrl} alt={bidder.name} className="w-full h-full object-cover" />
                          ) : (
                              <span className="text-[10px] font-black w-full h-full flex items-center justify-center">{bidder?.name.charAt(0)}</span>
                          )}
                      </div>
                  );
               })}
            </div>

            {gameState.activeAuction.bidders[gameState.activeAuction.turnIndex] === localPlayerId ? (
               <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                     {[10, 50, 100].map(add => (
                        <button 
                          key={add}
                          onClick={() => {
                             engineRef.current?.auctionBid(localPlayerId, gameState.activeAuction!.currentBid + add);
                          }}
                          className="flex-1 bg-[#3390EC]/10 text-[#3390EC] border-2 border-[#3390EC]/30 rounded-xl py-3 font-black text-sm uppercase active:scale-[0.98] transition-transform"
                        >
                          +{add}
                        </button>
                     ))}
                  </div>
                  <div className="flex justify-between gap-3 items-center w-full mt-2">
                     <button
                        onClick={() => {
                           engineRef.current?.auctionPass(localPlayerId);
                        }}
                        className="h-14 px-6 bg-red-500/10 text-red-500 border-2 border-red-500/30 rounded-xl font-bold uppercase active:scale-[0.98] transition-transform"
                     >
                        Пас
                     </button>
                     
                     <div className="flex items-center">
                        <span className="text-gray-500 text-xs font-bold uppercase">Ваш ход</span>
                     </div>
                  </div>
               </div>
            ) : (
               <div className="w-full py-4 text-center border-2 border-dashed border-gray-700 bg-gray-800 rounded-2xl">
                  <span className="text-gray-400 font-bold uppercase tracking-widest animate-pulse text-sm">
                     Ожидание хода других...
                  </span>
               </div>
            )}
            
          </motion.div>
        )}
      </AnimatePresence>

      {/* BOTTOM SHEET: BUY ACTION */}
      <AnimatePresence>
        {gameState?.turnStatus === 'ACTION_REQUIRED' && gameState.currentAction?.type === 'BUY' && isLocalTurn && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-0 bottom-0 bg-[#2C2C2E] rounded-t-3xl pt-2 pb-8 px-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-40"
          >
            {/* Pill */}
            <div className="w-12 h-1.5 bg-gray-500 rounded-full mx-auto mb-6 opacity-30"></div>
            
            <h2 className="text-2xl font-black mb-2 leading-tight">
              {gameState.cells[gameState.players.find(p => p.id === localPlayerId)?.position || 0].name}
            </h2>
            <p className="text-sm text-gray-400 mb-6 leading-relaxed">
              {gameState.cells[gameState.players.find(p => p.id === localPlayerId)?.position || 0].description}
            </p>

            <div className="flex justify-between items-end mb-8 bg-[#1C1C1D] p-4 rounded-2xl">
               <div>
                  <p className="text-xs text-gray-500 uppercase font-bold mb-1">Стоимость актива</p>
                  <p className="text-3xl font-black text-[#5E5CE6]">${gameState.currentAction.amount}</p>
               </div>
               <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase font-bold mb-1">Рента</p>
                  <p className="text-xl font-bold text-white">${gameState.cells[gameState.players.find(p => p.id === localPlayerId)?.position || 0].rent}</p>
               </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => {
                  engineRef.current?.skipBuy();
                }}
                className="flex-1 max-w-[100px] h-14 bg-transparent border-2 border-gray-600 text-gray-300 rounded-2xl font-bold active:bg-gray-700 transition-colors"
              >
                ПАС
              </button>
              <button 
                onClick={handleBuy}
                className={`flex-1 h-14 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg flex flex-col items-center justify-center ${(() => {
                    const player = gameState.players.find(p => p.id === localPlayerId);
                    const cell = gameState.cells[player?.position || 0];
                    return (player?.balance || 0) >= (cell.price || 0);
                })() ? 'bg-[#3390EC] text-white shadow-[#3390EC]/20 active:scale-[0.98]' : 'bg-[#FF3B30] text-white shadow-[#FF3B30]/30'}`}
              >
                <span>КУПИТЬ АКТИВ</span>
                {(() => {
                    const player = gameState.players.find(p => p.id === localPlayerId);
                    const cell = gameState.cells[player?.position || 0];
                    const canAfford = (player?.balance || 0) >= (cell.price || 0);
                    return !canAfford && <span className="text-[8px] opacity-70 mt-0.5">Недостаточно средств</span>;
                })()}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BOTTOM SHEET: EVENT (CHANCE / TAX / RENT / SPECIAL) */}
      <AnimatePresence>
        {gameState?.turnStatus === 'END_TURN' && isLocalTurn && gameState.currentAction && gameState.currentAction.type !== 'BUY' && (
          <motion.div 
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`fixed inset-x-0 bottom-0 rounded-t-3xl pt-2 pb-8 px-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-40 ${gameState.currentAction.type === 'CHANCE' ? 'bg-[#1C1C1D] glitch-container' : 'bg-[#2C2C2E]'}`}
            style={{ 
              boxShadow: gameState.currentAction.type === 'CHANCE' ? '0 0 40px rgba(175, 82, 222, 0.5), inset 0 0 20px rgba(175, 82, 222, 0.5)' : undefined 
            }}
          >
            {gameState.currentAction.type === 'CHANCE' && (
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes glitch {
                  0% { clip-path: inset(10% 0 80% 0); transform: translate(-2px, 2px); }
                  20% { clip-path: inset(80% 0 5% 0); transform: translate(2px, -2px); }
                  40% { clip-path: inset(50% 0 30% 0); transform: translate(-2px, -2px); }
                  60% { clip-path: inset(15% 0 65% 0); transform: translate(2px, 2px); }
                  80% { clip-path: inset(70% 0 20% 0); transform: translate(-2px, 2px); }
                  100% { clip-path: inset(10% 0 80% 0); transform: translate(2px, -2px); }
                }
                .glitch-container::before {
                  content: "";
                  position: absolute;
                  inset: 0;
                  background: rgba(175, 82, 222, 0.1);
                  mix-blend-mode: color-dodge;
                  pointer-events: none;
                  animation: glitch 0.2s cubic-bezier(.25, .46, .45, .94) both infinite;
                }
              `}} />
            )}
            {/* Pill */}
            <div className="w-12 h-1.5 bg-gray-500 rounded-full mx-auto mb-6 opacity-30"></div>
            
            <h2 className="text-2xl font-black mb-2 leading-tight" style={{ color: gameState.currentAction.type === 'CHANCE' ? '#AF52DE' : gameState.currentAction.type === 'TAX' || gameState.currentAction.type === 'RENT' ? '#FF3B30' : '#FFCC00' }}>
               {gameState.currentAction.type === 'CHANCE' ? 'ИНСАЙД' : 
                gameState.currentAction.type === 'TAX' ? 'ШТРАФ' : 
                gameState.currentAction.type === 'RENT' ? 'ОПЛАТА АРЕНДЫ' : 'СОБЫТИЕ'}
            </h2>
            <p className="text-lg text-white mb-8 leading-relaxed font-bold">
               {gameState.currentAction.message || `Списание средств: $${gameState.currentAction.amount}`}
            </p>

            <button 
              onClick={handleNext}
              className="w-full h-14 bg-[#3390EC] text-white rounded-2xl font-bold text-lg active:scale-[0.98] transition-transform shadow-lg shadow-[#3390EC]/20"
            >
              ПОНЯТНО
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PENDING TRADE OFFER MODAL (for receiver) */}
      <AnimatePresence>
         {gameState?.pendingTrade && gameState.pendingTrade.toId === localPlayerId && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            >
               <motion.div 
                 initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
                 className="bg-[#2C2C2E] w-full max-w-sm rounded-[32px] p-8 shadow-2xl relative"
               >
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-[#34C759] rounded-3xl shadow-[0_0_30px_#34C759] flex items-center justify-center -rotate-12">
                     <span className="text-4xl text-white font-black">🤝</span>
                  </div>
                  <h3 className="text-center font-black text-2xl text-white mt-10 mb-2">ПРЕДЛОЖЕНИЕ ОБМЕНА</h3>
                  <p className="text-center text-gray-400 text-sm mb-6">
                     <span className="text-white font-bold">{gameState.players.find(p => p.id === gameState.pendingTrade!.fromId)?.name}</span> предлагает сделку
                  </p>
                  
                  <div className="space-y-4 mb-8">
                      <div className="bg-[#1C1C1D] rounded-2xl p-4 border border-gray-700 text-left">
                         <span className="text-[#34C759] font-bold uppercase tracking-widest text-[10px] mb-2 block">Вы получите</span>
                         {gameState.pendingTrade.offerMoney > 0 && <div className="text-white font-bold text-sm mb-1">+ ${gameState.pendingTrade.offerMoney} доплаты</div>}
                         {gameState.pendingTrade.offerCellIds.length > 0 && gameState.pendingTrade.offerCellIds.map((id: number) => (
                             <div key={id} className="text-white text-sm font-bold flex items-center gap-2">
                                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: gameState.cells[id].color }} />
                                 {gameState.cells[id].name}
                             </div>
                         ))}
                         {gameState.pendingTrade.offerMoney === 0 && gameState.pendingTrade.offerCellIds.length === 0 && <span className="text-gray-500 text-sm">Ничего</span>}
                      </div>

                      <div className="bg-[#1C1C1D] rounded-2xl p-4 border border-gray-700 text-left">
                         <span className="text-[#FF3B30] font-bold uppercase tracking-widest text-[10px] mb-2 block">Вы отдадите</span>
                         {gameState.pendingTrade.requestMoney > 0 && <div className="text-white font-bold text-sm mb-1">- ${gameState.pendingTrade.requestMoney} доплаты</div>}
                         {gameState.pendingTrade.requestCellIds.length > 0 && gameState.pendingTrade.requestCellIds.map((id: number) => (
                             <div key={id} className="text-white text-sm font-bold flex items-center gap-2">
                                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: gameState.cells[id].color }} />
                                 {gameState.cells[id].name}
                             </div>
                         ))}
                         {gameState.pendingTrade.requestMoney === 0 && gameState.pendingTrade.requestCellIds.length === 0 && <span className="text-gray-500 text-sm">Ничего</span>}
                      </div>
                  </div>

                  <div className="flex gap-3">
                     <button 
                       onClick={() => {
                          engineRef.current?.rejectTrade();
                       }}
                       className="flex-1 h-14 bg-gray-800 text-gray-400 rounded-2xl font-bold uppercase active:scale-95 transition-transform"
                     >
                        Отклонить
                     </button>
                     <button 
                       onClick={() => {
                          const player = gameState.players.find(p => p.id === localPlayerId);
                          if (player && player.balance >= gameState.pendingTrade!.requestMoney) {
                             engineRef.current?.acceptTrade();
                          } else {
                             alert("Недостаточно средств для доплаты!");
                          }
                       }}
                       className="flex-[2] h-14 bg-[#34C759] text-white rounded-2xl font-black uppercase shadow-lg shadow-[#34C759]/20 active:scale-95 transition-transform"
                     >
                        Принять
                     </button>
                  </div>
               </motion.div>
            </motion.div>
         )}
      </AnimatePresence>

      {/* TRADE SETUP MODAL */}
      <AnimatePresence>
        {advancedTradeSetup && gameState && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#2C2C2E] w-full max-w-2xl rounded-[32px] p-6 shadow-2xl space-y-6"
            >
              <div className="text-center">
                <h3 className="text-2xl font-black text-white uppercase tracking-widest">Обмен Активами</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="bg-[#1C1C1D] rounded-2xl p-4">
                    <h4 className="text-[#34C759] font-bold mb-3 uppercase text-xs tracking-widest">Вы предлагаете</h4>
                    <div className="space-y-3">
                        <div>
                            <label className="text-gray-400 text-xs block mb-1">Доплата ($)</label>
                            <input type="number" className="w-full bg-[#2C2C2E] text-white rounded-xl p-3 font-bold outline-none" value={advancedTradeSetup.offerMoney} onChange={e => setAdvancedTradeSetup({...advancedTradeSetup, offerMoney: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs block mb-1">Ваши активы</label>
                            <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                                {gameState.cells.filter(c => c.ownerId === localPlayerId).map(cell => (
                                    <label key={cell.id} className="flex items-center gap-2 p-2 rounded-lg bg-[#2C2C2E] cursor-pointer">
                                        <input type="checkbox" checked={advancedTradeSetup.offerCells.includes(cell.id)} onChange={(e) => {
                                            const newCells = e.target.checked 
                                                ? [...advancedTradeSetup.offerCells, cell.id] 
                                                : advancedTradeSetup.offerCells.filter(id => id !== cell.id);
                                            setAdvancedTradeSetup({...advancedTradeSetup, offerCells: newCells});
                                        }} className="accent-[#34C759]" />
                                        <span className="text-white text-sm truncate flex-1">{cell.name}</span>
                                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cell.color }} />
                                    </label>
                                ))}
                                {gameState.cells.filter(c => c.ownerId === localPlayerId).length === 0 && <div className="text-gray-500 text-sm">Нет активов</div>}
                            </div>
                        </div>
                    </div>
                 </div>
                 
                 <div className="bg-[#1C1C1D] rounded-2xl p-4">
                    <h4 className="text-[#3390EC] font-bold mb-3 uppercase text-xs tracking-widest">Вы просите</h4>
                    <div className="space-y-3">
                        <div>
                            <label className="text-gray-400 text-xs block mb-1">Игрок</label>
                            <select className="w-full bg-[#2C2C2E] text-white rounded-xl p-3 font-bold outline-none mb-3" value={advancedTradeSetup.targetId} onChange={e => setAdvancedTradeSetup({...advancedTradeSetup, targetId: e.target.value, requestCells: []})}>
                                <option value="">Выберите игрока...</option>
                                {gameState.players.filter(p => p.id !== localPlayerId && !p.isBankrupt).map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs block mb-1">Они доплачивают ($)</label>
                            <input type="number" className="w-full bg-[#2C2C2E] text-white rounded-xl p-3 font-bold outline-none" value={advancedTradeSetup.requestMoney} onChange={e => setAdvancedTradeSetup({...advancedTradeSetup, requestMoney: e.target.value})} disabled={!advancedTradeSetup.targetId} />
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs block mb-1">Их активы</label>
                            <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                                {advancedTradeSetup.targetId ? gameState.cells.filter(c => c.ownerId === advancedTradeSetup.targetId).map(cell => (
                                    <label key={cell.id} className="flex items-center gap-2 p-2 rounded-lg bg-[#2C2C2E] cursor-pointer">
                                        <input type="checkbox" checked={advancedTradeSetup.requestCells.includes(cell.id)} onChange={(e) => {
                                            const newCells = e.target.checked 
                                                ? [...advancedTradeSetup.requestCells, cell.id] 
                                                : advancedTradeSetup.requestCells.filter(id => id !== cell.id);
                                            setAdvancedTradeSetup({...advancedTradeSetup, requestCells: newCells});
                                        }} className="accent-[#3390EC]" />
                                        <span className="text-white text-sm truncate flex-1">{cell.name}</span>
                                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cell.color }} />
                                    </label>
                                )) : <div className="text-gray-500 text-sm">Сначала выберите игрока</div>}
                                {advancedTradeSetup.targetId && gameState.cells.filter(c => c.ownerId === advancedTradeSetup.targetId).length === 0 && <div className="text-gray-500 text-sm">Нет активов</div>}
                            </div>
                        </div>
                    </div>
                 </div>
              </div>

              <div className="flex gap-3 pt-4">
                 <button 
                   onClick={() => setAdvancedTradeSetup(null)}
                   className="flex-1 h-14 bg-gray-800 text-white rounded-2xl font-bold uppercase active:scale-[0.98] transition-transform"
                 >
                   Отмена
                 </button>
                 <button 
                   onClick={() => {
                      if (!advancedTradeSetup.targetId) {
                         alert("Выберите игрока");
                         return;
                      }
                      const offerNum = parseInt(advancedTradeSetup.offerMoney) || 0;
                      const reqNum = parseInt(advancedTradeSetup.requestMoney) || 0;
                      if (offerNum < 0 || reqNum < 0) return;
                      
                      engineRef.current?.proposeAdvancedTrade(
                          advancedTradeSetup.targetId,
                          offerNum,
                          reqNum,
                          advancedTradeSetup.offerCells,
                          advancedTradeSetup.requestCells
                      );
                      setAdvancedTradeSetup(null);
                      setZoomedCell(null);
                   }}
                   className={`flex-[2] h-14 rounded-2xl font-black uppercase transition-all shadow-lg ${advancedTradeSetup.targetId ? 'bg-[#3390EC] text-white shadow-[#3390EC]/20 active:scale-[0.98]' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
                 >
                   Предложить
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LOBBY VIEW / SETTINGS */}
      {!gameState?.isStarted && isJoined && !gameState?.players.find(p => p.id === localPlayerId)?.isHost && (
        <div className="absolute inset-0 bg-[#1C1C1D] z-30 flex flex-col items-center justify-center p-6 text-white text-center">
           <div className="w-full max-w-sm space-y-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-[#3390EC]">ЛОББИ</h2>
                <p className="text-sm text-gray-400">Ожидание игроков...</p>
              </div>

              <div className="space-y-3 bg-[#2C2C2E] p-4 rounded-2xl">
                 {gameState?.players.map(p => (
                   <div key={p.id} className="flex items-center justify-between">
                      <button onClick={() => setViewingPlayerProfileId(p.id)} className="flex items-center gap-3 active:scale-95 transition-transform text-left">
                         <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center" style={{ backgroundColor: p.color }}>
                            {p.avatarUrl ? (
                               <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                               <span className="text-[10px] font-bold">{p.name.charAt(0)}</span>
                            )}
                         </div>
                         <span className="font-bold">{p.name} {p.id === localPlayerId ? '(Вы)' : ''}</span>
                      </button>
                      {p.isHost && <span className="text-[10px] bg-[#3390EC] px-2 py-0.5 rounded-full font-black uppercase">Хост</span>}
                   </div>
                 ))}
              </div>

              {!gameState?.players.find(p => p.id === localPlayerId)?.isHost && (
                <div className="space-y-4 w-full">
                  <p className="text-gray-500 animate-pulse italic">Дождитесь, пока хост запустит систему...</p>
                  <button 
                     onClick={exitRoom}
                     className="w-full h-12 text-gray-500 font-black uppercase text-xs tracking-widest active:text-white"
                   >
                     ← К списку игр
                   </button>
                </div>
              )}
           </div>
        </div>
      )}
          </motion.main>
        )}
      </AnimatePresence>

      {/* SURRENDER MODAL */}
      <AnimatePresence>
        {isSurrenderModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
             <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="bg-[#2C2C2E] p-8 rounded-3xl w-full max-w-sm text-center border border-white/5"
             >
                <h3 className="text-2xl font-black mb-2">ПОКИНУТЬ СЕТЬ?</h3>
                <p className="text-gray-400 mb-8">Вы потеряете все активы и выйдете из игры.</p>
                <div className="flex flex-col gap-3">
                   <button onClick={handleSurrender} className="w-full h-14 bg-[#FF3B30] text-white rounded-2xl font-black">СДАТЬСЯ</button>
                   <button onClick={() => setIsSurrenderModalOpen(false)} className="w-full h-14 bg-gray-700 text-white rounded-2xl font-bold">ОТМЕНА</button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* GAME OVER MODAL */}
      <AnimatePresence>
        {gameState?.turnStatus === 'GAME_OVER' && (
          <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center p-6 bg-[#1C1C1D]/95 overflow-y-auto">
             <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-sm space-y-6"
             >
                <div className="text-center">
                  <div className="w-20 h-20 bg-yellow-500 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl shadow-[0_0_50px_rgba(234,179,8,0.5)]">
                     🏆
                  </div>
                  <h2 className="text-4xl font-black mb-1 text-white uppercase tracking-tighter">ФИНАЛ</h2>
                  <p className="text-lg text-[#3390EC] font-bold">Победитель: {gameState.players.find(p => p.id === gameState.winnerId)?.name}</p>
                </div>
                
                {gameState.stats && (
                  <div className="bg-[#2C2C2E] p-6 rounded-3xl space-y-6">
                    <h3 className="text-center text-xs text-gray-400 font-extrabold tracking-[0.3em] uppercase">Статистика матча</h3>
                    
                    <div className="space-y-4">
                      {/* Richest on turn 10 */}
                      {gameState.stats.richestOnTurn10 && (
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          <span className="text-sm font-bold text-gray-300">Победитель (Round 10)</span>
                          <span className="text-sm font-black text-[#5E5CE6]">{gameState.players.find(p => p.id === gameState.stats!.richestOnTurn10)?.name || gameState.stats.richestOnTurn10}</span>
                        </div>
                      )}

                      {/* Best Rented Cell */}
                      {Object.keys(gameState.stats.cellRents || {}).length > 0 && (
                        <div className="flex items-center justify-between border-b border-white/5 pb-3">
                          <span className="text-sm font-bold text-gray-300">Самый доходный актив</span>
                          <span className="text-sm font-black text-[#34C759]">
                            {(() => {
                               const bestCellId = Object.keys(gameState.stats.cellRents).reduce((a, b) => gameState.stats!.cellRents[parseInt(a)] > gameState.stats!.cellRents[parseInt(b)] ? a : b);
                               return gameState.cells[parseInt(bestCellId)].name;
                            })()}
                          </span>
                        </div>
                      )}

                      {/* Total Transactions */}
                      <div className="flex items-center justify-between border-b border-white/5 pb-3">
                        <span className="text-sm font-bold text-gray-300">Всего транзакций</span>
                        <span className="text-sm font-black text-white">{gameState.stats.totalTransactions}</span>
                      </div>
                      
                      {/* Round reached */}
                      <div className="flex items-center justify-between border-b border-white/5 pb-3">
                        <span className="text-sm font-bold text-gray-300">Всего раундов</span>
                        <span className="text-sm font-black text-white">{gameState.roundNumber}</span>
                      </div>
                    </div>
                  </div>
                )}

                <button onClick={() => window.location.reload()} className="w-full h-14 bg-[#3390EC] hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(51,144,236,0.3)] rounded-2xl font-black text-white tracking-widest uppercase">НА ГЛАВНУЮ</button>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* ROOM SETTINGS MODAL */}
      <AnimatePresence>
        {isRoomSettingsOpen && (
          <div className="fixed inset-0 z-[105] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="w-full max-w-sm bg-[#1C1C1D] p-8 rounded-[32px] border border-white/10 shadow-2xl space-y-6"
             >
                <div className="text-center relative">
                   <button 
                     onClick={() => setIsRoomSettingsOpen(false)}
                     className="absolute left-0 top-0 w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
                   >
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                   </button>
                   <h3 className="text-xl font-black text-[#3390EC] uppercase tracking-[0.2em]">Настройки</h3>
                </div>

                <div className="space-y-4">
                   <div>
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2 ml-1 tracking-widest">Название офиса</p>
                      <input 
                        className="w-full bg-[#2C2C2E] p-4 rounded-xl text-white font-bold outline-none border border-white/5 focus:border-[#3390EC]/40 transition-all"
                        value={roomSettings.roomName}
                        onChange={(e) => setRoomSettings(prev => ({...prev, roomName: e.target.value}))}
                      />
                   </div>
                   <div>
                     <p className="text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Пароль доступа</p>
                     <input 
                       type="password"
                       className="w-full bg-[#2C2C2E] p-4 rounded-xl text-white font-bold outline-none focus:ring-1 focus:ring-[#3390EC]"
                       value={roomSettings.password}
                       onChange={(e) => setRoomSettings(prev => ({...prev, password: e.target.value}))}
                       placeholder="Необязательно"
                     />
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                     <div>
                       <p className="text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Игроков</p>
                       <select 
                         className="w-full bg-[#2C2C2E] p-4 rounded-xl text-white font-bold outline-none"
                         value={roomSettings.maxPlayers}
                         onChange={(e) => setRoomSettings(prev => ({...prev, maxPlayers: parseInt(e.target.value)}))}
                       >
                         <option value={2}>2</option>
                         <option value={3}>3</option>
                         <option value={4}>4</option>
                       </select>
                     </div>
                     <div>
                       <p className="text-xs font-bold text-gray-500 uppercase mb-1 ml-1">Капитал</p>
                       <select 
                         className="w-full bg-[#2C2C2E] p-4 rounded-xl text-white font-bold outline-none"
                         value={roomSettings.initialBalance}
                         onChange={(e) => setRoomSettings(prev => ({...prev, initialBalance: parseInt(e.target.value)}))}
                      >
                        <option value={1000}>$1000</option>
                        <option value={1500}>$1500</option>
                        <option value={2000}>$2000</option>
                        <option value={2500}>$2500</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    if (!isJoined) {
                      startAsHost();
                    } else if (gameState?.players.find(p => p.id === localPlayerId)?.isHost) {
                      engineRef.current?.updateSettings({
                        roomName: roomSettings.roomName,
                        roomPassword: roomSettings.password,
                        maxPlayers: roomSettings.maxPlayers,
                        initialBalance: roomSettings.initialBalance
                      });
                    }
                    setIsRoomSettingsOpen(false);
                  }} 
                  className="w-full h-14 bg-[#3390EC] text-white rounded-2xl font-black text-lg active:scale-95 transition-all"
                >
                  {isJoined ? 'СОХРАНИТЬ' : 'СОЗДАТЬ ОФИС'}
                </button>

             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CHAT MODAL */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full max-w-sm bg-[#1C1C1D] z-[120] flex flex-col shadow-2xl border-l border-white/5"
          >
             <div className="h-[70px] flex items-center justify-between px-6 border-b border-white/5">
                <button onClick={() => setIsChatOpen(false)} className="w-10 h-10 rounded-full bg-[#2C2C2E] flex items-center justify-center">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <span className="font-black text-lg text-[#3390EC] uppercase tracking-widest">Сетевой Чат</span>
                <div className="w-10" />
             </div>

             <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {gameState?.chatMessages.map(msg => {
                  const sender = gameState.players.find(p => p.id === msg.senderId);
                  return (
                    <div key={msg.id} className={`flex gap-3 ${msg.senderId === localPlayerId ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-[#2C2C2E] mt-auto">
                         {sender?.avatarUrl ? (
                            <img src={sender.avatarUrl} alt={msg.senderName} className="w-full h-full object-cover" />
                         ) : (
                            <div className="w-full h-full flex items-center justify-center font-bold text-[10px]" style={{ backgroundColor: sender?.color || '#555' }}>
                               {msg.senderName.charAt(0)}
                            </div>
                         )}
                      </div>
                      <div className={`flex flex-col ${msg.senderId === localPlayerId ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black uppercase text-gray-500" style={{ color: msg.type === 'system' ? '#3390EC' : sender?.color }}>
                            {msg.senderName}
                          </span>
                        </div>
                        <div className={`p-3 rounded-2xl max-w-[200px] text-sm font-medium ${msg.senderId === localPlayerId ? 'bg-[#3390EC] text-white rounded-tr-none shadow-[0_4px_12px_rgba(51,144,236,0.2)]' : 'bg-[#2C2C2E] text-gray-200 rounded-tl-none'}`}>
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
             </div>

             <div className="p-4 border-t border-white/5 bg-[#1C1C1D]">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                  className="flex gap-2"
                >
                   <input 
                     value={chatInput}
                     onChange={(e) => setChatInput(e.target.value)}
                     placeholder="Введите сообщение..."
                     className="flex-1 bg-[#2C2C2E] h-12 rounded-xl px-4 text-sm font-bold outline-none focus:ring-1 focus:ring-[#3390EC] border border-white/5"
                   />
                   <button 
                     type="submit"
                     disabled={!chatInput.trim()}
                     className="w-12 h-12 bg-[#3390EC] rounded-xl flex items-center justify-center disabled:opacity-50"
                   >
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                   </button>
                </form>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* BOTTOM SHEET: VIEW CELL */}
      <AnimatePresence>
        {zoomedCell !== null && (
          <>
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="fixed inset-0 bg-black/60 z-30 touch-none"
               onClick={() => setZoomedCell(null)}
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-x-0 bottom-0 bg-[#2C2C2E] rounded-t-3xl pt-2 pb-8 px-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-40 overflow-y-auto max-h-[80vh]"
            >
              {/* Pill */}
              <div className="w-12 h-1.5 bg-gray-500 rounded-full mx-auto mb-6 opacity-30"></div>

              <div className="flex justify-between items-center mb-6">
                <button 
                  onClick={() => setZoomedCell(null)}
                  className="w-10 h-10 rounded-full bg-[#1C1C1D] flex items-center justify-center text-gray-500 shadow-lg active:scale-95 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <div className="text-right">
                  <h2 className="text-3xl font-black italic tracking-tighter uppercase whitespace-pre-line leading-none">
                    {cellsToDraw[zoomedCell].name}
                  </h2>
                </div>
              </div>

              {cellsToDraw[zoomedCell].color && (
                <div className="h-8 rounded-lg mb-4 opacity-80" style={{ backgroundColor: cellsToDraw[zoomedCell].color }} />
              )}

              <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                {cellsToDraw[zoomedCell].description}
              </p>

              {(cellsToDraw[zoomedCell].price || cellsToDraw[zoomedCell].rent) ? (
                 <div className="grid grid-cols-2 gap-4 mb-8 bg-[#1C1C1D] p-4 rounded-2xl">
                    {cellsToDraw[zoomedCell].price && (
                       <div>
                          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Оценка</p>
                          <p className="text-xl font-bold text-white">${cellsToDraw[zoomedCell].price}</p>
                       </div>
                    )}
                    {cellsToDraw[zoomedCell].rent && (
                       <div className="text-right">
                          <p className="text-xs text-gray-500 uppercase font-bold mb-1">Рента</p>
                          <p className="text-xl font-bold text-white">${cellsToDraw[zoomedCell].rent}</p>
                       </div>
                    )}
                 </div>
              ) : null}

              {cellsToDraw[zoomedCell].ownerId && (
                 <div className="mb-8 p-4 bg-[#1C1C1D] rounded-2xl flex items-center gap-4 border border-white/5 shadow-inner">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black text-white shadow-lg" style={{ backgroundColor: gameState?.players.find(p => p.id === cellsToDraw[zoomedCell].ownerId)?.color }}>
                       {gameState?.players.find(p => p.id === cellsToDraw[zoomedCell].ownerId)?.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                       <p className="text-xs text-gray-500 uppercase font-bold tracking-tight">Владелец</p>
                       <p className="font-bold text-white text-lg">{gameState?.players.find(p => p.id === cellsToDraw[zoomedCell].ownerId)?.name}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-xs text-gray-500 uppercase font-bold tracking-tight">Капитал</p>
                       <p className="font-black text-[#34C759] text-lg">${gameState?.players.find(p => p.id === cellsToDraw[zoomedCell].ownerId)?.balance}</p>
                    </div>
                 </div>
              )}

              {cellsToDraw[zoomedCell].type === 'ASSET' && cellsToDraw[zoomedCell].ownerId && cellsToDraw[zoomedCell].ownerId !== localPlayerId && !cellsToDraw[zoomedCell].isMortgaged && (
                 <div className="mb-6 mt-4">
                     <button 
                       onClick={() => {
                           setZoomedCell(null);
                           setAdvancedTradeSetup({ active: true, targetId: cellsToDraw[zoomedCell].ownerId!, offerCells: [], requestCells: [zoomedCell!], offerMoney: '0', requestMoney: '0' });
                       }}
                       className="w-full h-12 rounded-xl font-bold text-xs uppercase bg-[#3390EC]/10 text-[#3390EC] border-2 border-[#3390EC]/30 active:scale-[0.98] transition-transform"
                     >
                       Предложить обмен
                     </button>
                 </div>
              )}

              {/* Upgrade Logic */}
              {cellsToDraw[zoomedCell].type === 'ASSET' && cellsToDraw[zoomedCell].ownerId === localPlayerId && (
                <div className="mb-6 space-y-4">
                   {/* Sell Upgrade */}
                   {(cellsToDraw[zoomedCell].upgradeLevel || 0) > 0 && (
                      <button 
                        onClick={() => engineRef.current?.sellUpgrade(zoomedCell!)}
                        className="w-full h-12 rounded-xl font-bold text-xs uppercase bg-[#FF9500]/10 text-[#FF9500] border-2 border-[#FF9500]/30 active:scale-[0.98] transition-transform"
                      >
                        Продать улучшение (+${Math.floor((cellsToDraw[zoomedCell].price || 100) * 0.8 * 0.5)})
                      </button>
                   )}

                   {/* Upgrade Assset */}
                   {(cellsToDraw[zoomedCell].upgradeLevel || 0) < 2 && !cellsToDraw[zoomedCell].isMortgaged && (
                   <div className="space-y-4">
                     <div className="flex items-center justify-between p-4 bg-[#1C1C1D] rounded-2xl border-2 border-dashed border-[#3390EC]/30">
                       <div>
                         <p className="text-xs text-[#3390EC] font-black uppercase mb-1">Доступна модернизация</p>
                         <p className="font-bold text-white text-lg">
                           {(cellsToDraw[zoomedCell].upgradeLevel || 0) === 0 ? 'Подключить Трафик' : 'Премиум-Серверы'}
                         </p>
                         <p className="text-xs text-gray-500 mt-1">
                           Рента увеличится до ${ (cellsToDraw[zoomedCell].upgradeLevel || 0) === 0 ? (cellsToDraw[zoomedCell].rent || 0) * 3 : (cellsToDraw[zoomedCell].rent || 0) * 8 }
                         </p>
                       </div>
                       <div className="text-right">
                         <p className="text-xl font-black text-white">${Math.floor((cellsToDraw[zoomedCell].price || 100) * 0.8)}</p>
                       </div>
                     </div>
                       <button 
                         onClick={() => {
                           const cost = Math.floor((cellsToDraw[zoomedCell].price || 100) * 0.8);
                           const player = gameState?.players.find(p => p.id === localPlayerId);
                           if (player && player.balance >= cost) {
                             handleUpgrade(zoomedCell!);
                           }
                         }}
                         className={`w-full h-12 rounded-xl font-bold text-xs uppercase transition-all shadow-lg flex items-center justify-center ${(() => {
                           const cost = Math.floor((cellsToDraw[zoomedCell].price || 100) * 0.8);
                           const player = gameState?.players.find(p => p.id === localPlayerId);
                           return player && player.balance >= cost ? 'bg-[#3390EC] text-white' : 'bg-gray-800 text-gray-500 cursor-not-allowed';
                         })()}`}
                       >
                         ПРОКАЧАТЬ
                       </button>
                   </div>
                   )}

                   {/* Mortgage / Unmortgage */}
                   {(cellsToDraw[zoomedCell].upgradeLevel || 0) === 0 && (
                     !cellsToDraw[zoomedCell].isMortgaged ? (
                        <div className="flex gap-2 w-full">
                           <button 
                             onClick={() => engineRef.current?.mortgageAsset(zoomedCell!)}
                             className="flex-1 h-12 rounded-xl font-bold text-xs uppercase bg-[#FF3B30]/10 text-[#FF3B30] border-2 border-[#FF3B30]/30 active:scale-[0.98] transition-transform"
                           >
                             Заложить (+${Math.floor((cellsToDraw[zoomedCell].price || 0) * 0.5)})
                           </button>
                           <button 
                             onClick={() => {
                                 setZoomedCell(null);
                                 setAdvancedTradeSetup({ active: true, targetId: '', offerCells: [zoomedCell!], requestCells: [], offerMoney: '0', requestMoney: '0' });
                             }}
                             className="flex-1 h-12 rounded-xl font-bold text-xs uppercase bg-[#34C759]/10 text-[#34C759] border-2 border-[#34C759]/30 active:scale-[0.98] transition-transform"
                           >
                             Предложить обмен
                           </button>
                        </div>
                     ) : (
                        <div className="space-y-4">
                           <div className="p-3 bg-red-500/10 border-2 border-dashed border-red-500/30 rounded-xl text-center">
                              <span className="text-red-500 text-xs font-bold uppercase">Осталось ходов до списания: {cellsToDraw[zoomedCell].mortgageTurnsLeft}</span>
                           </div>
                           <button 
                             onClick={() => engineRef.current?.unmortgageAsset(zoomedCell!)}
                             className={`w-full h-12 rounded-xl font-bold text-xs uppercase active:scale-[0.98] transition-transform ${(() => {
                               const cost = Math.floor((cellsToDraw[zoomedCell].price || 0) * 0.6);
                               const player = gameState?.players.find(p => p.id === localPlayerId);
                               return player && player.balance >= cost ? 'bg-[#34C759]/20 text-[#34C759] border-2 border-[#34C759]/30' : 'bg-gray-800 text-gray-500 cursor-not-allowed border-2 border-gray-700';
                             })()}`}
                           >
                             Выкупить актив (-${Math.floor((cellsToDraw[zoomedCell].price || 0) * 0.6)})
                           </button>
                        </div>
                     )
                   )}
                </div>
              )}

              {cellsToDraw[zoomedCell].upgradeLevel ? (
                <div className="mb-8 flex gap-2">
                  {[...Array(cellsToDraw[zoomedCell].upgradeLevel)].map((_, i) => (
                    <div key={i} className="flex-1 h-2 bg-[#3390EC] rounded-full shadow-[0_0_8px_#3390EC]" />
                  ))}
                  {[...Array(2 - (cellsToDraw[zoomedCell].upgradeLevel || 0))].map((_, i) => (
                    <div key={i} className="flex-1 h-2 bg-gray-800 rounded-full" />
                  ))}
                </div>
              ) : null}

              <button 
                onClick={() => setZoomedCell(null)}
                className="w-full h-14 bg-[#3390EC]/10 text-[#3390EC] rounded-2xl font-black text-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
              >
                ЗАКРЫТЬ
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
