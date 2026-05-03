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
  isMortgaged?: boolean;
  mortgageTurnsLeft?: number;
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
  isBot?: boolean;
  botStrategy?: 'AGGRESSIVE' | 'ECONOMICAL';
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
  version: number;
  roundNumber?: number;
  roomName?: string;
  roomPassword?: string;
  maxPlayers?: number;
  initialBalance?: number;
  players: Player[];
  currentPlayerId: string;
  lastRoll: [number, number] | null;
  turnStatus: 'WAITING_ROLL' | 'ROLLING' | 'MOVING' | 'ACTION_REQUIRED' | 'AUCTION' | 'END_TURN' | 'GAME_OVER';
  turnStartedAt?: number;
  cells: Cell[];
  activeAuction?: {
    cellId: number;
    currentBid: number;
    highestBidderId: string | null;
    bidders: string[];
    turnIndex: number;
  };
  currentAction?: {
    type: 'BUY' | 'RENT' | 'SPECIAL' | 'CHANCE' | 'TAX';
    cellId: number;
    amount?: number;
    message?: string;
  };
  winnerId?: string;
  consecutiveDoubles?: number;
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
  tradeOffer?: {
    fromPlayerId: string;
    toPlayerId: string;
    offerMoney: number;
    offerCells: number[];
    requestMoney: number;
    requestCells: number[];
  };
  pendingTrade?: {
    id?: string;
    fromId: string;
    toId: string;
    offerMoney: number;
    requestMoney: number;
    offerCellIds: number[];
    requestCellIds: number[];
  };
  stats: {
    richestOnTurn10: string | null;
    cellRents: Record<number, number>; // cellId -> total rent paid
    totalTransactions: number;
  };
}
