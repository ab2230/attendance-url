const CLIENT_KEY = "attendance_room_client_key";

export function getOrCreateClientKey(): string {
  if (typeof window === "undefined") return "";
  let key = localStorage.getItem(CLIENT_KEY);
  if (!key) {
    key =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_KEY, key);
  }
  return key;
}

export type RoomCompletion = {
  roomId: string;
  memberId: string;
  memberName: string;
  markedAt: string;
  expiresAt: string;
};

function completionKey(roomId: string) {
  return `attendance_room_done_${roomId}`;
}

export function getRoomCompletion(roomId: string): RoomCompletion | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(completionKey(roomId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RoomCompletion;
    if (parsed.roomId !== roomId) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(completionKey(roomId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveRoomCompletion(data: RoomCompletion) {
  if (typeof window === "undefined") return;
  localStorage.setItem(completionKey(data.roomId), JSON.stringify(data));
}
