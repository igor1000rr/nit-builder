/**
 * useAuth — Subscribe to global auth state.
 *
 * Re-export from AuthContext for backward compatibility. The actual
 * implementation lives in app/lib/contexts/AuthContext.tsx and is
 * provided once at the root via <AuthProvider>.
 */

export { useAuth, useAuthRefetch, type AuthState } from "~/lib/contexts/AuthContext";
