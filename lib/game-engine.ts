import { GameState, Player, CellType, Cell, ChatMessage } from '../types/game';
import { BOARD_CELLS } from './board-data';

export class GameEngine {
  private state: GameState;
  private onStateChange: (state: GameState, prevState?: GameState) => void;

  constructor(initialPlayers: Player[], onStateChange: (state: GameState, prevState?: GameState) => void) {
    this.state = {
      isStarted: false,
      version: 0,
      players: initialPlayers,
      currentPlayerId: initialPlayers[0]?.id || '',
      lastRoll: null,
      turnStatus: 'WAITING_ROLL',
      cells: BOARD_CELLS.map(c => ({ ...c })),
      chatMessages: [],
      initialBalance: 1500,
      stats: {
        richestOnTurn10: null,
        cellRents: {},
        totalTransactions: 0
      }
    };
    this.onStateChange = onStateChange;
  }

  public startGame(settings: { roomName: string, roomPassword?: string, maxPlayers: number, initialBalance: number }): void {
    if (this.state.isStarted) return;
    const prevState = JSON.parse(JSON.stringify(this.state));
    this.state.isStarted = true;
    this.state.roundNumber = 1;
    this.state.roomName = settings.roomName;
    this.state.roomPassword = settings.roomPassword;
    this.state.maxPlayers = settings.maxPlayers;
    this.state.initialBalance = settings.initialBalance;
    this.setTurnStatus('WAITING_ROLL');
    
    // Apply balance to players
    this.state.players.forEach(p => {
      p.balance = settings.initialBalance;
    });
    
    this.addChatMessage('system', 'Система', `Игра началась! Добро пожаловать в ${settings.roomName}.`);
    this.notifyStateChange(prevState);
  }

  public updateSettings(settings: { roomName: string, roomPassword?: string, maxPlayers: number, initialBalance: number }): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    this.state.roomName = settings.roomName;
    this.state.roomPassword = settings.roomPassword;
    this.state.maxPlayers = settings.maxPlayers;
    this.state.initialBalance = settings.initialBalance;
    
    // If not started, balance changes can be applied now or wait for start
    if (!this.state.isStarted) {
      this.state.players.forEach(p => {
        p.balance = settings.initialBalance;
      });
    }
    
