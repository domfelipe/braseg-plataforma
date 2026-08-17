import { createContext, useContext, useEffect, ReactNode } from "react";
import { useAuth as useClerkAuth, useUser, useSession } from "@clerk/clerk-react";
import { setTokenProvider } from "@/integrations/api/client";

interface UserProfile {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  session: { id: string } | null;
  user: { id: string } | null;
  profile: UserProfile | null;
  roles: string[];
  isMaster: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, signOut: clerkSignOut } = useClerkAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useUser();
  const { session } = useSession();

  // Injeta o token da sessão Clerk no cliente HTTP da API
  useEffect(() => {
    setTokenProvider(async () => session?.getToken() ?? null);
  }, [session]);

  const fullName = clerkUser
    ? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || clerkUser.username || clerkUser.primaryEmailAddress?.emailAddress || "Usuário"
    : null;

  const profile: UserProfile | null = clerkUser
    ? {
        id: clerkUser.id,
        full_name: fullName || "Usuário",
        phone: clerkUser.primaryPhoneNumber?.phoneNumber ?? null,
        avatar_url: clerkUser.imageUrl,
      }
    : null;

  const value: AuthContextType = {
    session: isSignedIn && session ? { id: session.id } : null,
    user: clerkUser ? { id: clerkUser.id } : null,
    profile,
    roles: [],
    // isMaster real vem de useCompany (/api/me)
    isMaster: false,
    loading: !isLoaded || !userLoaded,
    signIn: async () => ({ error: new Error("Use o fluxo do Clerk (componente SignIn)") }),
    signOut: async () => {
      await clerkSignOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
