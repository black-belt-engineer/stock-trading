import type { DeepPartial } from "keycloakify/tools/DeepPartial";
import type { KcContext } from "./KcContext";
import KcPage from "./KcPage";
import { createGetKcContextMock } from "keycloakify/login/KcContext";
import type { KcContextExtension, KcContextExtensionPerPage } from "./KcContext";
import { themeNames, kcEnvDefaults } from "../kc.gen";

const kcContextExtension: KcContextExtension = {
    themeName: themeNames[0],
    properties: {
        ...kcEnvDefaults
    }
};
const kcContextExtensionPerPage: KcContextExtensionPerPage = {
    "register.ftl": {}
};

// The real realm logs in with the email and has one "Name" field instead of
// username, first name and last name, so the mock profile is cut down to match it.
const realmProfile = {
    profile: {
        attributesByName: {
            username: undefined,
            lastName: undefined,
            firstName: { displayName: "Name" }
        }
    }
};

export const { getKcContextMock } = createGetKcContextMock({
    kcContextExtension,
    kcContextExtensionPerPage,
    overrides: {
        realm: { registrationEmailAsUsername: true }
    },
    overridesPerPage: {
        "register.ftl": realmProfile,
        "login-update-profile.ftl": realmProfile,
        "idp-review-user-profile.ftl": realmProfile
    }
});

/**
 * The `messagesPerField` of a failed submit: the error text for each field name.
 * Use it as `kcContext.messagesPerField` in a story's args.
 */
export function fieldErrors(errors: Record<string, string>) {
    const has = (...names: string[]) => names.some(name => name in errors);
    return {
        get: (name: string) => errors[name] ?? "",
        existsError: has,
        exists: has,
        getFirstError: (...names: string[]) => names.map(name => errors[name]).find(text => text !== undefined) ?? ""
    };
}

/** A banner message for the whole page (what Keycloak shows for `message`). */
export function bannerError(summary: string): { type: "error"; summary: string } {
    return { type: "error", summary };
}

export function createKcPageStory<PageId extends KcContext["pageId"]>(params: {
    pageId: PageId;
}) {
    const { pageId } = params;

    function KcPageStory(props: {
        kcContext?: DeepPartial<Extract<KcContext, { pageId: PageId }>>;
    }) {
        const { kcContext: overrides } = props;

        const kcContextMock = getKcContextMock({
            pageId,
            overrides
        });

        return <KcPage kcContext={kcContextMock} />;
    }

    return { KcPageStory };
}
