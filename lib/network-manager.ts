import { Peer, DataConnection } from 'peerjs';
import { GameMessage } from '../types/network';
import { GameState } from '../types/game';

export class NetworkManager {
  private peer: Peer | null = null;
  private connections: DataConnection[] = [];
  private onMessage: (msg: GameMessage) => void;
  private onConnectionStatus: (status: string) => void;

  constructor(
    onMessage: (msg: GameMessage) => void,
    onConnectionStatus: (status: string) => void
  ) {
    this.onMessage = onMessage;
    this.onConnectionStatus = onConnectionStatus;
  }

  public init(id?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = id ? new Peer(id) : new Peer();

      this.peer.on('open', (id) => {
        this.onConnectionStatus(`PEER_OPEN:${id}`);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('Peer error:', err);
        let status = `ERROR:${err.type}`;
        if (err.type === 'peer-unavailable') {
          status = 'ERROR:NODE_NOT_FOUND';
        } else if (err.type === 'network') {
          status = 'ERROR:NETWORK_FAILURE';
        } else if (err.type === 'server-error') {
          status = 'ERROR:SERVER_OFFLINE';
        }
        this.onConnectionStatus(status);
        // Do not reject here if peer is already open, only reject init
        if (this.peer?.open === false) reject(err);
      });
    });
  }

  public connect(remoteId: string): void {
    if (!this.peer) return;
    const conn = this.peer.connect(remoteId);
    this.handleConnection(conn);
  }

  private handleConnection(conn: DataConnection): void {
    conn.on('open', () => {
      this.connections.push(conn);
      this.onConnectionStatus(`CONNECTED:${conn.peer}`);
    });

    conn.on('data', (data: any) => {
      this.onMessage(data as GameMessage);
    });

    conn.on('close', () => {
      this.connections = this.connections.filter(c => c.peer !== conn.peer);
      this.onConnectionStatus(`DISCONNECTED:${conn.peer}`);
    });
  }

  public broadcast(type: string, payload: any, senderId: string, excludePeerId?: string): void {
    const msg: GameMessage = { type: type as any, payload, senderId };
    this.connections.forEach(conn => {
      if (conn.open && conn.peer !== excludePeerId) {
        conn.send(msg);
      }
    });
  }

  public disconnect(): void {
    this.peer?.destroy();
    this.connections = [];
  }
}
