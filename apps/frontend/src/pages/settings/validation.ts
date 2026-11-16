/**
 * The form-side copy of the user service's rules (`apps/user/src/models/user.ts`),
 * so a mistake is shown next to its field before anything is sent. The server
 * stays the authority; these only mirror it.
 */

/** ajv-formats' `email` in its default "full" mode, which Fastify's validator uses. */
const EMAIL_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** The message for a field, or null when it is valid. */
export type FieldCheck = string | null;

/** The name is sent trimmed, so a name of spaces only counts as empty. */
export function checkName(name: string): FieldCheck {
  const trimmed = name.trim();
  if (trimmed === "") return "Enter your name";
  if (trimmed.length > NAME_MAX) return `Use at most ${NAME_MAX} characters`;
  return null;
}

export function checkEmail(email: string): FieldCheck {
  const trimmed = email.trim();
  if (trimmed === "") return "Enter your email";
  if (trimmed.length > EMAIL_MAX) return `Use at most ${EMAIL_MAX} characters`;
  if (!EMAIL_PATTERN.test(trimmed)) return "Enter an email address like name@example.com";
  return null;
}

export function checkNewPassword(password: string): FieldCheck {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters`;
  return null;
}

export function checkCurrentPassword(password: string): FieldCheck {
  if (password === "") return "Enter your current password";
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters`;
  return null;
}

export function checkConfirmation(password: string, confirmation: string): FieldCheck {
  if (confirmation === "") return "Repeat the new password";
  return confirmation === password ? null : "The passwords do not match";
}
