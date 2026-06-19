"use client";

import { useState, useTransition } from "react";

import type { Plan } from "@/lib/billing/entitlements";
import { changePlanAction, cancelSubscriptionAction } from "./actions";

interface BillingActionsProps {
  currentPlan: Plan;
  cancelAtPeriodEnd: boolean;
}

export function BillingActions({
  currentPlan,
  cancelAtPeriodEnd,
}: BillingActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function handleChange(targetPlan: string) {
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      const result = await changePlanAction(targetPlan);
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      setMessage(result.message);
      setIsError(!result.success);
    });
  }

  function handleCancel() {
    setMessage(null);
    setIsError(false);
    startTransition(async () => {
      const result = await cancelSubscriptionAction();
      setMessage(result.message);
      setIsError(!result.success);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Plan buttons */}
      <div className="grid grid-cols-3 gap-3">
        <PlanCard
          label="Free"
          price="Free"
          description="500 credits/week · PNG &amp; PDF"
          isCurrent={currentPlan === "free"}
          onSelect={() => handleChange("free")}
          disabled={isPending || currentPlan === "free"}
        />
        <PlanCard
          label="Plus"
          price="$12/mo"
          description="10k credits/mo · SVG &amp; PPTX · Brand Styles"
          isCurrent={currentPlan === "plus"}
          onSelect={() => handleChange("plus")}
          disabled={isPending || currentPlan === "plus"}
        />
        <PlanCard
          label="Pro"
          price="$29/mo"
          description="30k credits/mo · Fonts · Top-ups"
          isCurrent={currentPlan === "pro"}
          onSelect={() => handleChange("pro")}
          disabled={isPending || currentPlan === "pro"}
        />
      </div>

      {/* Cancel */}
      {currentPlan !== "free" && !cancelAtPeriodEnd && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="w-fit text-sm text-ghost-secondary underline-offset-4 transition hover:text-ghost-red hover:underline disabled:opacity-50"
        >
          Cancel subscription
        </button>
      )}

      {/* Feedback */}
      {message && (
        <p
          className={`rounded-lg px-4 py-2 text-sm ${
            isError ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}
        >
          {message}
        </p>
      )}

      {isPending && <p className="text-sm text-ghost-secondary">Updating…</p>}
    </div>
  );
}

function PlanCard({
  label,
  price,
  description,
  isCurrent,
  onSelect,
  disabled,
}: {
  label: string;
  price: string;
  description: string;
  isCurrent: boolean;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition ${
        isCurrent
          ? "border-ghost-accent bg-ghost-accent/5"
          : "border-ghost-border bg-ghost-bg hover:border-ghost-accent/50"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ghost-text">{label}</span>
        {isCurrent && (
          <span className="text-xs font-medium text-ghost-accent">Current</span>
        )}
      </div>
      <span className="text-base font-bold text-ghost-text">{price}</span>
      <span
        className="text-xs text-ghost-secondary"
        dangerouslySetInnerHTML={{ __html: description }}
      />
    </button>
  );
}
