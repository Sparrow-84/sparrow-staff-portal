import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Header } from './Header';
import { Sidebar, type View } from './Sidebar';
import { HomeView } from '@/pages/HomeView';
import { TwinOaksRoom } from './twinoaks/TwinOaksRoom';
import { StaffAdmin } from './admin/StaffAdmin';

export function AppShell() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>('home');

  if (!profile) return null;
  const isAdmin = profile.role === 'admin';

  return (
    <div className="flex min-h-screen flex-col">
      <Header profile={profile} />
      <div className="flex flex-1">
        <Sidebar view={view} isAdmin={isAdmin} onNavigate={setView} />
        <main className="flex-1">
          {view === 'home' && <HomeView />}
          {view === 'twin-oaks' && <TwinOaksRoom />}
          {view === 'staff' && <StaffAdmin />}
        </main>
      </div>
    </div>
  );
}
