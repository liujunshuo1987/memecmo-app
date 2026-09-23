'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface Subscription {
  id: string;
  plan_type: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface UsageQuota {
  brands_count: number;
  brands_limit: number;
  visibility_scans_used: number;
  visibility_scans_limit: number;
  geo_audits_used: number;
  geo_audits_limit: number;
  competitors_count: number;
  competitors_limit: number;
  api_calls_used: number;
  api_calls_limit: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  subscription: Subscription | null;
  quotas: UsageQuota | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  subscription: null,
  quotas: null,
  loading: true,
  signOut: async () => {},
  refreshSubscription: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [quotas, setQuotas] = useState<UsageQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Billing is ORG-level (org_subscriptions, credit_ledger — see lib/billing.ts
  // and /api/workspace/billing). The per-user `subscriptions` / `usage_quotas`
  // tables this context was written for never existed in this schema, so every
  // page load 404'd twice. Kept as null for the consumers that still read them.
  const fetchSubscription = async (_userId: string) => { setSubscription(null); };
  const fetchQuotas = async (_userId: string) => { setQuotas(null); };

  const refreshSubscription = async () => {
    if (user) {
      await Promise.all([fetchSubscription(user.id), fetchQuotas(user.id)]);
    }
  };

  useEffect(() => {
    const getSession = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        await Promise.all([
          fetchSubscription(currentSession.user.id),
          fetchQuotas(currentSession.user.id),
        ]);
      }
      setLoading(false);
    };

    getSession();

    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          (async () => {
            await Promise.all([
              fetchSubscription(newSession.user.id),
              fetchQuotas(newSession.user.id),
            ]);
          })();
        } else {
          setSubscription(null);
          setQuotas(null);
        }

        if (event === 'SIGNED_OUT') {
          setLoading(false);
        }
      }
    );

    return () => {
      authListener.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setSubscription(null);
    setQuotas(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, subscription, quotas, loading, signOut, refreshSubscription }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
