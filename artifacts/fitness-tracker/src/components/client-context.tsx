import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVE_CLIENT_KEY } from "@/lib/api";
import { useAuth } from "@/components/auth-context";

type ClientContextType = {
  activeClientId: string | null;
  setActiveClientId: (clientId: string | null) => void;
};

const ClientContext = createContext<ClientContextType | null>(null);

export function ClientProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeClientIdState, setActiveClientIdState] = useState<string | null>(() => {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(ACTIVE_CLIENT_KEY);
  });

  const activeClientId = user?.role === "client" ? user.clientId : activeClientIdState;

  useEffect(() => {
    if (user?.role === "client" && user.clientId) {
      localStorage.setItem(ACTIVE_CLIENT_KEY, user.clientId);
      setActiveClientIdState(user.clientId);
    }
    if (!user) {
      localStorage.removeItem(ACTIVE_CLIENT_KEY);
      setActiveClientIdState(null);
    }
  }, [user]);

  const setActiveClientId = (clientId: string | null) => {
    if (clientId) {
      localStorage.setItem(ACTIVE_CLIENT_KEY, clientId);
    } else {
      localStorage.removeItem(ACTIVE_CLIENT_KEY);
    }
    setActiveClientIdState(clientId);
    queryClient.clear();
  };

  return (
    <ClientContext.Provider value={{ activeClientId, setActiveClientId }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const context = useContext(ClientContext);
  if (!context) throw new Error("useClient must be used within ClientProvider");
  return context;
}
