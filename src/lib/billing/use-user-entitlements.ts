"use client";

import { useEffect, useState } from "react";

import type { PlanEntitlements } from "@/lib/billing/entitlements";
import { PLAN_ENTITLEMENTS } from "@/lib/billing/entitlements";

export interface UserEntitlementsState {
  plan: string;
  creditBalance: number;
  entitlements: PlanEntitlements;
  loading: boolean;
}

const FREE_DEFAULTS: UserEntitlementsState = {
  plan: "free",
  creditBalance: 0,
  entitlements: PLAN_ENTITLEMENTS.free,
  loading: false,
};

/**
 * Client-side hook that fetches the current user's plan entitlements from
 * /api/user/entitlements. Falls back to free-tier defaults while loading or
 * when the user is unauthenticated.
 */
export function useUserEntitlements(): UserEntitlementsState {
  const [state, setState] = useState<UserEntitlementsState>({
    ...FREE_DEFAULTS,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/user/entitlements")
      .then((r) => {
        if (!r.ok) return null;
        return r.json() as Promise<{
          plan: string;
          creditBalance: number;
          entitlements: PlanEntitlements;
        }>;
      })
      .then((data) => {
        if (cancelled || !data) return;
        setState({
          plan: data.plan,
          creditBalance: data.creditBalance,
          entitlements: data.entitlements,
          loading: false,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ ...FREE_DEFAULTS, loading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
