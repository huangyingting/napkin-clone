import {
  deriveConnectedAccounts,
  type ConnectedAccount,
} from "@/lib/auth/connected-accounts";

export interface SettingsAccountViewModel {
  profile: {
    initialName: string;
    email: string;
  };
  emailVerification: {
    isVerified: boolean;
    badgeLabel: string;
    message: string;
  };
  password: {
    hasPassword: boolean;
    heading: string;
    description: string;
  };
  connectedAccounts: ConnectedAccount[];
  links: {
    accountExport: string;
    billing: string;
    documents: string;
  };
}

export interface SettingsAccountRow {
  name: string | null;
  email: string;
  image: string | null;
  passwordHash: string | null;
  emailVerified: Date | null;
}

export function buildSettingsAccountViewModel({
  user,
  googleConfigured,
}: {
  user: SettingsAccountRow;
  googleConfigured: boolean;
}): SettingsAccountViewModel {
  const hasPassword = Boolean(user.passwordHash);
  const isVerified = Boolean(user.emailVerified);

  return {
    profile: {
      initialName: user.name ?? "",
      email: user.email,
    },
    emailVerification: {
      isVerified,
      badgeLabel: isVerified ? "Verified" : "Unverified",
      message: isVerified
        ? `Your email ${user.email} is verified.`
        : `Confirm ${user.email} to secure your account.`,
    },
    password: {
      hasPassword,
      heading: hasPassword ? "Change password" : "Set a password",
      description: hasPassword
        ? "Update the password you use to sign in."
        : "Add a password so you can sign in with your email too.",
    },
    connectedAccounts: deriveConnectedAccounts({
      hasPassword,
      image: user.image,
      googleConfigured,
    }),
    links: {
      accountExport: "/api/account/export",
      billing: "/app/settings/billing",
      documents: "/app",
    },
  };
}
