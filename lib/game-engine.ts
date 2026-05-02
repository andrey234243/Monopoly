import { GameState, Player, CellType, Cell, ChatMessage } from '../types/game';
import { BOARD_CELLS } from './board-data';

export class GameEngine {
  private state: GameState;
  private onStateChange: (state: GameState, prevState?: GameState) => void;

  constructor(initialPlayers: Player[], onStateChange: (state: GameState, prevState?: GameState) => void) {
    this.state = {
      isStarted: false,
      players: initialPlayers,
      currentPlayerId: initialPlayers[0]?.id || '',
      lastRoll: null,
      turnStatus: 'WAITING_ROLL',
      cells: BOARD_CELLS.map(c => ({ ...c })),
      chatMessages: [],
      initialBalance: 1500
    };
    this.onStateChange = onStateChange;
  }

  public startGame(settings: { roomName: string, roomPassword?: string, maxPlayers: number, initialBalance: number }): void {
    if (this.state.isStarted) return;
    const prevState = JSON.parse(JSON.stringify(this.state));
    this.state.isStarted = true;
    this.state.roomName = settings.roomName;
    this.state.roomPassword = settings.roomPassword;
    this.state.maxPlayers = settings.maxPlayers;
    this.state.initialBalance = settings.initialBalance;
    
    // Apply balance to players
    this.state.players.forEach(p => {
      p.balance = settings.initialBalance;
    });
    
    this.addChatMessage('system', 'Система', `Игра началась! Добро пожаловать в ${settings.roomName}.`);
    this.notifyStateChange(prevState);
  }

  private canPerformAction(): boolean {
    if (!this.state.isStarted) return false;
    // Game starts when enough players connected
    return this.state.players.length >= (this.state.maxPlayers || 2);
  }

  public surrender(playerId: string): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    
    const player = this.state.players[playerIndex];
    if (player.isBankrupt) return;

    player.isBankrupt = true;
    player.balance = 0;
    
    // Release assets
    this.state.cells.forEach(cell => {
      if (cell.ownerId === playerId) {
        cell.ownerId = null;
        cell.color = undefined;
        cell.upgradeLevel = 0;
      }
    });

    this.addChatMessage('system', 'Система', `${player.name} сдался.`);

