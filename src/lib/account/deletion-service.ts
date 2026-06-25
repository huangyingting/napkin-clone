import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import {
  getBillingProvider,
  shouldCancelSubscription,
  type BillingProvider,
} from "@/lib/billing/provider";
import {
  getSubscriptionCancellationState,
  type SubscriptionCancellationState,
} from "@/lib/billing/service";
import { logError } from "@/lib/log";
import { prisma } from "@/lib/prisma";

type PrismaClientLike = typeof prisma;

const DELETE_CONFIRMATION_KEYWORD = "DELETE";

const GENERIC_DELETE_ERROR = "Could not delete your account. Please try again.";

export interface DeleteAccountDependencies {
  client?: PrismaClientLike;
  getCancellationState?: (
    userId: string,
  ) => Promise<SubscriptionCancellationState | null>;
  getProvider?: () => Promise<BillingProvider>;
  log?: typeof logError;
}

export async function deleteAccountForUser(
  input: { userId: string; confirmation: FormDataEntryValue | string | null },
  dependencies: DeleteAccountDependencies = {},
): Promise<ActionResult> {
  const {
    client = prisma,
    getCancellationState = getSubscriptionCancellationState,
    getProvider = getBillingProvider,
    log = logError,
  } = dependencies;
  const confirmation = String(input.confirmation ?? "").trim();

  const dbUser = await client.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  });
  if (!dbUser) {
    return actionError(GENERIC_DELETE_ERROR);
  }

  const matchesEmail =
    confirmation.toLowerCase() === dbUser.email.trim().toLowerCase();
  const matchesKeyword = confirmation === DELETE_CONFIRMATION_KEYWORD;
  if (!matchesEmail && !matchesKeyword) {
    return actionError(
      `Type your email or "${DELETE_CONFIRMATION_KEYWORD}" to confirm.`,
    );
  }

  try {
    const sub = await getCancellationState(input.userId);

    if (shouldCancelSubscription(sub)) {
      try {
        const billing = await getProvider();
        await billing.cancelSubscriptionImmediately(input.userId);
      } catch (err) {
        log("billing.subscription.cancel_immediate", err, {
          userId: input.userId,
          reason: "account-deletion",
        });
      }
    }

    await client.user.delete({ where: { id: input.userId } });
  } catch {
    return actionError(GENERIC_DELETE_ERROR);
  }

  return actionOk();
}
