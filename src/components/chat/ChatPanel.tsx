import { MessagesView } from '@/pages/MessagesView';

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={`fixed inset-0 z-50 ${!open && 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-black/25 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <MessagesView embedded onClose={onClose} />
      </div>
    </div>
  );
}
