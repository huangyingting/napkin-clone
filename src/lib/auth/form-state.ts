import type { ActionResult } from "@/lib/action-result";

export type SimpleAuthFormState = string | undefined;

export type ProfileResult = ActionResult<{ name: string }>;

export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "sent"; message: string }
  | { status: "error"; message: string };

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

export type PasswordResult = ActionResult;

export type DeleteAccountResult = ActionResult;

export type VerifyEmailResult = ActionResult<{
  status: "sent" | "already_verified";
}>;

export const initialForgotPasswordState: ForgotPasswordState = {
  status: "idle",
};

export const initialResetPasswordState: ResetPasswordState = {
  status: "idle",
};

export const initialActionResultState = null;

export function actionErrorMessage<T>(
  state: ActionResult<T> | null,
): string | null {
  return state && !state.ok ? state.error : null;
}
