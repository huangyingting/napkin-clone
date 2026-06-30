"use client";

import { useCallback, useId, useRef } from "react";

import { cx, FOCUS_RING, TOOLBAR_BUTTON_CHROME } from "./tokens";

export type ChoiceGroupOption<Value extends string | number> = {
  value: Value;
  label: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
};

export type ChoiceGroupProps<Value extends string | number> = {
  options: ReadonlyArray<ChoiceGroupOption<Value>>;
  value: Value;
  onChange: (value: Value) => void;
  "aria-label": string;
  className?: string;
  wrap?: boolean;
};

export function ChoiceGroup<Value extends string | number>({
  options,
  value,
  onChange,
  className,
  wrap = false,
  ...rest
}: ChoiceGroupProps<Value>) {
  const groupId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusIndex = useCallback((index: number) => {
    refs.current[index]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const lastIndex = options.length - 1;
      let nextIndex = index;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = index === lastIndex ? 0 : index + 1;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = index === 0 ? lastIndex : index - 1;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = lastIndex;
      } else {
        return;
      }
      event.preventDefault();
      const option = options[nextIndex];
      if (option && !option.disabled) {
        onChange(option.value);
      }
      focusIndex(nextIndex);
    },
    [focusIndex, onChange, options],
  );

  return (
    <div
      role="radiogroup"
      className={cx("flex gap-0.5", wrap && "flex-wrap justify-end", className)}
      {...rest}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            tabIndex={active ? 0 : -1}
            id={`${groupId}-${option.value}`}
            title={option.title}
            onClick={() => !option.disabled && onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cx(
              "rounded-ds-sm px-2 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
              active
                ? TOOLBAR_BUTTON_CHROME.active
                : TOOLBAR_BUTTON_CHROME.subtle,
              FOCUS_RING,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
