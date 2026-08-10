import { useAuth } from '@/auth/AuthContext';

export function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <button onClick={() => void signOut()} className="btn-ghost text-sparrow-gray dark:text-sparrow-dark-gray">
      Sign out
    </button>
  );
}
