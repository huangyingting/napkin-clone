import type { ButtonHTMLAttributes, ReactNode } from "react";

import {
  actionAriaKeyShortcuts,
  actionTooltip,
  type ActionDescriptor,
} from "@/lib/actions/action-descriptor";

import { Button, IconButton, type ButtonSize } from "./button";

type SharedActionButtonProps = {
  action: ActionDescriptor;
  size?: ButtonSize;
  children?: ReactNode;
};

export type ActionButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "title"
> &
  SharedActionButtonProps & {
    iconOnly?: false;
  };

export type ActionIconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "title"
> &
  SharedActionButtonProps & {
    iconOnly: true;
  };

export function ActionButton({
  action,
  iconOnly,
  children,
  disabled,
  ...props
}: ActionButtonProps | ActionIconButtonProps) {
  const isDisabled = disabled || Boolean(action.disabledReason);
  const title = action.disabledReason ?? actionTooltip(action);
  const ariaKeyShortcuts = actionAriaKeyShortcuts(action);

  if (iconOnly) {
    return (
      <IconButton
        {...props}
        aria-label={action.label}
        aria-keyshortcuts={ariaKeyShortcuts}
        title={title}
        disabled={isDisabled}
      >
        {children}
      </IconButton>
    );
  }

  return (
    <Button
      {...props}
      aria-keyshortcuts={ariaKeyShortcuts}
      title={title}
      disabled={isDisabled}
    >
      {children ?? action.label}
    </Button>
  );
}
