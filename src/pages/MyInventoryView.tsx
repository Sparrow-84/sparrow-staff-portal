import { StaffSubmissionView } from '@/components/inventory/StaffSubmissionView';

export function MyInventoryView() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-sparrow-rule dark:border-sparrow-dark-border px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold">My Inventory</h1>
            <p className="text-sm text-sparrow-gray dark:text-sparrow-dark-gray mt-0.5">
              Log additions and removals for your area each month
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-sparrow-rule dark:border-sparrow-dark-border px-3 py-1 text-xs text-sparrow-gray dark:text-sparrow-dark-gray">
            {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <StaffSubmissionView month={month} year={year} />
      </div>
    </div>
  );
}