    // If it was their turn, move to next
    if (this.state.currentPlayerId === playerId) {
      if (this.state.turnStatus === 'MOVING') {
         // This is tricky if surrender happens during move animation. 
         // But let's assume it's safe.
      }
      this.state.turnStatus = 'END_TURN';
      this.notifyStateChange(prevState);
      this.nextTurn();
    } else {
      this.checkGameOver();
      this.notifyStateChange(prevState);
    }
  }

  private checkGameOver() {
    const activePlayers = this.state.players.filter(p => !p.isBankrupt);
    if (activePlayers.length <= 1 && this.state.isStarted) {
      this.state.turnStatus = 'GAME_OVER';
      this.state.winnerId = activePlayers[0]?.id;
      if (this.state.winnerId) {
        this.addChatMessage('system', 'Победа', `Игра окончена! Победитель: ${activePlayers[0].name}`);
      }
    }
  }

  public getState(): GameState {
    return this.state;
  }

  private notifyStateChange(prevState: GameState) {
    this.onStateChange({ ...this.state }, prevState);
  }

  public rollDice(): void {
    if (this.state.turnStatus !== 'WAITING_ROLL') return;
    if (!this.canPerformAction()) return;

    const prevState = JSON.parse(JSON.stringify(this.state));

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    this.state.lastRoll = [d1, d2];
    this.state.currentAction = undefined;

    const playerIndex = this.state.players.findIndex(p => p.id === this.state.currentPlayerId);
    const player = this.state.players[playerIndex];

    if (player.inJail) {
      if (d1 === d2) {
        player.inJail = false;
        player.jailTurns = 0;
        this.addChatMessage('system', 'Система', `${player.name} выбрался из Теневого Бана (дубль!)`);
        this.state.turnStatus = 'MOVING';
        this.notifyStateChange(prevState);
        this.movePlayer(d1 + d2);
      } else {
        player.jailTurns = (player.jailTurns || 0) + 1;
        if (player.jailTurns >= 3) {
          this.setBalance(player, player.balance - 50);
          player.inJail = false;
          player.jailTurns = 0;
          this.addChatMessage('system', 'Система', `${player.name} заплатил $50 и вышел из бана.`);
          this.state.turnStatus = 'MOVING';
          this.notifyStateChange(prevState);
          this.movePlayer(d1 + d2);
        } else {
          this.addChatMessage('system', 'Система', `${player.name} остается в Теневом Бане.`);
          this.state.turnStatus = 'END_TURN';
          this.notifyStateChange(prevState);
        }
      }
    } else {
      this.state.turnStatus = 'MOVING';
      this.notifyStateChange(prevState);
      this.movePlayer(d1 + d2);
    }
  }

  private movePlayer(steps: number): void {
    let currentSteps = 0;
    const playerIndex = this.state.players.findIndex(p => p.id === this.state.currentPlayerId);
    
    if (playerIndex === -1) return;

    const moveInterval = setInterval(() => {
      const prevState = JSON.parse(JSON.stringify(this.state));
      const player = this.state.players[playerIndex];
      const oldPos = player.position;
      player.position = (player.position + 1) % this.state.cells.length;
      
      if (player.position === 0 && oldPos !== 0) {
        this.setBalance(player, player.balance + 200); 
        this.addChatMessage('system', 'Система', `${player.name} прошел СТАРТ и получил $200`);
      }

      currentSteps++;
      this.notifyStateChange(prevState);

      if (currentSteps >= steps) {
        clearInterval(moveInterval);
        this.handleLanding(playerIndex);
      }
    }, 200);
  }

  private handleChance(playerIndex: number): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const player = this.state.players[playerIndex];
    const cell = this.state.cells[player.position];
    const isHack = cell.name.includes('ВЗЛОМ');

    const hackEffects = [
      { 
        text: 'База данных слита! Каждый игрок выплачивает вам по $30 компенсации.', 
        effect: () => { 
          this.state.players.forEach(p => {
            if (p.id !== player.id) {
              this.setBalance(p, p.id === player.id ? p.balance : p.balance - 30);
              this.setBalance(player, player.balance + 30);
            }
          });
        } 
      },
      { text: 'Файервол пробит! Вы теряете $100 на восстановление системы.', effect: () => { this.setBalance(player, player.balance - 100); } },
      { 
        text: 'Подмена личности! Вы меняетесь местаestами с случайным игроком.', 
        effect: () => { 
          const others = this.state.players.filter(p => p.id !== player.id);
          if (others.length > 0) {
            const target = others[Math.floor(Math.random() * others.length)];
            const oldPos = player.position;
            player.position = target.position;
            target.position = oldPos;
          }
        } 
      },
      { text: 'Майнинг-вирус! Вы получаете $10 за каждый пройденный ход (+$80 сейчас).', effect: () => { this.setBalance(player, player.balance + 80); } }
    ];

    const insideEffects = [
      { text: 'Инсайд из TON Foundation: ваши активы растут! Вы получаете $200.', effect: () => { this.setBalance(player, player.balance + 200); } },
      { 
        text: 'Инсайд о листинге: бесплатная модернизация одного из ваших активов!', 
        effect: () => { 
          const myAssets = this.state.cells.filter(c => c.ownerId === player.id && (c.upgradeLevel || 0) < 2);
          if (myAssets.length > 0) {
            const asset = myAssets[Math.floor(Math.random() * myAssets.length)];
            asset.upgradeLevel = (asset.upgradeLevel || 0) + 1;
          } else {
            this.setBalance(player, player.balance + 100); // Fallback
          }
        } 
      },
      { text: 'Замечены киты! Скоро памп. Бонус $150.', effect: () => { this.setBalance(player, player.balance + 150); } },
      { text: 'Rug Pull отменен! Вы вовремя вышли в стейблкоины. Прибыль $100.', effect: () => { this.setBalance(player, player.balance + 100); } }
    ];

    const pool = isHack ? hackEffects : insideEffects;
    const chance = pool[Math.floor(Math.random() * pool.length)];
    chance.effect();

    this.state.turnStatus = 'END_TURN';
    this.state.currentAction = { 
      type: 'CHANCE', 
      cellId: player.position, 
      message: chance.text 
    };
    this.addChatMessage('system', isHack ? 'Взлом' : 'Инсайд', `${player.name}: ${chance.text}`);
    this.notifyStateChange(prevState);
  }

  private handleLanding(playerIndex: number): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const player = this.state.players[playerIndex];
    const cell = this.state.cells[player.position];

    if (cell.type === CellType.ASSET) {
      if (!cell.ownerId) {
        // Option to buy
        this.state.turnStatus = 'ACTION_REQUIRED';
        this.state.currentAction = { type: 'BUY', cellId: cell.id, amount: cell.price };
      } else if (cell.ownerId !== player.id) {
        // Must pay rent
        let rentAmount = cell.rent || 0;
        if (cell.upgradeLevel === 1) rentAmount *= 3;
        if (cell.upgradeLevel === 2) rentAmount *= 8;

        this.setBalance(player, player.balance - rentAmount);
        
        const ownerIndex = this.state.players.findIndex(p => p.id === cell.ownerId);
        if (ownerIndex !== -1) {
          this.setBalance(this.state.players[ownerIndex], this.state.players[ownerIndex].balance + rentAmount);
          this.addChatMessage('system', 'Система', `${player.name} платит $${rentAmount} аренды ${this.state.players[ownerIndex].name}`);
        }
        
        this.state.turnStatus = 'END_TURN';
        this.state.currentAction = { type: 'RENT', cellId: cell.id, amount: rentAmount };
      } else {
        this.state.turnStatus = 'END_TURN';
      }
    } else if (cell.type === CellType.TAX) {
      const tax = cell.id === 4 ? 200 : 150; // Platform Fee vs Scam
      this.setBalance(player, player.balance - tax);
      this.state.turnStatus = 'END_TURN';
      this.state.currentAction = { type: 'TAX', cellId: cell.id, amount: tax };
      this.addChatMessage('system', 'Система', `${player.name} платит налог $${tax}`);
    } else if (cell.id === 30) {
      // Go to jail
      player.position = 10;
      player.inJail = true;
      player.jailTurns = 0;
      this.state.turnStatus = 'END_TURN';
      this.state.currentAction = { type: 'SPECIAL', cellId: cell.id, message: 'Вы отправлены в Теневой Бан!' };
      this.addChatMessage('system', 'Система', `${player.name} отправлен в Теневой Бан!`);
    } else if (cell.type === CellType.CHANCE) {
      this.handleChance(playerIndex);
      return; // handleChance handles its own state change
    } else {
      this.state.turnStatus = 'END_TURN';
    }

    this.notifyStateChange(prevState);
  }

  public buyAsset(): void {
    if (this.state.turnStatus !== 'ACTION_REQUIRED' || this.state.currentAction?.type !== 'BUY') return;

    const prevState = JSON.parse(JSON.stringify(this.state));
    const playerIndex = this.state.players.findIndex(p => p.id === this.state.currentPlayerId);
    const cellIndex = this.state.currentAction.cellId;
    const player = this.state.players[playerIndex];
    const cell = this.state.cells[cellIndex];

    if (cell.price && player.balance >= cell.price) {
      this.setBalance(player, player.balance - cell.price);
      cell.ownerId = player.id;
      cell.color = player.color; // Visual hint
      cell.upgradeLevel = 0; // Initialize
      this.state.lastPurchase = {
        cellId: cellIndex,
        timestamp: Date.now()
      };
      this.state.turnStatus = 'END_TURN';
      this.state.currentAction = undefined;
      this.notifyStateChange(prevState);
    }
  }

  public upgradeAsset(cellId: number): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const cell = this.state.cells[cellId];
    const playerIndex = this.state.players.findIndex(p => p.id === cell.ownerId);
    if (playerIndex === -1) return;
    const player = this.state.players[playerIndex];

    // Only current player can upgrade their own asset during their turn? 
    // Usually Monopoly allows building any time you own a set.
    // Let's allow it as long as the player owns it.
    
    const upgradeLevel = cell.upgradeLevel || 0;
    if (upgradeLevel >= 2) return; // Max reached

    const upgradePrice = Math.floor((cell.price || 100) * 0.8);
    if (player.balance >= upgradePrice) {
      this.setBalance(player, player.balance - upgradePrice);
      cell.upgradeLevel = upgradeLevel + 1;
      const upgradeName = cell.upgradeLevel === 1 ? 'Трафик' : 'Премиум-Серверы';
      this.addChatMessage('system', 'Система', `${player.name} прокачал ${cell.name} до уровня ${upgradeName}`);
      this.notifyStateChange(prevState);
    }
  }

  public updateState(newState: GameState): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    this.state = newState;
    this.notifyStateChange(prevState);
  }

  public setStateSilently(newState: GameState): void {
    this.state = newState;
  }

  public addPlayer(player: Player): void {
    if (this.state.players.find(p => p.id === player.id)) return;
    if (this.state.players.length >= (this.state.maxPlayers || 4)) return;
    
    const prevState = JSON.parse(JSON.stringify(this.state));
    
    if (this.state.isStarted) {
      player.balance = this.state.initialBalance || 1500;
    }
    
    this.state.players.push(player);
    this.notifyStateChange(prevState);
  }

  public addChatMessage(type: 'system' | 'player', senderName: string, text: string, senderId?: string): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const newMessage: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      type,
      senderId: senderId || 'system',
      senderName,
      text,
      timestamp: Date.now()
    };
    this.state.chatMessages = [...this.state.chatMessages.slice(-20), newMessage]; // Keep last 21 messages
    this.notifyStateChange(prevState);
  }

  private setBalance(player: Player, amount: number) {
    const diff = amount - player.balance;
    if (diff === 0) return;
    
    player.balance = amount;
    this.state.lastBalanceChange = {
      playerId: player.id,
      amount: diff,
      timestamp: Date.now()
    };

    if (player.balance < 0 && !player.isBankrupt) {
      this.surrender(player.id);
    }
  }

  public nextTurn(): void {
    if (this.state.turnStatus !== 'END_TURN') return;
    this.checkGameOver();
    if ((this.state.turnStatus as string) === 'GAME_OVER') return;

    const prevState = JSON.parse(JSON.stringify(this.state));
    const currentIndex = this.state.players.findIndex(p => p.id === this.state.currentPlayerId);
    
    // Find next non-bankrupt player
    let nextIndex = (currentIndex + 1) % this.state.players.length;
    for (let i = 0; i < this.state.players.length; i++) {
        if (!this.state.players[nextIndex].isBankrupt) break;
        nextIndex = (nextIndex + 1) % this.state.players.length;
    }
    
    this.state.currentPlayerId = this.state.players[nextIndex].id;
    this.state.turnStatus = 'WAITING_ROLL';
    this.state.lastRoll = null;
    this.state.currentAction = undefined;
    this.notifyStateChange(prevState);
  }
}
