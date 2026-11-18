/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { ExtendKcContext } from "keycloakify/login";
import type { KcEnvName, ThemeName } from "../kc.gen";

export type KcContextExtension = {
    themeName: ThemeName;
    properties: Record<KcEnvName, string> & {};
    // NOTE: Here you can declare more properties to extend the KcContext
    // See: https://docs.keycloakify.dev/faq-and-help/some-values-you-need-are-missing-from-in-kccontext
};

// Keycloak puts `social` in every page's attributes, but Keycloakify types it on the
// login pages only. The register page shows the provider buttons too.
export type KcContextExtensionPerPage = {
    "register.ftl": {
        social?: {
            displayInfo: boolean;
            providers?: { loginUrl: string; alias: string; providerId: string; displayName: string }[];
        };
    };
};

export type KcContext = ExtendKcContext<KcContextExtension, KcContextExtensionPerPage>;
