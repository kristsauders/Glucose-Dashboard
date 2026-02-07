/**
 * Simple auth hook for getting authorization headers
 */
export function useAuth() {
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const token = localStorage.getItem('t1d_auth_token');

    if (!token) {
      throw new Error('Not authenticated');
    }

    return {
      'Authorization': `Bearer ${token}`,
    };
  };

  return {
    getAuthHeaders,
  };
}
