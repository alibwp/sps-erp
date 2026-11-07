// Same states and refusal messages as the reference's AccountStatus enum.
export const ACCOUNT_STATUSES = [
  'invited',
  'active',
  'suspended',
  'archived',
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

const ACCESS_DENIED: Record<AccountStatus, string> = {
  invited:
    'This account is not active yet. Use your invitation link to set a password.',
  active: '',
  suspended:
    "This account is suspended. If this is an error, contact your school's administrator.",
  archived:
    "This account is archived. If this is an error, contact your school's administrator.",
};

export function canAccessApplication(status: AccountStatus): boolean {
  return status === 'active';
}

export function accessDeniedMessage(status: AccountStatus): string {
  return ACCESS_DENIED[status];
}

export const GENDERS = [
  'Male',
  'Female',
  'Non-binary',
  'Prefer not to say',
] as const;

export type Gender = (typeof GENDERS)[number];
