import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/errors/api-exception.js';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Messages copied from the reference (its actions and Laravel's language
// files), so people see the same wording.
export const Messages = {
  invalidCredentials: 'These credentials do not match our records.',
  invalidInvitation:
    'This invitation link is not valid, or it expired. Ask your administrator to send a new one.',
  archivedInvitation:
    'An archived account cannot be invited. Reinstate the account first.',
  passwordChangeRequired:
    'Your administrator requires you to choose a new password before continuing.',
  passwordConfirmationRequired: 'Password confirmation required.',
  wrongPassword: 'The provided password was incorrect.',
  wrongCurrentPassword:
    'The provided password does not match your current password.',
  invalidResetToken: 'This password reset token is invalid.',
  invalidTwoFactorCode:
    'The provided two factor authentication code was invalid.',
  invalidRecoveryCode: 'The provided two factor recovery code was invalid.',
  signInExpired: 'Your sign-in attempt has expired. Sign in again.',
  unauthenticated: 'Unauthenticated.',
  emailTaken: 'The email has already been taken.',
  emailInvalid: 'The email field must be a valid email address.',
  invalidVerificationLink:
    'This verification link is not valid, or it expired.',
  alreadyVerified: 'Your email address is already verified.',
} as const;

export class InvalidCredentials extends ApiException {
  constructor() {
    super(
      HttpStatus.UNAUTHORIZED,
      'invalid_credentials',
      Messages.invalidCredentials,
    );
  }
}

export class Unauthenticated extends ApiException {
  constructor(message: string = Messages.unauthenticated) {
    super(HttpStatus.UNAUTHORIZED, 'unauthenticated', message);
  }
}

// 423, as Laravel's password.confirm answers JSON requests.
export class PasswordConfirmationRequired extends ApiException {
  constructor() {
    super(
      HttpStatus.LOCKED,
      'password_confirmation_required',
      Messages.passwordConfirmationRequired,
    );
  }
}

export class PasswordChangeRequired extends ApiException {
  constructor() {
    super(
      HttpStatus.FORBIDDEN,
      'password_change_required',
      Messages.passwordChangeRequired,
    );
  }
}

export class AccountNotActive extends ApiException {
  constructor(message: string) {
    super(HttpStatus.FORBIDDEN, 'forbidden', message);
  }
}
