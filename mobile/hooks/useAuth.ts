import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { getToken, getUser, saveToken, saveUser, clearAuth, StoredUser } from '../services/auth';
import * as api from '../services/api';

interface AuthContext {
  token: string | null;
  user: StoredUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, diagnosisType?: string, diagnosisDate?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContext>({} as AuthContext);

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthProvider(): AuthContext & { isReady: boolean } {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [t, u] = await Promise.all([getToken(), getUser()]);
      setToken(t);
      setUser(u);
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    await saveToken(res.token);
    const stored: StoredUser = {
      id: res.user.id,
      email: res.user.email,
      diagnosisDate: res.user.diagnosisDate,
      diagnosisType: res.user.diagnosisType,
      timezone: res.user.timezone,
    };
    await saveUser(stored);
    setToken(res.token);
    setUser(stored);
  }, []);

  const signup = useCallback(async (email: string, password: string, diagnosisType?: string, diagnosisDate?: string) => {
    const res = await api.signup(email, password, diagnosisType, diagnosisDate);
    await saveToken(res.token);
    const stored: StoredUser = {
      id: res.user.id,
      email: res.user.email,
      diagnosisDate: res.user.diagnosisDate,
      diagnosisType: res.user.diagnosisType,
    };
    await saveUser(stored);
    setToken(res.token);
    setUser(stored);
  }, []);

  const logout = useCallback(async () => {
    await clearAuth();
    setToken(null);
    setUser(null);
  }, []);

  return { token, user, loading, isAuthenticated: !!token, login, signup, logout, isReady: !loading };
}
