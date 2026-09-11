import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";
import { setAccessToken } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setAccessToken(data.session?.access_token ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAccessToken(newSession?.access_token ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = {
    session,
    loading: session === undefined,
    user: session?.user ?? null,
    signUp: (email, password) => supabase.auth.signUp({ email, password }),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
    // Onboarding mints the restaurant_id claim via a Postgres hook that only
    // runs at token-issuance time — refresh so the *next* request carries it,
    // rather than telling the user to sign out and back in.
    refreshSession: () => supabase.auth.refreshSession(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
