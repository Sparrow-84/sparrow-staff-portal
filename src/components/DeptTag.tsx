import { departmentLabel, type Department } from '@/lib/types';

export function DeptTag({ d }: { d: Department }) {
  return (
    <span className="rounded-full bg-sparrow-sage px-2 py-0.5 text-xs font-medium text-sparrow-green dark:text-sparrow-dark-green">
      {departmentLabel(d)}
    </span>
  );
}
