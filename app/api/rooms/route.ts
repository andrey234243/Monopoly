import { NextResponse } from 'next/server';

// In-memory store for active rooms. 
// In a production environment, use Redis or Firestore.
interface RoomInfo {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  isStarted: boolean;
  lastPing: number;
}

let activeRooms: RoomInfo[] = [];

// Cleanup stale rooms every 30 seconds
const CLEANUP_INTERVAL = 30000;
const STALE_THRESHOLD = 60000;

function cleanup() {
  const now = Date.now();
  activeRooms = activeRooms.filter(room => now - room.lastPing < STALE_THRESHOLD);
}

export async function GET() {
  cleanup();
  return NextResponse.json(activeRooms);
}

export async function POST(req: Request) {
  const room: Omit<RoomInfo, 'lastPing'> = await req.json();
  
  const now = Date.now();
  const existingIdx = activeRooms.findIndex(r => r.id === room.id);
  
  if (existingIdx >= 0) {
    activeRooms[existingIdx] = { ...room, lastPing: now };
  } else {
    activeRooms.push({ ...room, lastPing: now });
  }
  
  cleanup();
  return NextResponse.json({ success: true });
}
