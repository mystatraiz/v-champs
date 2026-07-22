"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { phoneToEmail, supabase } from "./supabase";
import { fetchProfile, notifyNewUser } from "./store";
import type { Profile } from "./types";

interface AuthCtx {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (phone: string, password: string) => Promise<string | null>;
  signUp: (phone: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  completeProfile: (p: {
    first_name: string;
    last_name: string;
    nickname: string;
    handedness: string;
    preferred_side: string;
  }) => Promise<string | null>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await fetchProfile(u.id));
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      setUser(session?.user ?? null);
      await loadProfile(session?.user ?? null);
      if (mounted) setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
      } else if (session?.user) {
        setUser(session.user);
        await loadProfile(session.user);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (phone: string, password: string) => {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 8) return "Numéro de téléphone invalide.";
      const { data, error } = await supabase.auth.signInWithPassword({
        email: phoneToEmail(phone),
        password,
      });
      if (error) return "Numéro ou mot de passe incorrect.";
      setUser(data.user);
      await loadProfile(data.user);
      return null;
    },
    [loadProfile]
  );

  const signUp = useCallback(async (phone: string, password: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8) return "Numéro de téléphone invalide.";
    if (password.length < 6) return "Mot de passe : minimum 6 caractères.";
    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(phone),
      password,
    });
    if (error) return error.message;
    setUser(data.user);
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const completeProfile = useCallback(
    async (p: {
      first_name: string;
      last_name: string;
      nickname: string;
      handedness: string;
      preferred_side: string;
    }) => {
      if (!user) return "Session expirée — reconnectez-vous.";
      // Toujours 'pending' : seul un admin peut activer un compte.
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        ...p,
        role: "pending",
        linked_player_name: null,
      });
      if (error) return error.message;
      await notifyNewUser({ user_id: user.id, ...p, email: user.email });
      await loadProfile(user);
      return null;
    },
    [user, loadProfile]
  );

  const refreshProfile = useCallback(async () => {
    await loadProfile(user);
  }, [user, loadProfile]);

  return (
    <Ctx.Provider
      value={{ user, profile, loading, signIn, signUp, signOut, completeProfile, refreshProfile }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
