'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BOARD_CELLS } from '@/lib/board-data';
import { GameEngine } from '@/lib/game-engine';
import { NetworkManager } from '@/lib/network-manager';
import { GameState, Player } from '@/types/game';

// Custom Hook to manage dice animation
function useFastDiceRoller(lastRoll: [number, number] | null | undefined) {
  const [displayRoll, setDisplayRoll] = useState<[number, number]>([1, 1]);

  useEffect(() => {
    if (!lastRoll) return;
    let iterations = 0;
    const maxIterations = 10;
    const interval = setInterval(() => {
      setDisplayRoll([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
      iterations++;
      if (iterations >= maxIterations) {
        clearInterval(interval);
        setDisplayRoll(lastRoll);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [lastRoll]);

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
  const [publicRooms, setPublicRooms] = useState<{id: string, name: string, hostName: string, playerCount: number, maxPlayers: number, isStarted: boolean}[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [localAvatar, setLocalAvatar] = useState<string>('https://api.dicebear.com/7.x/pixel-art/svg?seed=Felix');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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

  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [gameState?.chatMessages]);

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

    const initProfile = () => {
        let localId = localStorage.getItem('tycoon_id');
        if (!localId) {
          localId = Math.random().toString(36).substring(7);
          localStorage.setItem('tycoon_id', localId!);
        }
        setLocalPlayerId(localId!);

        const savedName = localStorage.getItem('tycoon_name');
        setLocalPlayerName(savedName || `Игрок`);

        const savedColor = localStorage.getItem('tycoon_color');
        setLocalColor(savedColor || '#3390EC');

        const savedAvatar = localStorage.getItem('tycoon_avatar');
        setLocalAvatar(savedAvatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${localId}`);

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

    fetchRooms();
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
           
           // Play sound if enabled and it's not our own message
           if (isSoundEnabled && msg.senderId !== localPlayerId) {
             const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
             audio.volume = 0.4;
             audio.play().catch(e => console.log('Audio play failed', e));
           }

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

    const onEngineStateChange = (state: GameState, previousState?: GameState) => {
      setGameState(state);
      
      const wasLocalTurn = previousState?.currentPlayerId === localPlayerId;
      const isLocalTurn = state.currentPlayerId === localPlayerId;
      const isHost = engineRef.current?.getState().players.find(p => p.id === localPlayerId)?.isHost;
      
      // Broadcast if it IS our turn, WAS our turn, or we are the host syncing.
      if (isLocalTurn || wasLocalTurn || isHost) {
        netRef.current?.broadcast('GAME_STATE', state, localPlayerId);
      }
    };

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
      engineRef.current?.surrender(localPlayerId);
      setIsSurrenderModalOpen(false);
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

  const saveSettings = () => {
    localStorage.setItem('tycoon_name', localPlayerName);
    localStorage.setItem('tycoon_color', localColor);
    localStorage.setItem('tycoon_avatar', localAvatar);
    setIsSettingsOpen(false);
    
    if (gameState && !gameState.isStarted) {
        const s = {...gameState};
        const p = s.players.find(pl => pl.id === localPlayerId);
        if (p) {
            p.name = localPlayerName;
            p.color = localColor;
            p.avatarUrl = localAvatar;
            setGameState(s);
            netRef.current?.broadcast('GAME_STATE', s, localPlayerId);
        }
    }
  };

  const { displayRoll } = useFastDiceRoller(gameState?.lastRoll);

  if (isSettingsOpen) {
    return (
      <main className="fixed inset-0 flex flex-col items-center justify-center bg-[#1C1C1D] z-50 p-6 text-white text-center">
        <div className="w-full max-w-sm space-y-8">
          <h2 className="text-xl font-bold">Настройки</h2>
          
          <div className="space-y-4 text-left">
            <div>
              <p className="text-sm text-gray-400 mb-2">Псевдоним</p>
              <input 
                type="text"
                value={localPlayerName}
                onChange={(e) => setLocalPlayerName(e.target.value)}
                className="w-full bg-[#2C2C2E] rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-[#3390EC] transition-all"
                placeholder="Имя"
                maxLength={8}
              />
            </div>

            <div>
              <p className="text-sm text-gray-400 mb-2">Аватар</p>
              <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                {[
                  'Felix', 'Aneka', 'Caleb', 'Cookie', 'Charlie', 'Misty', 'Boots'
                ].map(seed => {
                  const url = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}`;
                  return (
                    <button 
                      key={seed}
                      onClick={() => setLocalAvatar(url)}
                      className={`w-14 h-14 rounded-xl flex-shrink-0 transition-all border-2 ${localAvatar === url ? 'border-[#3390EC] scale-110 bg-[#3390EC]/10' : 'border-transparent bg-[#2C2C2E]'}`}
                    >
                      <img src={url} alt={seed} className="w-full h-full p-1" />
                    </button>
                  );
                })}
              </div>
              <div className="mt-2">
                 <input 
                   type="text"
                   placeholder="Или вставьте URL аватара"
                   value={localAvatar}
                   onChange={(e) => setLocalAvatar(e.target.value)}
                   className="w-full bg-[#2C2C2E] p-3 rounded-xl text-xs text-gray-400 outline-none focus:ring-1 focus:ring-[#3390EC]"
                 />
              </div>
            </div>

            <div className="flex items-center justify-between bg-[#2C2C2E] p-4 rounded-xl border border-white/5 mb-4">
              <span className="text-sm font-bold text-white">Звук уведомлений</span>
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
              <p className="text-sm text-gray-400 mb-2">Цвет</p>
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

          <div className="pt-8 flex flex-col gap-3">
            <button 
              onClick={saveSettings}
              className="w-full bg-[#3390EC] text-white p-4 rounded-xl font-bold hover:brightness-110 active:scale-95 transition-all"
            >
              Сохранить
            </button>
            <button 
              onClick={() => setIsSettingsOpen(false)}
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
              
              <div className="bg-[#2C2C2E] rounded-2xl p-4 flex items-center justify-between" onClick={() => setIsSettingsOpen(true)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg overflow-hidden" style={{ backgroundColor: localColor }}>
                    {localAvatar ? (
                       <img src={localAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                       localPlayerName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="font-bold">{localPlayerName}</span>
                </div>
                <span className="text-[#3390EC] text-sm">Изм.</span>
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

                {recentRooms.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-gray-500 uppercase font-black text-center tracking-widest">Недавние комнаты</p>
                    <div className="flex flex-col gap-2">
                      {recentRooms.map(room => (
                        <button 
                          key={room.id}
                          onClick={() => joinRoom(room.id)}
                          className="w-full bg-[#2C2C2E]/50 border border-white/5 p-3 rounded-xl flex items-center justify-between text-xs font-bold hover:bg-[#2C2C2E] transition-colors"
                        >
                          <span className="text-gray-300">{room.name}</span>
                          <span className="text-[#3390EC] font-mono">{room.id.slice(0, 6)}...</span>
                        </button>
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
            onClick={() => gameState?.isStarted ? setIsSurrenderModalOpen(true) : setIsSettingsOpen(true)} 
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
              <div key={p.id} className={`flex items-center gap-1.5 bg-[#2C2C2E]/50 px-2 py-1 rounded-full border ${p.id === gameState.currentPlayerId ? 'border-[#3390EC]' : 'border-white/5'}`}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[8px] overflow-hidden" style={{ backgroundColor: p.color }}>
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    p.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex flex-col -gap-0.5">
                  <span className={`text-[8px] font-black uppercase tracking-tighter ${p.id === gameState.currentPlayerId ? 'text-[#3390EC]' : 'text-gray-500'}`}>
                    {p.name.split(' ')[0]}
                  </span>
                  <span className="text-[10px] font-black text-white leading-none">${p.balance}</span>
                </div>
              </div>
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
                           <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center border-2 border-[#1C1C1D] shadow-inner" style={{ backgroundColor: p.color }}>
                               {p.avatarUrl ? (
                                 <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                               ) : (
                                 <span className="text-[10px] font-black text-white">{p.name.charAt(0).toUpperCase()}</span>
                               )}
                             </div>
                             <span className="text-xs font-black text-white uppercase tracking-tight">{p.name} {p.id === localPlayerId ? '(ВЫ)' : ''}</span>
                           </div>
                           {p.isHost && <span className="text-[8px] text-[#3390EC] font-black uppercase tracking-widest">Host</span>}
                         </div>
                       ))}
                     </div>

                     <div className="flex flex-col gap-3">
                       <button 
                         onClick={() => setIsRoomSettingsOpen(true)}
                         className="w-full h-14 bg-[#2C2C2E] text-[#3390EC] rounded-2xl font-black text-xs uppercase tracking-[0.2em] border border-[#3390EC]/20 hover:bg-[#3390EC]/10 transition-all active:scale-95"
                       >
                         Настройки
                       </button>
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
                   <>
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
                     <h1 className="text-2xl font-black text-[#3390EC] opacity-30 tracking-widest mb-4">МАГНАТ</h1>
                     <div className="flex flex-col items-center gap-2 w-full overflow-hidden">
                       {gameState.chatMessages.slice(-5).map((msg, i) => (
                         <motion.div 
                           initial={{ opacity: 0, scale: 0.9, y: 10 }} 
                           animate={{ opacity: 1, scale: 1, y: 0 }} 
                           key={msg.id} 
                           className="text-center w-full"
                           style={{ opacity: 1 - (4 - i) * 0.2 }}
                         >
                           <span className="text-[10px] font-bold block" style={{ color: gameState.players.find(p => p.id === msg.senderId)?.color }}>{msg.senderName}</span>
                           <span className="text-[11px] text-gray-300 leading-tight block">{msg.text}</span>
                         </motion.div>
                       ))}
                     </div>
                   </>
                 )}
               </div>
             ) : (
               <h1 className="text-3xl font-black text-[#555] opacity-20 tracking-tighter">МАГНАТ</h1>
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
                              <div className="absolute inset-0 opacity-10 group-hover:opacity-30 transition-opacity pointer-events-none" style={{ backgroundColor: owner.color }} />
                              <motion.div 
                                className="absolute top-1 right-1 w-5 h-5 rounded-full z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 scale-0 group-hover:scale-100 transition-all duration-300 shadow-lg text-[8px] font-black text-white overflow-hidden"
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

                          {/* Purchase Flash Effect */}
                          {gameState?.lastPurchase?.cellId === index && (
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
                                className="w-4 h-4 sm:w-5 sm:h-5 rounded-full ring-2 ring-[#1C1C1D] shadow-[0_0_20px_rgba(0,0,0,0.6)] overflow-hidden flex items-center justify-center z-30"
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

               {gameState.turnStatus === 'MOVING' && isLocalTurn && (
                 <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} key="moving" className="w-full h-full flex items-center justify-center pb-6">
                   <div className="flex flex-col items-center gap-2">
                      <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest animate-pulse">Передвижение...</p>
                   </div>
                 </motion.div>
               )}

               {gameState.turnStatus === 'END_TURN' && isLocalTurn && (!gameState.currentAction || gameState.currentAction.type === 'BUY') && (
                 <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} key="end" className="w-full h-full flex items-center justify-center pb-6">
                    <button 
                      onClick={handleNext}
                      className="w-full max-w-sm h-16 bg-[#2C2C2E] text-[#3390EC] rounded-[20px] font-black text-xl tracking-wide border-2 border-[#3390EC]/30 active:scale-95 transition-transform"
                    >
                      ЗАВЕРШИТЬ ХОД
                    </button>
                 </motion.div>
               )}
            </AnimatePresence>
         )}

          {gameState && !isLocalTurn && (
            <div className="w-full h-full flex flex-col items-center justify-center pb-6 text-center">
              {gameState.players.find(p => p.id === localPlayerId)?.isBankrupt ? (
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xl font-black text-[#FF3B30] tracking-tighter">СЕТЕВОЕ ФИАСКО</span>
                  <span className="text-xs text-gray-500 uppercase font-bold">Вы выбыли из борьбы за рынок</span>
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
                  if (engineRef.current) {
                    const s = engineRef.current.getState();
                    s.turnStatus = 'END_TURN';
                    setGameState({...s});
                    netRef.current?.broadcast('GAME_STATE', s, localPlayerId);
                  }
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
            className="fixed inset-x-0 bottom-0 bg-[#2C2C2E] rounded-t-3xl pt-2 pb-8 px-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-40"
          >
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
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center" style={{ backgroundColor: p.color }}>
                            {p.avatarUrl ? (
                               <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                               <span className="text-[10px] font-bold">{p.name.charAt(0)}</span>
                            )}
                         </div>
                         <span className="font-bold">{p.name} {p.id === localPlayerId ? '(Вы)' : ''}</span>
                      </div>
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
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-[#1C1C1D]/95">
             <motion.div 
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-center"
             >
                <div className="w-24 h-24 bg-yellow-500 rounded-full mx-auto mb-6 flex items-center justify-center text-5xl shadow-[0_0_50px_rgba(234,179,8,0.5)]">
                   🏆
                </div>
                <h2 className="text-4xl font-black mb-2 text-white">ФИНАЛ</h2>
                <p className="text-xl text-[#3390EC] font-bold mb-8">Победитель: {gameState.players.find(p => p.id === gameState.winnerId)?.name}</p>
                <button onClick={() => window.location.reload()} className="px-10 h-14 bg-[#2C2C2E] border border-gray-700 rounded-2xl font-black text-white">ВЕРНУТЬСЯ В ГЛАВНОЕ МЕНЮ</button>
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

              {/* Upgrade Logic */}
              {cellsToDraw[zoomedCell].type === 'ASSET' && cellsToDraw[zoomedCell].ownerId === localPlayerId && (cellsToDraw[zoomedCell].upgradeLevel || 0) < 2 && (
                <div className="mb-8 space-y-4">
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
                      disabled={(() => {
                        const cost = Math.floor((cellsToDraw[zoomedCell].price || 100) * 0.8);
                        const player = gameState?.players.find(p => p.id === localPlayerId);
                        return !player || player.balance < cost;
                      })()}
                      className={`w-full h-14 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg flex flex-col items-center justify-center ${(() => {
                        const cost = Math.floor((cellsToDraw[zoomedCell].price || 100) * 0.8);
                        const player = gameState?.players.find(p => p.id === localPlayerId);
                        return player && player.balance >= cost ? 'bg-[#3390EC] text-white shadow-[#3390EC]/20 active:scale-[0.98]' : 'bg-[#FF3B30] text-white shadow-[#FF3B30]/30';
                      })()}`}
                    >
                      <span>ПРОКАЧАТЬ</span>
                      {(() => {
                        const cost = Math.floor((cellsToDraw[zoomedCell].price || 100) * 0.8);
                        const player = gameState?.players.find(p => p.id === localPlayerId);
                        return (!player || player.balance < cost) && <span className="text-[8px] opacity-70 mt-0.5">Недостаточно средств</span>;
                      })()}
                    </button>
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
