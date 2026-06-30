import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchComments, fetchProfiles, fetchTasks } from '@/lib/data';
import { isoDate } from '@/lib/tasks';
import type { Profile, TaskComment, TaskWithPeople } from '@/lib/types';
import { TaskWorkspace } from '@/components/TaskWorkspace';
import { TabHelpModal } from '@/components/TabHelpModal';

const TASKS_HELP_SECTIONS = [
  {
    heading: 'Three views',
    items: [
      { label: 'List', desc: 'Default view. Tasks grouped by status with due dates and priority color. Check off items as you go.' },
      { label: 'Board', desc: 'Kanban columns — Todo, In Progress, Done. Drag a card across columns to update its status.' },
      { label: 'Calendar', desc: 'Tasks plotted by due date. Drag any task to a new date to reschedule it.' },
    ],
    note: 'The system remembers which view you last used.',
  },
  {
    heading: 'Mine vs. my team',
    items: [
      { label: 'My tasks', desc: 'Tasks assigned to you or created by you.' },
      { label: 'My team', desc: 'Tasks belonging to your direct reports. Managers and admins only. Filter by individual person using the name chips.' },
    ],
  },
  {
    heading: 'Creating a task',
    items: [
      { label: 'Required', desc: 'Title and who it\'s assigned to. Everything else is optional.' },
      { label: 'Due date', desc: 'Sets when the task appears in My Week and the Calendar view. Leave blank if there\'s no deadline.' },
      { label: 'Priority', desc: 'P1 = urgent (red), P2 = high (gold), P3 = normal (blue), P4 = low (gray). Affects sort order and color coding.' },
    ],
    note: 'Tasks you create or are assigned to automatically appear on your home screen widgets.',
  },
];


// The full "My tasks" workspace (List / Board / Calendar views). The Home dashboard
// (WidgetHome) surfaces today's slice + Incoming Tasks; this is the deep view.
export function TasksView() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<TaskWithPeople[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, t, c] = await Promise.all([fetchProfiles(), fetchTasks(), fetchComments()]);
      setProfiles(p);
      setTasks(t);
      setComments(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profile) return null;
  if (loading) return <p className="p-8 text-sm text-sparrow-gray">Loading tasks…</p>;
  if (error) return <p className="p-8 text-sm text-priority-p1">{error}</p>;

  return (
    <>
      <TabHelpModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="My Tasks"
        intro="Your personal task workspace. Three views, two scopes, one place for everything assigned to you."
        sections={TASKS_HELP_SECTIONS}
      />
      <TaskWorkspace
        currentUser={profile}
        profiles={profiles}
        tasks={tasks}
        comments={comments}
        today={isoDate(new Date())}
        onChanged={load}
        onHelp={() => setHelpOpen(true)}
      />
    </>
  );
}
