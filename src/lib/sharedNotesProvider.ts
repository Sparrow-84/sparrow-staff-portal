import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { toBase64, fromBase64 } from './yjsCodec';

const CURSOR_COLORS = ['#e11d48', '#0891b2', '#7c3aed', '#ea580c', '#16a34a', '#2563eb', '#c026d3', '#65a30d'];

export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

const RESYNC_INTERVAL_MS = 15000;

/**
 * Syncs a Yjs document live across everyone with the shared notes panel open, over a
 * Supabase Realtime broadcast channel — no separate websocket server or paid sync
 * service needed. Two people typing at once merge automatically (Yjs is a CRDT: every
 * keystroke commutes, so there's no "last save wins" and nothing to silently overwrite).
 *
 * Broadcast messages can be dropped by a flaky connection without either side finding
 * out, so this doesn't rely on streaming diffs alone: on (re)connect, and every
 * RESYNC_INTERVAL_MS after, it asks any open peers for their full current state.
 * Applying a full state through Y.applyUpdate is idempotent/commutative like any other
 * Yjs update, so a periodic full resync can't cause duplication — it just self-heals
 * a connection that silently dropped a message.
 */
export class SupabaseYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  private channel: RealtimeChannel;
  private resyncTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;

  constructor(doc: Y.Doc, eventId: string, userId: string, userName: string) {
    this.doc = doc;
    this.awareness = new awarenessProtocol.Awareness(doc);
    this.awareness.setLocalState({ user: { id: userId, name: userName, color: colorForUser(userId) } });

    this.channel = supabase.channel(`shared-notes:${eventId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on('broadcast', { event: 'update' }, ({ payload }: { payload: { update: string } }) => {
        Y.applyUpdate(this.doc, fromBase64(payload.update), this);
      })
      .on('broadcast', { event: 'awareness' }, ({ payload }: { payload: { update: string } }) => {
        awarenessProtocol.applyAwarenessUpdate(this.awareness, fromBase64(payload.update), this);
      })
      .on('broadcast', { event: 'sync-request' }, () => {
        this.broadcastFullState();
      });

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === this) return; // came from a remote peer via applyUpdate above — don't echo it back
      if (!this.connected) return;
      void this.channel.send({ type: 'broadcast', event: 'update', payload: { update: toBase64(update) } });
    });

    this.awareness.on(
      'update',
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        if (origin === this) return;
        if (!this.connected) return;
        const changed = added.concat(updated, removed);
        const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed);
        void this.channel.send({ type: 'broadcast', event: 'awareness', payload: { update: toBase64(update) } });
      },
    );

    this.channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      this.connected = true;
      // Catch up on anything typed since the last DB snapshot was saved.
      void this.channel.send({ type: 'broadcast', event: 'sync-request', payload: {} });
      if (!this.resyncTimer) {
        this.resyncTimer = setInterval(() => {
          void this.channel.send({ type: 'broadcast', event: 'sync-request', payload: {} });
        }, RESYNC_INTERVAL_MS);
      }
    });
  }

  private broadcastFullState() {
    const update = toBase64(Y.encodeStateAsUpdate(this.doc));
    void this.channel.send({ type: 'broadcast', event: 'update', payload: { update } });
  }

  destroy() {
    if (this.resyncTimer) clearInterval(this.resyncTimer);
    this.awareness.setLocalState(null);
    void supabase.removeChannel(this.channel);
  }
}
