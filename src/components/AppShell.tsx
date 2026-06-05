import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Header } from './Header';
import { Sidebar, type View } from './Sidebar';
import { WidgetHome } from './home/WidgetHome';
import { TasksView } from '@/pages/TasksView';
import { CalendarView } from '@/pages/CalendarView';
import { SettingsView } from '@/pages/SettingsView';
import { TwinOaksRoom } from './twinoaks/TwinOaksRoom';
import { LcpRoom } from './lcp/LcpRoom';
import { StaffAdmin } from './admin/StaffAdmin';
import { ValuesFooter } from './ValuesFooter';

export function AppShell() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>('home');
  const [navOpen, setNavOpen] = useState(false);

  if (!profile) return null;
  const isAdmin = profile.role === 'admin';
  // Phase 1: the LCP Room serves full LCP staff (Shelly, Audrey, Andrew). Extended
  // read-only access (Bethany, Susanna) lands in Phase 2 (Stories & Prayer).
  const lcpAccess = profile.lcp_role === 'full';

  return (
    <div className="flex min-h-screen flex-col">
      <Header profile={profile} onMenu={() => setNavOpen(true)} />
      <div className="flex flex-1">
        <Sidebar
          view={view}
          isAdmin={isAdmin}
          lcpAccess={lcpAccess}
          onNavigate={setView}
          open={navOpen}
          onClose={() => setNavOpen(false)}
        />
        <main className="flex-1">
          {view === 'home' && <WidgetHome onNavigate={setView} />}
          {view === 'tasks' && <TasksView />}
          {view === 'calendar' && <CalendarView />}
          {view === 'settings' && <SettingsView />}
          {view === 'twin-oaks' && <TwinOaksRoom />}
          {view === 'lcp' && <LcpRoom />}
          {view === 'staff' && <StaffAdmin />}
        </main>
      </div>
      <ValuesFooter />
    </div>
  );
}
