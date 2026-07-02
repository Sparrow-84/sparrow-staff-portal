import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { ChatProvider } from '@/chat/ChatContext';
import { fetchMyOnboardingChecklist } from '@/lib/ops';
import { Header } from './Header';
import { Sidebar, type View } from './Sidebar';
import { WidgetHome } from './home/WidgetHome';
import { TasksView } from '@/pages/TasksView';
import { CalendarView } from '@/pages/CalendarView';
import { ChatPanel } from './chat/ChatPanel';
import { SettingsView } from '@/pages/SettingsView';
import { TwinOaksRoom } from './twinoaks/TwinOaksRoom';
import { LcpRoom } from './lcp/LcpRoom';
import { PartnershipsRoom } from './partnerships/PartnershipsRoom';
import { OperationsRoom } from './ops/OperationsRoom';
import { StaffAdmin } from './admin/StaffAdmin';
import { OnboardingView } from './onboarding/OnboardingView';
import { DocumentsRoom } from './documents/DocumentsRoom';
import { ValuesFooter } from './ValuesFooter';

export function AppShell() {
  const { profile } = useAuth();
  const [view, setView] = useState<View>('home');
  const [navOpen, setNavOpen] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [hasOnboarding, setHasOnboarding] = useState(false);

  useEffect(() => {
    fetchMyOnboardingChecklist()
      .then((cl) => {
        if (cl) {
          setHasOnboarding(true);
          setView('onboarding');
        }
      })
      .catch(() => {/* non-blocking — missing checklist just means no redirect */});
  }, []);

  if (!profile) return null;
  const isAdmin = profile.role === 'admin';
  const lcpAccess = isAdmin || profile.lcp_role === 'full' || profile.lcp_role === 'extended';
  const partnershipsAccess =
    isAdmin || profile.department === 'partnerships' || profile.partnerships_access;
  const opsAccess = profile.ops_access;

  // Rooms locked during rollout preview — only Susanna can access them
  const isSusanna =
    profile.email === 'susannab@sparrowinc.org' ||
    profile.email === 'systems@sparrowinc.org';
  const PREVIEW_LOCKED: View[] = ['twin-oaks', 'partnerships'];

  function handleOnboardingDone() {
    setHasOnboarding(false);
    setView('home');
  }

  function handleNavigate(v: View) {
    if (PREVIEW_LOCKED.includes(v) && !isSusanna) return;
    if (v === 'messages') {
      setChatPanelOpen((prev) => !prev);
      return;
    }
    setView(v);
  }

  return (
    <ChatProvider>
      <div className="flex min-h-screen flex-col">
        <Header profile={profile} onMenu={() => setNavOpen(true)} onNavigate={handleNavigate} />
        <div className="flex flex-1">
          <Sidebar
            view={view}
            isAdmin={isAdmin}
            isSusanna={isSusanna}
            lcpAccess={lcpAccess}
            partnershipsAccess={partnershipsAccess}
            opsAccess={opsAccess}
            hasOnboarding={hasOnboarding}
            onNavigate={handleNavigate}
            open={navOpen}
            onClose={() => setNavOpen(false)}
          />
          <main className="flex-1">
            {view === 'onboarding' && <OnboardingView onDone={handleOnboardingDone} />}
            {view === 'home' && <WidgetHome onNavigate={handleNavigate} />}
            {view === 'tasks' && <TasksView />}
            {view === 'calendar' && <CalendarView />}
            {view === 'settings' && <SettingsView />}
            {view === 'twin-oaks' && <TwinOaksRoom />}
            {view === 'lcp' && <LcpRoom />}
            {view === 'partnerships' && <PartnershipsRoom />}
            {view === 'operations' && <OperationsRoom />}
            {view === 'documents' && <DocumentsRoom />}
            {view === 'staff' && <StaffAdmin />}
          </main>
        </div>
        <ValuesFooter />
        <ChatPanel open={chatPanelOpen} onClose={() => setChatPanelOpen(false)} />
      </div>
    </ChatProvider>
  );
}
