import type { JSX } from "react";
import type { I18n } from "./i18n";

type Provider = { loginUrl: string; alias: string; displayName: string };

function isProvider(value: unknown): value is Provider {
  return (
    typeof value === "object" &&
    value !== null &&
    "loginUrl" in value &&
    typeof value.loginUrl === "string" &&
    "alias" in value &&
    typeof value.alias === "string" &&
    "displayName" in value &&
    typeof value.displayName === "string"
  );
}

/**
 * The identity providers Keycloak offers on this page (`kcContext.social.providers`).
 * A disabled provider is not in the list, so without Google credentials this is empty.
 * The register page's context type has no `social`, so it is read with guards.
 */
export function getSocialProviders(kcContext: object): Provider[] {
  if (!("social" in kcContext) || typeof kcContext.social !== "object" || kcContext.social === null) return [];
  if (!("providers" in kcContext.social) || !Array.isArray(kcContext.social.providers)) return [];
  return kcContext.social.providers.filter(isProvider);
}

/**
 * The provider buttons with an "or" divider below them, placed above the form
 * (owner decision). Renders nothing when there is no provider. Only Google is
 * configured, so the label is "Continue with <name>" from the provider's display name.
 */
export default function SocialProviders(props: { providers: Provider[]; i18n: I18n }): JSX.Element | null {
  const { providers, i18n } = props;
  if (providers.length === 0) return null;
  const { msg, msgStr } = i18n;

  return (
    <div className="st-social">
      <ul className="st-social-list">
        {providers.map(provider => (
          <li key={provider.alias}>
            <a id={`social-${provider.alias}`} className="st-button st-button-secondary" href={provider.loginUrl}>
              {msgStr("continueWith", provider.displayName)}
            </a>
          </li>
        ))}
      </ul>
      <div className="st-divider" role="separator">
        <span>{msg("orDivider")}</span>
      </div>
    </div>
  );
}
