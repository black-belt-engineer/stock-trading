import * as client from "openid-client";

export interface OidcSettings {
  /** The issuer Keycloak puts in its tokens (public URL of the realm). */
  issuerUrl: string;
  /** Where the BFF reaches the realm itself. */
  internalUrl: string;
  clientId: string;
  clientSecret: string;
}

function isServerMetadata(value: unknown): value is client.ServerMetadata {
  return (
    typeof value === "object" &&
    value !== null &&
    "issuer" in value &&
    typeof value.issuer === "string"
  );
}

/**
 * Loads the OIDC configuration from the internal Keycloak URL.
 *
 * `client.discovery()` is not used on purpose: it rejects a document whose `issuer` differs from
 * the URL it was fetched from, and here they differ by design. Keycloak answers on the internal
 * address (8180) but names the public address (5173) as the issuer, because of `KC_HOSTNAME`. The
 * document is fetched by hand, its issuer is checked against the configured public one, and the
 * `Configuration` is built from it. The token and JWKS endpoints in it follow the request host
 * (`KC_HOSTNAME_BACKCHANNEL_DYNAMIC`), so they point at the internal address.
 */
export async function discoverOidc(settings: OidcSettings): Promise<client.Configuration> {
  const url = `${settings.internalUrl.replace(/\/+$/, "")}/.well-known/openid-configuration`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`OIDC discovery failed: ${url} answered ${response.status}`);
  }

  const metadata: unknown = await response.json();
  if (!isServerMetadata(metadata)) {
    throw new Error(`OIDC discovery failed: ${url} did not return a document with an issuer`);
  }
  if (metadata.issuer !== settings.issuerUrl) {
    throw new Error(
      `OIDC discovery failed: issuer is ${metadata.issuer}, expected ${settings.issuerUrl} (KEYCLOAK_ISSUER_URL)`,
    );
  }

  // Keycloak lists the revocation endpoint on the public address, but the BFF calls it server to
  // server, so it goes to the internal one.
  const internalBase = settings.internalUrl.replace(/\/+$/, "");
  const revocation = metadata.revocation_endpoint;
  const reachable: client.ServerMetadata =
    typeof revocation === "string" && revocation.startsWith(`${settings.issuerUrl}/`)
      ? { ...metadata, revocation_endpoint: internalBase + revocation.slice(settings.issuerUrl.length) }
      : metadata;

  const config = new client.Configuration(
    reachable,
    settings.clientId,
    settings.clientSecret,
  );
  // Local development talks to Keycloak over plain HTTP; production sits behind TLS.
  if (new URL(url).protocol === "http:") {
    client.allowInsecureRequests(config);
  }
  return config;
}
