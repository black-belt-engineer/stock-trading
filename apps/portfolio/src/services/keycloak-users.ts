/**
 * Asks Keycloak whether users still exist, as the confidential client `stock-portfolio` whose
 * service account has only `realm-management/view-users` (K6, nightly cleanup).
 */
export type KeycloakUsersOptions = {
  /** The realm on Keycloak's internal address, e.g. `http://localhost:8180/realms/stock-platform`. */
  realmUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
};

/** Keycloak could not answer (down, refused the client, 5xx). Never read as "the user is gone". */
export class KeycloakUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeycloakUnavailableError";
  }
}

export class KeycloakUsers {
  private readonly tokenUrl: string;
  private readonly usersUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: KeycloakUsersOptions) {
    const realm = new URL(options.realmUrl);
    const name = realm.pathname.split("/").filter((part) => part !== "").pop() ?? "";
    this.tokenUrl = `${realm.origin}/realms/${name}/protocol/openid-connect/token`;
    this.usersUrl = `${realm.origin}/admin/realms/${name}/users`;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  /** An access token for the service account (client credentials grant). */
  async token(): Promise<string> {
    const response = await this.call(this.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
      }),
    });
    if (!response.ok) throw new KeycloakUnavailableError(`Token request refused: ${response.status}`);
    const body: unknown = await response.json();
    const token = typeof body === "object" && body !== null ? Reflect.get(body, "access_token") : undefined;
    if (typeof token !== "string" || token === "") throw new KeycloakUnavailableError("Token response without access_token");
    return token;
  }

  /** `true` for 200, `false` for 404; anything else throws. */
  async exists(userId: string, token: string): Promise<boolean> {
    const response = await this.call(`${this.usersUrl}/${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    await response.body?.cancel();
    if (response.status === 200) return true;
    if (response.status === 404) return false;
    throw new KeycloakUnavailableError(`User lookup answered ${response.status}`);
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch (error) {
      throw new KeycloakUnavailableError(`Keycloak unreachable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
