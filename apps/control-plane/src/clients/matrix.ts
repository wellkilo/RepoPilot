interface MatrixConfig {
  baseUrl: string;
  domain: string;
  adminUser: string;
  adminPassword: string;
  managerUser: string;
}

interface MatrixLoginResponse {
  access_token: string;
  user_id: string;
}

interface JoinedRoomsResponse {
  joined_rooms: string[];
}

interface RoomMembersResponse {
  chunk: Array<{ state_key: string }>;
}

interface CreateRoomResponse {
  room_id: string;
}

interface SendMessageResponse {
  event_id: string;
}

export class MatrixClient {
  constructor(private readonly config: MatrixConfig) {}

  async dispatchTask(message: string): Promise<{ roomId: string; eventId: string }> {
    const { access_token: accessToken, user_id: adminUserId } = await this.login();
    const roomId =
      (await this.findManagerDirectRoom(accessToken, adminUserId)) ??
      (await this.createManagerDirectRoom(accessToken));
    const eventId = await this.sendMessage(accessToken, roomId, message);
    return { roomId, eventId };
  }

  private async login(): Promise<MatrixLoginResponse> {
    return this.request<MatrixLoginResponse>("/_matrix/client/v3/login", {
      method: "POST",
      body: JSON.stringify({
        type: "m.login.password",
        identifier: {
          type: "m.id.user",
          user: this.config.adminUser
        },
        password: this.config.adminPassword
      })
    });
  }

  private async findManagerDirectRoom(
    accessToken: string,
    adminUserId: string
  ): Promise<string | null> {
    const joined = await this.request<JoinedRoomsResponse>("/_matrix/client/v3/joined_rooms", {
      headers: this.authorization(accessToken)
    });
    for (const roomId of joined.joined_rooms) {
      const members = await this.request<RoomMembersResponse>(
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/members`,
        { headers: this.authorization(accessToken) }
      );
      const activeMembers = members.chunk.map((member) => member.state_key);
      if (
        activeMembers.length === 2 &&
        activeMembers.includes(adminUserId) &&
        activeMembers.some((member) => this.localpart(member) === this.config.managerUser)
      ) {
        return roomId;
      }
    }
    return null;
  }

  private async createManagerDirectRoom(accessToken: string): Promise<string> {
    const managerId = `@${this.config.managerUser}:${this.config.domain}`;
    const response = await this.request<CreateRoomResponse>("/_matrix/client/v3/createRoom", {
      method: "POST",
      headers: this.authorization(accessToken),
      body: JSON.stringify({
        is_direct: true,
        invite: [managerId],
        preset: "trusted_private_chat"
      })
    });
    return response.room_id;
  }

  private async sendMessage(accessToken: string, roomId: string, message: string): Promise<string> {
    const transactionId = `repopilot_${Date.now()}_${crypto.randomUUID()}`;
    const response = await this.request<SendMessageResponse>(
      `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${transactionId}`,
      {
        method: "PUT",
        headers: this.authorization(accessToken),
        body: JSON.stringify({ msgtype: "m.text", body: message })
      }
    );
    return response.event_id;
  }

  private authorization(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}` };
  }

  private localpart(userId: string): string {
    return userId.startsWith("@") ? (userId.slice(1).split(":")[0] ?? "") : "";
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers
      }
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Matrix API ${response.status}: ${body || response.statusText}`);
    }
    return (await response.json()) as T;
  }
}
