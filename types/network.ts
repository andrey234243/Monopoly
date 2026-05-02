import { GameState } from './game';

export type MessageType = 'GAME_STATE' | 'ACTION' | 'JOIN' | 'CHAT' | 'AUTH_ERROR';

export interface GameMessage {
  type: MessageType;
  payload: any;
  senderId: string;
}
