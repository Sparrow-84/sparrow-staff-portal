import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { fetchComments, fetchProfiles, fetchTasks } from '@/lib/data';
import { isoDate } from '@/lib/tasks';
import type { Profile, TaskComment, TaskWithPeople } from '@/lib/types';
import { TaskWorkspace } from '@/components/TaskWorkspace';

// The full "My tasks" workspace (List / Board / Calendar views). The Home dashboard
// (WidgetHome) surfaces today's slice + the triage inbox; this is the deep view.
export function TasksView() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<TaskWithPeople[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <TaskWorkspace
      currentUser={profile}
      profiles={profiles}
      tasks={tasks}
      comments={comments}
      today={isoDate(new Date())}
      onChanged={load}
    />
  );
}
