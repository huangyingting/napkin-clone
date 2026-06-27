"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { FOCUS_RING, MENU_CHROME, cx } from "./tokens";
import { Tooltip } from "./tooltip";

const MENU_GAP = 8;
const VIEWPORT_INSET = 8;

export type SelectMenuOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SelectMenuProps = {
  value: string;
  options: readonly SelectMenuOption[];
  onChange: (value: string) => void;
  "aria-label": string;
  buttonClassName?: string;
  menuClassName?: string;
  placeholder?: ReactNode;
  showSelectedLabel?: boolean;
  showChevron?: boolean;
  showCheck?: boolean;
  align?: "start" | "center" | "end";
  anchor?: "trigger" | "toolbar";
  /**
   * Visual style of the trigger. `ghost` (default) is a compact borderless
   * button for toolbars; `field` renders a full-width bordered form control
   * that matches text/number inputs in the inspector panels.
   */
  variant?: "ghost" | "field";
  onOpenChange?: (open: boolean) => void;
  tooltipLabel?: ReactNode;
  triggerIcon?: ReactNode;
};

export function SelectMenu({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  buttonClassName,
  menuClassName,
  placeholder = "Select",
  showSelectedLabel = true,
  showChevron = true,
  showCheck = true,
  align = "start",
  anchor = "trigger",
  variant = "ghost",
  onOpenChange,
  tooltipLabel,
  triggerIcon,
}: SelectMenuProps) {
  const buttonId = useId();
  const listboxId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  );
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const active = options[activeIndex];
  const activeId = active ? `${listboxId}-${active.value}` : undefined;
  const displayIcon = triggerIcon ?? selected?.icon;
  const [coords, setCoords] = useState({ top: -1000, left: -1000, width: 0 });

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const enabledIndexFrom = useCallback(
    (start: number, delta: 1 | -1) => {
      if (options.length === 0) return -1;
      for (let offset = 0; offset < options.length; offset += 1) {
        const next = (start + offset * delta + options.length) % options.length;
        if (!options[next]?.disabled) return next;
      }
      return -1;
    },
    [options],
  );

  const selectIndex = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    onOpenChangeRef.current?.(false);
    buttonRef.current?.focus();
  };

  const openMenu = () => {
    setActiveIndex(
      selectedIndex >= 0 ? selectedIndex : Math.max(0, enabledIndexFrom(0, 1)),
    );
    setOpen(true);
    onOpenChangeRef.current?.(true);
  };

  const reposition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const buttonRect = button.getBoundingClientRect();
    const anchorEl =
      anchor === "toolbar"
        ? ((button.closest(
            '[data-stage-floating-toolbar="true"]',
          ) as HTMLElement | null) ?? button)
        : button;
    const anchorRect = anchorEl.getBoundingClientRect();
    const menuWidth = Math.max(
      buttonRect.width,
      menuRef.current?.offsetWidth ?? 0,
    );
    const preferredLeft =
      align === "center"
        ? anchorRect.left + anchorRect.width / 2 - menuWidth / 2
        : align === "end"
          ? anchorRect.right - menuWidth
          : anchorRect.left;
    const maxLeft = Math.max(
      VIEWPORT_INSET,
      window.innerWidth - menuWidth - VIEWPORT_INSET,
    );
    setCoords({
      top: anchorRect.bottom + MENU_GAP,
      left: Math.min(Math.max(preferredLeft, VIEWPORT_INSET), maxLeft),
      width: buttonRect.width,
    });
  }, [align, anchor]);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [enabledIndexFrom, open, reposition, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      onOpenChangeRef.current?.(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const handleButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      onOpenChangeRef.current?.(true);
      setActiveIndex(
        enabledIndexFrom(
          selectedIndex >= 0 ? selectedIndex : 0,
          event.key === "ArrowDown" ? 1 : -1,
        ),
      );
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      onOpenChangeRef.current?.(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectIndex(activeIndex);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        enabledIndexFrom(current + (event.key === "ArrowDown" ? 1 : -1), 1),
      );
    }
  };

  const trigger = (
    <button
      ref={buttonRef}
      id={buttonId}
      type="button"
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      onClick={() => {
        if (open) {
          setOpen(false);
          onOpenChangeRef.current?.(false);
        } else {
          openMenu();
        }
      }}
      onKeyDown={handleButtonKeyDown}
      className={cx(
        variant === "field"
          ? "flex h-auto w-full items-center justify-between gap-1.5 rounded-ds-md border border-ds-border-subtle bg-ds-surface px-2 py-1.5 text-[13px] font-normal text-ds-text-primary transition-colors hover:bg-ds-state-hover"
          : "inline-flex h-7 max-w-40 items-center gap-1.5 rounded-ds-sm px-1.5 text-xs font-medium text-ds-text-secondary transition-colors hover:bg-ds-state-hover hover:text-ds-text-primary",
        FOCUS_RING,
        buttonClassName,
      )}
    >
      {displayIcon ? <span className="shrink-0">{displayIcon}</span> : null}
      {showSelectedLabel ? (
        <span
          className={cx(
            "min-w-0 truncate",
            variant === "field" ? "flex-1 text-left" : undefined,
          )}
        >
          {selected?.label ?? placeholder}
        </span>
      ) : null}
      {showChevron ? (
        <ChevronDown
          size={13}
          aria-hidden="true"
          className="shrink-0 text-ds-text-muted"
        />
      ) : null}
    </button>
  );

  return (
    <>
      {tooltipLabel ? (
        <Tooltip label={tooltipLabel} side="bottom">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      {open && typeof document !== "undefined"
        ? createPortal(
            <ul
              ref={menuRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-label={ariaLabel}
              aria-labelledby={buttonId}
              aria-activedescendant={activeId}
              onKeyDown={handleMenuKeyDown}
              style={{
                top: coords.top,
                left: coords.left,
                minWidth: coords.width,
              }}
              className={cx(
                "fixed z-tooltip max-h-72 overflow-y-auto p-1",
                MENU_CHROME,
                menuClassName,
              )}
            >
              {options.map((option, index) => {
                const selectedOption = option.value === value;
                const activeOption = index === activeIndex;
                return (
                  <li
                    key={option.value}
                    id={`${listboxId}-${option.value}`}
                    role="option"
                    aria-selected={selectedOption}
                  >
                    <button
                      type="button"
                      disabled={option.disabled}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectIndex(index)}
                      className={cx(
                        "flex w-full items-center gap-2 rounded-ds-sm px-2 py-1.5 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-40",
                        activeOption
                          ? "bg-ds-state-hover text-ds-text-primary"
                          : "text-ds-text-secondary hover:bg-ds-state-hover hover:text-ds-text-primary",
                        selectedOption
                          ? "font-semibold text-ds-text-primary"
                          : undefined,
                        FOCUS_RING,
                      )}
                    >
                      {option.icon ? (
                        <span className="shrink-0">{option.icon}</span>
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.description ? (
                          <span className="block truncate text-[11px] font-normal text-ds-text-muted">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                      {showCheck && selectedOption ? (
                        <Check
                          size={14}
                          aria-hidden="true"
                          className="ml-2 shrink-0 text-ds-accent"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
