export enum CellType {
  ASSET = 'ASSET',
  SPECIAL = 'SPECIAL', // Airdrop, Ban, etc.
  CHANCE = 'CHANCE',  // Inside
  TREASURE = 'TREASURE', // Hack
  TAX = 'TAX' // Platform Fee, Scam
}

export interface Cell {
  id: number;
  name: string;
  price?: number;
  rent?: number;
  type: CellType;
  color?: string;
  ownerId?: string | null;
  description?: string;
  upgradeLevel?: number; // 0: None, 1: Traffic, 2: Premium Servers
}

export interface Player {
  id: string;
  name: string;
  position: number;
  balance: number;
  color: string;
  avatarUrl?: string;
  isHost: boolean;
  inJail?: boolean;
  jailTurns?: number;
  isBankrupt?: boolean;
}

export interface ChatMessage {
  id: string;
  type: 'system' | 'player';
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface GameState {
  isStarted: boolean;
  roomName?: string;
  roomPassword?: string; // Optional password
  maxPlayers?: number;
  initialBalance?: number;
  players: Player[];
  currentPlayerId: string;
  lastRoll: [number, number] | null;
  turnStatus: 'WAITING_ROLL' | 'MOVING' | 'ACTION_REQUIRED' | 'END_TURN' | 'GAME_OVER';
  cells: Cell[];
  currentAction?: {
    type: 'BUY' | 'RENT' | 'SPECIAL' | 'CHANCE' | 'TAX';
    cellId: number;
    amount?: number;
    message?: string;
  };
  winnerId?: string;
  chatMessages: ChatMessage[];
  lastPurchase?: {
    cellId: number;
    timestamp: number;
  };
  lastBalanceChange?: {
    playerId: string;
    amount: number;
    timestamp: number;
  };
}
