import { i18nBuilder } from "keycloakify/login";
import type { ThemeName } from "../kc.gen";

/**
 * English only (the app has no other language). The overrides below keep the
 * phase 10 copy, and none of the error texts says whether an email is registered.
 * @see: https://docs.keycloakify.dev/features/i18n
 */
const { useI18n, ofTypeI18n } = i18nBuilder
  .withThemeName<ThemeName>()
  .withCustomTranslations({
    en: {
      noPasswordResetNote: "There is no password reset yet. Keep your password somewhere safe.",
      loginTitle: "Log in to {0}",
      // Wrong email and wrong password get the same answer, and so does an unknown email.
      invalidUserMessage: "Invalid email or password",
      invalidUsernameMessage: "Invalid email or password",
      invalidPasswordMessage: "Invalid email or password",
      invalidEmailMessage: "Enter a valid email address",
      // The lock lasts up to 15 minutes (the realm's brute-force settings).
      accountTemporarilyDisabledMessage: "Too many failed attempts. Try again in a few minutes.",
      accountDisabledMessage: "This account is disabled.",
      expiredCodeMessage: "This page expired. Log in again.",
      pageExpiredTitle: "This page has expired",
      pageExpiredMsg1: "Start again from the login page",
      pageExpiredMsg2: "Or continue where you left off",
      // Registration cannot hide that an email is taken (the user must be told), but
      // the text stays neutral and points to the login page.
      emailExistsMessage: "That email can't be used. Try logging in instead.",
      usernameExistsMessage: "That email can't be used. Try logging in instead.",
      alreadyLoggedIn: "You are already logged in.",
      backToApplication: "Back to Streamtick",
      doLogIn: "Log in",
      doRegister: "Create account"
    }
  })
  .build();

type I18n = typeof ofTypeI18n;

export { useI18n, type I18n };