    this.notifyStateChange(prevState);
  }

  public updatePlayerProfile(playerId: string, profile: { name: string, color: string, avatarUrl?: string }): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const player = this.state.players.find(p => p.id === playerId);
    if (player) {
      player.name = profile.name;
      player.color = profile.color;
      player.avatarUrl = profile.avatarUrl;
      this.notifyStateChange(prevState);
    }
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
      this.setTurnStatus('END_TURN');
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
    this.state.version++;
    this.onStateChange({ ...this.state }, prevState);
  }

  private setTurnStatus(status: GameState['turnStatus']) {
    this.state.turnStatus = status;
    if (['WAITING_ROLL', 'ACTION_REQUIRED', 'AUCTION', 'END_TURN'].includes(status)) {
      this.state.turnStartedAt = Date.now();
    } else {
      this.state.turnStartedAt = undefined;
    }
  }

  public handleTimeout(): void {
    if (!this.state.turnStartedAt) return;
    
    const status = this.state.turnStatus;
    
    // Auction timeout
    if (status === 'AUCTION') {
      const auction = this.state.activeAuction;
      if (auction) {
        const currentPlayerId = auction.bidders[auction.turnIndex];
        this.auctionPass(currentPlayerId, true);
      }
      return;
    }

    // Main turn timeout
    const currentPlayer = this.state.players.find(p => p.id === this.state.currentPlayerId);
    if (!currentPlayer) return;

    currentPlayer.missedTurns = (currentPlayer.missedTurns || 0) + 1;

    if (currentPlayer.missedTurns >= 2) {
      this.addChatMessage('system', 'Система', `${currentPlayer.name} исключен из игры за AFK (2 пропуска подряд).`);
      this.surrender(currentPlayer.id);
      return;
    }

    this.addChatMessage('system', 'Система', `${currentPlayer.name} пропускает ход по тайм-ауту.`);
    
    const prevState = JSON.parse(JSON.stringify(this.state));

    if (status === 'WAITING_ROLL') {
      this.state.consecutiveDoubles = 0;
      this.setTurnStatus('END_TURN');
      this.nextTurn(true);
    } else if (status === 'ACTION_REQUIRED') {
      this.skipBuy(true);
    } else if (status === 'END_TURN') {
      if (currentPlayer.balance < 0) {
        this.surrender(currentPlayer.id);
      } else {
        this.nextTurn(true);
      }
    }

    this.notifyStateChange(prevState);
  }

  public rollDice(): void {
    if (this.state.turnStatus !== 'WAITING_ROLL') return;
    if (!this.canPerformAction()) return;

    const prevState = JSON.parse(JSON.stringify(this.state));
    const currentPlayer = this.state.players.find(p => p.id === this.state.currentPlayerId);
    if (currentPlayer) currentPlayer.missedTurns = 0;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    this.state.lastRoll = [d1, d2];
    this.state.currentAction = undefined;
    this.setTurnStatus('ROLLING'); // Stop here and wait for animation to finish
    this.notifyStateChange(prevState);
  }

  public completeRoll(): void {
    if (this.state.turnStatus !== 'ROLLING') return;

    const prevState = JSON.parse(JSON.stringify(this.state));
    const [d1, d2] = this.state.lastRoll || [1, 1];
    
    const playerIndex = this.state.players.findIndex(p => p.id === this.state.currentPlayerId);
    const player = this.state.players[playerIndex];

    this.addChatMessage('system', 'Система', `${player.name} бросил(а) ${d1} и ${d2}.`);

    if (player.inJail) {
      if (d1 === d2) {
        player.inJail = false;
        player.jailTurns = 0;
        this.state.consecutiveDoubles = 0;
        this.addChatMessage('system', 'Система', `${player.name} выбрался из Теневого Бана (дубль!)`);
        this.setTurnStatus('MOVING');
        this.notifyStateChange(prevState);
        this.movePlayer(d1 + d2);
      } else {
        player.jailTurns = (player.jailTurns || 0) + 1;
        if (player.jailTurns >= 3) {
          this.setBalance(player, player.balance - 50);
          player.inJail = false;
          player.jailTurns = 0;
          this.addChatMessage('system', 'Система', `${player.name} заплатил $50 и вышел из бана.`);
          this.setTurnStatus('MOVING');
          this.notifyStateChange(prevState);
          this.movePlayer(d1 + d2);
        } else {
          this.addChatMessage('system', 'Система', `${player.name} остается в Теневом Бане.`);
          this.setTurnStatus('END_TURN');
          this.notifyStateChange(prevState);
        }
      }
    } else {
      if (d1 === d2) {
        this.state.consecutiveDoubles = (this.state.consecutiveDoubles || 0) + 1;
        if (this.state.consecutiveDoubles >= 3) {
          this.state.consecutiveDoubles = 0;
          player.position = 10;
          player.inJail = true;
          player.jailTurns = 0;
          this.setTurnStatus('END_TURN');
          this.state.currentAction = { type: 'SPECIAL', cellId: 30, message: 'Три дубля подряд! Вы отправлены в Теневой Бан.' };
          this.addChatMessage('system', 'Система', `${player.name} отправлен в Теневой Бан за три дубля!`);
          this.notifyStateChange(prevState);
          return;
        }
        this.addChatMessage('system', 'Система', `${player.name} выбросил дубль! (+1 ход)`);
      } else {
        this.state.consecutiveDoubles = 0;
      }
      this.setTurnStatus('MOVING');
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
    }, 160);
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

    this.setTurnStatus('END_TURN');
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
        this.setTurnStatus('ACTION_REQUIRED');
        this.state.currentAction = { type: 'BUY', cellId: cell.id, amount: cell.price };
      } else if (cell.ownerId !== player.id) {
        if (cell.isMortgaged) {
           this.setTurnStatus('END_TURN');
           this.addChatMessage('system', 'Система', `${player.name} попадает на заложенную собственность ${cell.name}. Аренда не взимается.`);
           this.notifyStateChange(prevState);
           return;
        }
        // Must pay rent
        let rentAmount = cell.rent || 0;
        
        // Monopoly Rule: Double rent if owner has all properties of this color
        const colorSet = this.state.cells.filter(c => c.type === CellType.ASSET && c.color === cell.color);
        const ownsAll = colorSet.every(c => c.ownerId === cell.ownerId);
        const hasUpgrades = colorSet.some(c => (c.upgradeLevel || 0) > 0);

        if (ownsAll && !hasUpgrades) {
          rentAmount *= 2;
        }

        if (cell.upgradeLevel === 1) rentAmount *= 3;
        if (cell.upgradeLevel === 2) rentAmount *= 8;

        this.setBalance(player, player.balance - rentAmount);
        
        const ownerIndex = this.state.players.findIndex(p => p.id === cell.ownerId);
        if (ownerIndex !== -1) {
          this.setBalance(this.state.players[ownerIndex], this.state.players[ownerIndex].balance + rentAmount);
          this.addChatMessage('system', 'Система', `${player.name} платит $${rentAmount} аренды ${this.state.players[ownerIndex].name}`);
        }
        
        this.setTurnStatus('END_TURN');
        this.state.currentAction = { type: 'RENT', cellId: cell.id, amount: rentAmount };
        this.state.stats.cellRents[cell.id] = (this.state.stats.cellRents[cell.id] || 0) + rentAmount;
      } else {
        this.setTurnStatus('END_TURN');
      }
    } else if (cell.type === CellType.TAX) {
      const tax = cell.id === 4 ? 200 : 150; // Platform Fee vs Scam
      this.setBalance(player, player.balance - tax);
      this.setTurnStatus('END_TURN');
      this.state.currentAction = { type: 'TAX', cellId: cell.id, amount: tax };
      this.addChatMessage('system', 'Система', `${player.name} платит налог $${tax}`);
    } else if (cell.id === 30) {
      // Go to jail
      player.position = 10;
      player.inJail = true;
      player.jailTurns = 0;
      this.setTurnStatus('END_TURN');
      this.state.currentAction = { type: 'SPECIAL', cellId: cell.id, message: 'Вы отправлены в Теневой Бан!' };
      this.addChatMessage('system', 'Система', `${player.name} отправлен в Теневой Бан!`);
    } else if (cell.type === CellType.CHANCE) {
      this.handleChance(playerIndex);
      return; // handleChance handles its own state change
    } else {
      this.setTurnStatus('END_TURN');
    }

    this.notifyStateChange(prevState);
  }

  public buyAsset(): void {
    if (this.state.turnStatus !== 'ACTION_REQUIRED' || this.state.currentAction?.type !== 'BUY') return;

    const prevState = JSON.parse(JSON.stringify(this.state));
    const playerIndex = this.state.players.findIndex(p => p.id === this.state.currentPlayerId);
    const cellIndex = this.state.currentAction.cellId;
    const player = this.state.players[playerIndex];
    if (player) player.missedTurns = 0;
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
      this.addChatMessage('system', 'Система', `${player.name} покупает ${cell.name} за $${cell.price}`);
      this.setTurnStatus('END_TURN');
      this.state.currentAction = undefined;
      this.notifyStateChange(prevState);
    }
  }

  public skipBuy(isTimeout: boolean = false): void {
    if (this.state.turnStatus !== 'ACTION_REQUIRED' || this.state.currentAction?.type !== 'BUY') return;

    const prevState = JSON.parse(JSON.stringify(this.state));
    if (!isTimeout) {
      const currentPlayer = this.state.players.find(p => p.id === this.state.currentPlayerId);
      if (currentPlayer) currentPlayer.missedTurns = 0;
    }
    
    const cellId = this.state.currentAction.cellId;
    const player = this.state.players.find(p => p.id === this.state.currentPlayerId);
    if (player) {
      this.addChatMessage('system', 'Система', `${player.name} отказывается от покупки ${this.state.cells[cellId].name}.`);
    }

    // Start Auction
    const activePlayers = this.state.players.filter(p => !p.isBankrupt).map(p => p.id);
    this.state.activeAuction = {
      cellId: cellId,
      currentBid: 0,
      highestBidderId: null,
      bidders: activePlayers,
      turnIndex: 0
    };
    this.setTurnStatus('AUCTION');
    this.state.currentAction = undefined;
    this.addChatMessage('system', 'Аукцион', `Аукцион за ${this.state.cells[cellId].name} начинается!`);
    
    this.notifyStateChange(prevState);
  }

  public auctionBid(playerId: string, bidAmount: number): void {
    if (this.state.turnStatus !== 'AUCTION' || !this.state.activeAuction) return;

    const auction = this.state.activeAuction;
    if (auction.bidders[auction.turnIndex] !== playerId) return; // Not their turn
    if (bidAmount <= auction.currentBid) return;

    const prevState = JSON.parse(JSON.stringify(this.state));
    const player = this.state.players.find(p => p.id === playerId);
    
    if (player && player.balance >= bidAmount) {
       player.missedTurns = 0;
       auction.highestBidderId = playerId;
       auction.currentBid = bidAmount;
       this.addChatMessage('system', 'Аукцион', `${player.name} ставит $${bidAmount}`);
       
       if (auction.bidders.length === 1) {
           this.resolveAuction(playerId);
       } else {
           auction.turnIndex = (auction.turnIndex + 1) % auction.bidders.length;
           this.state.turnStartedAt = Date.now(); // Reset timer for next bidder
       }
       this.notifyStateChange(prevState);
    }
  }

  public auctionPass(playerId: string, isTimeout: boolean = false): void {
    if (this.state.turnStatus !== 'AUCTION' || !this.state.activeAuction) return;

    const auction = this.state.activeAuction;
    if (auction.bidders[auction.turnIndex] !== playerId) return;

    const prevState = JSON.parse(JSON.stringify(this.state));
    const player = this.state.players.find(p => p.id === playerId);

    if (player) {
      if (!isTimeout) player.missedTurns = 0;
      this.addChatMessage('system', 'Аукцион', `${player.name} пасует.`);
    }

    auction.bidders.splice(auction.turnIndex, 1);
    
    if (auction.bidders.length === 1 && auction.highestBidderId !== null) {
        // Auction ends, highest bidder wins
        const winnerId = auction.bidders[0]; // If highest bidder is last remaining
        this.resolveAuction(winnerId);
    } else if (auction.bidders.length === 0) {
        // Nobody wanted it
        this.setTurnStatus('END_TURN');
        this.state.activeAuction = undefined;
        this.addChatMessage('system', 'Аукцион', `Никто не купил поле.`);
    } else {
        if (auction.turnIndex >= auction.bidders.length) {
           auction.turnIndex = 0;
        }
        this.state.turnStartedAt = Date.now(); // Reset timer for next bidder
    }
    
    this.notifyStateChange(prevState);
  }

  private resolveAuction(winnerId: string): void {
    if (!this.state.activeAuction) return;
    
    const auction = this.state.activeAuction;
    const winner = this.state.players.find(p => p.id === winnerId);
    const cell = this.state.cells[auction.cellId];

    if (winner && cell && auction.highestBidderId === winnerId) {
       this.setBalance(winner, winner.balance - auction.currentBid);
       cell.ownerId = winner.id;
       cell.color = winner.color;
       cell.upgradeLevel = 0;
       
       this.state.lastPurchase = {
          cellId: auction.cellId,
          timestamp: Date.now()
       };
       this.addChatMessage('system', 'Аукцион', `${winner.name} купил ${cell.name} за $${auction.currentBid}`);
    }

    this.setTurnStatus('END_TURN');
    this.state.activeAuction = undefined;
  }

  public upgradeAsset(cellId: number): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const cell = this.state.cells[cellId];
    const playerIndex = this.state.players.findIndex(p => p.id === cell.ownerId);
    if (playerIndex === -1) return;
    const player = this.state.players[playerIndex];
    player.missedTurns = 0;

    const upgradeLevel = cell.upgradeLevel || 0;
    if (upgradeLevel >= 2) return; // Max reached

    const colorSet = this.state.cells.filter(c => c.type === CellType.ASSET && c.color === cell.color);
    const ownsAll = colorSet.every(c => c.ownerId === player.id);
    const anyMortgaged = colorSet.some(c => c.isMortgaged);
    
    if (!ownsAll || anyMortgaged) {
      this.addChatMessage('system', 'Ошибка', `Вы должны владеть всеми и незаложенными активами цвета ${cell.color}, чтобы прокачивать их.`);
      return;
    }

    const upgradePrice = Math.floor((cell.price || 100) * 0.8);
    if (player.balance >= upgradePrice) {
      this.setBalance(player, player.balance - upgradePrice);
      cell.upgradeLevel = upgradeLevel + 1;
      const upgradeName = cell.upgradeLevel === 1 ? 'Трафик' : 'Премиум-Серверы';
      this.addChatMessage('system', 'Система', `${player.name} прокачал ${cell.name} до уровня ${upgradeName}`);
      this.notifyStateChange(prevState);
    }
  }

  public sellUpgrade(cellId: number): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const cell = this.state.cells[cellId];
    const player = this.state.players.find(p => p.id === cell.ownerId);
    if (!player || (cell.upgradeLevel || 0) <= 0) return;
    player.missedTurns = 0;

    cell.upgradeLevel = (cell.upgradeLevel || 1) - 1;
    const refund = Math.floor((cell.price || 100) * 0.8 * 0.5); // 50% of upgrade cost
    this.setBalance(player, player.balance + refund);
    this.addChatMessage('system', 'Система', `${player.name} продал улучшение ${cell.name} за $${refund}`);
    this.notifyStateChange(prevState);
  }

  public mortgageAsset(cellId: number): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const cell = this.state.cells[cellId];
    const player = this.state.players.find(p => p.id === cell.ownerId);
    if (!player || cell.isMortgaged) return;
    player.missedTurns = 0;

    // Cannot mortgage if there are upgrades on this color group
    const colorSet = this.state.cells.filter(c => c.type === CellType.ASSET && c.color === cell.color);
    const hasUpgrades = colorSet.some(c => (c.upgradeLevel || 0) > 0);
    if (hasUpgrades) {
        this.addChatMessage('system', 'Ошибка', `Сначала нужно продать улучшения со всех активов этого цвета.`);
        return;
    }

    cell.isMortgaged = true;
    cell.mortgageTurnsLeft = 15;
    const mortgageValue = Math.floor((cell.price || 0) * 0.5);
    this.setBalance(player, player.balance + mortgageValue);
    this.addChatMessage('system', 'Система', `${player.name} заложил ${cell.name} за $${mortgageValue} на 15 ходов.`);
    this.notifyStateChange(prevState);
  }

  public unmortgageAsset(cellId: number): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const cell = this.state.cells[cellId];
    const player = this.state.players.find(p => p.id === cell.ownerId);
    if (!player || !cell.isMortgaged) return;
    player.missedTurns = 0;

    const unmortgageCost = Math.floor((cell.price || 0) * 0.6); // 50% + 10% fee
    if (player.balance >= unmortgageCost) {
       this.setBalance(player, player.balance - unmortgageCost);
       cell.isMortgaged = false;
       cell.mortgageTurnsLeft = undefined;
       this.addChatMessage('system', 'Система', `${player.name} выкупил ${cell.name} за $${unmortgageCost}`);
       this.notifyStateChange(prevState);
    }
  }

  public declareBankrupt(): void {
    const prevState = JSON.parse(JSON.stringify(this.state));
    const playerIndex = this.state.players.findIndex(p => p.id === this.state.currentPlayerId);
    if (playerIndex === -1) return;
    const player = this.state.players[playerIndex];

    player.isBankrupt = true;
    player.balance = 0;

    // Return properties to bank (or to creditor if we supported that. But we'll just return to bank)
    this.state.cells.forEach(c => {
        if (c.ownerId === player.id) {
            c.ownerId = null;
            c.upgradeLevel = 0;
            c.isMortgaged = false;
        }
    });

    this.addChatMessage('system', 'БЕЗЫСХОДНОСТЬ', `${player.name} объявляет себя банкротом!`);
    
    // Check if game over
    this.checkGameOver();
    if ((this.state.turnStatus as string) !== 'GAME_OVER') {
        this.setTurnStatus('END_TURN');
    }
    
    this.notifyStateChange(prevState);
  }

  public proposeAdvancedTrade(
    toPlayerId: string,
    offerMoney: number,
    requestMoney: number,
    offerCellIds: number[],
    requestCellIds: number[]
  ): void {
     const prevState = JSON.parse(JSON.stringify(this.state));
     const currentPlayer = this.state.players.find(p => p.id === this.state.currentPlayerId);
     if (currentPlayer) currentPlayer.missedTurns = 0;
     
     this.state.pendingTrade = {
        id: Math.random().toString(36).substring(7),
        fromId: this.state.currentPlayerId,
        toId: toPlayerId,
        offerMoney,
        requestMoney,
        offerCellIds,
        requestCellIds
     };

     const targetPlayer = this.state.players.find(p => p.id === toPlayerId);
     if (currentPlayer && targetPlayer) {
        this.addChatMessage('system', 'Сделка', `${currentPlayer.name} предлагает сделку игроку ${targetPlayer.name}.`);
     }

     this.notifyStateChange(prevState);
  }

  public acceptTrade(): void {
     if (!this.state.pendingTrade) return;
     const trade = this.state.pendingTrade;
     const prevState = JSON.parse(JSON.stringify(this.state));

     const fromPlayer = this.state.players.find(p => p.id === trade.fromId);
     const toPlayer = this.state.players.find(p => p.id === trade.toId);

     if (toPlayer) toPlayer.missedTurns = 0;

     if (fromPlayer && toPlayer) {
        if (toPlayer.balance >= trade.requestMoney && fromPlayer.balance >= trade.offerMoney) {
           this.setBalance(toPlayer, toPlayer.balance - trade.requestMoney + trade.offerMoney);
           this.setBalance(fromPlayer, fromPlayer.balance - trade.offerMoney + trade.requestMoney);

           for (const cellId of trade.offerCellIds) {
               const cell = this.state.cells[cellId];
               if (cell.ownerId === fromPlayer.id) {
                   cell.ownerId = toPlayer.id;
                   cell.color = toPlayer.color;
               }
           }

           for (const cellId of trade.requestCellIds) {
               const cell = this.state.cells[cellId];
               if (cell.ownerId === toPlayer.id) {
                   cell.ownerId = fromPlayer.id;
                   cell.color = fromPlayer.color;
               }
           }

           this.addChatMessage('system', 'Сделка', `${toPlayer.name} и ${fromPlayer.name} совершили обмен активами.`);
        }
     }

     this.state.pendingTrade = undefined;
     this.notifyStateChange(prevState);
  }

  public rejectTrade(): void {
     if (!this.state.pendingTrade) return;
     const prevState = JSON.parse(JSON.stringify(this.state));
     const toPlayer = this.state.players.find(p => p.id === this.state.pendingTrade!.toId);
     if (toPlayer) {
         toPlayer.missedTurns = 0;
         this.addChatMessage('system', 'Сделка', `${toPlayer.name} отклонил предложение об обмене.`);
     }
     this.state.pendingTrade = undefined;
     this.notifyStateChange(prevState);
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

  public addChatMessage(type: 'system' | 'player', senderName: string, text: string, senderId?: string, msgId?: string): void {
    if (msgId && this.state.chatMessages.find(m => m.id === msgId)) return;
    
    const prevState = JSON.parse(JSON.stringify(this.state));

    if (senderId && senderId !== 'system') {
       const player = this.state.players.find(p => p.id === senderId);
       if (player) player.missedTurns = 0;
    }

    const newMessage: ChatMessage = {
      id: msgId || Math.random().toString(36).substring(7),
      type,
      senderId: senderId || 'system',
      senderName,
      text,
      timestamp: Date.now()
    };
    this.state.chatMessages = [...this.state.chatMessages.slice(-100), newMessage]; 
    this.notifyStateChange(prevState);
  }

  private setBalance(player: Player, amount: number) {
    const diff = amount - player.balance;
    if (diff === 0) return;
    
    this.state.stats.totalTransactions += Math.abs(diff);

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

  public nextTurn(isTimeout: boolean = false): void {
    if (this.state.turnStatus !== 'END_TURN') return;
    
    const currentPlayer = this.state.players.find(p => p.id === this.state.currentPlayerId);
    if (!isTimeout && currentPlayer) currentPlayer.missedTurns = 0;

    if (currentPlayer && currentPlayer.balance < 0 && !currentPlayer.isBankrupt) {
       this.addChatMessage('system', 'Должник', `${currentPlayer.name}, ваш баланс отрицательный. Оплатите долги или объявите банкротство.`);
       // Need to re-trigger state change to show notification
       const prevState = JSON.parse(JSON.stringify(this.state));
       this.notifyStateChange(prevState);
       return;
    }

    this.checkGameOver();
    if ((this.state.turnStatus as string) === 'GAME_OVER') return;

    // Process mortgages for the current player
    if (currentPlayer) {
        this.state.cells.forEach(cell => {
            if (cell.ownerId === currentPlayer.id && cell.isMortgaged && cell.mortgageTurnsLeft !== undefined) {
                cell.mortgageTurnsLeft--;
                if (cell.mortgageTurnsLeft <= 0) {
                    cell.ownerId = null;
                    cell.isMortgaged = false;
                    cell.mortgageTurnsLeft = undefined;
                    this.addChatMessage('system', 'Система', `Срок залога истек! ${currentPlayer.name} теряет ${cell.name}.`);
                }
            }
        });
    }

    const prevState = JSON.parse(JSON.stringify(this.state));

    // Monopoly Rule: If double was rolled, player keeps their turn
    const d1 = this.state.lastRoll?.[0];
    const d2 = this.state.lastRoll?.[1];
    const isDouble = d1 !== undefined && d2 !== undefined && d1 === d2;
    const player = this.state.players.find(p => p.id === this.state.currentPlayerId);

    if (isDouble && player && !player.inJail && !player.isBankrupt) {
      this.setTurnStatus('WAITING_ROLL');
      // keep currentPlayerId
    } else {
      this.state.consecutiveDoubles = 0;
      const currentIndex = this.state.players.findIndex(p => p.id === this.state.currentPlayerId);
      
      // Find next non-bankrupt player
      let nextIndex = (currentIndex + 1) % this.state.players.length;
      for (let i = 0; i < this.state.players.length; i++) {
          if (!this.state.players[nextIndex].isBankrupt) break;
          nextIndex = (nextIndex + 1) % this.state.players.length;
      }
      
      this.state.currentPlayerId = this.state.players[nextIndex].id;
      this.setTurnStatus('WAITING_ROLL');
      
      if (nextIndex <= currentIndex) {
          this.state.roundNumber = (this.state.roundNumber || 1) + 1;
          
          if (this.state.roundNumber === 10 && !this.state.stats.richestOnTurn10) {
              const sortedPlayers = [...this.state.players].filter(p => !p.isBankrupt).sort((a, b) => {
                 const wealthA = a.balance + this.state.cells.filter(c => c.ownerId === a.id).reduce((sum, c) => sum + (c.price || 0), 0);
                 const wealthB = b.balance + this.state.cells.filter(c => c.ownerId === b.id).reduce((sum, c) => sum + (c.price || 0), 0);
                 return wealthB - wealthA;
              });
              if (sortedPlayers.length > 0) {
                  this.state.stats.richestOnTurn10 = sortedPlayers[0].name;
                  this.addChatMessage('system', 'Аналитика', `Финал 10-го хода! Самый богатый игрок: ${sortedPlayers[0].name}`);
              }
          }
      }
    }
    
    this.state.lastRoll = null;
    this.state.currentAction = undefined;
    this.notifyStateChange(prevState);
  }
}
