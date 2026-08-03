import { describe, expect, it } from 'vitest';
import {
  MemoryStoryRecoveryStore,
  LocalStorageStoryRecoveryStore,
  StoryEditorTransactionManager,
  type StoryRecoveryStore,
  StorySerializedCommandQueue,
} from './story-editor-state';

const createManager = (
  recovery: StoryRecoveryStore<{ value: number }> = new MemoryStoryRecoveryStore<{ value: number }>(),
) =>
  new StoryEditorTransactionManager({
    storyId: 'story-1',
    sessionId: 'session-1',
    revision: 4,
    document: { value: 1 },
    recovery,
  });

describe('StoryEditorTransactionManager', () => {
  it('is safe when browser storage is unavailable during SSR', async () => {
    const recovery = new LocalStorageStoryRecoveryStore<{ value: number }>(null);
    await expect(recovery.load('story-1')).resolves.toBeUndefined();
    await expect(
      recovery.save({ storyId: 'story-1', revision: 1, document: { value: 1 }, unsentBatches: [] }),
    ).resolves.toBeUndefined();
    await expect(recovery.clear('story-1')).resolves.toBeUndefined();
  });

  it('persists pending batches across manager instances and clears them after acknowledgement', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const recovery = new LocalStorageStoryRecoveryStore<{ value: number }>(storage);
    const first = createManager(recovery);
    first.begin('text', 'before');
    const batch = await first.commit([{ op: 'text.set' }], []);

    const restored = createManager(recovery);
    expect(await restored.restore()).toBe('ready');
    expect(restored.pendingBatches).toEqual([batch]);
    await first.acknowledge(batch!.clientMutationId, 5, { value: 2 });
    expect(await recovery.load('story-1')).toBeUndefined();
  });

  it('synchronizes an idle manager after an external mutation', async () => {
    const manager = createManager();
    await manager.synchronize(8, { value: 8 });
    manager.begin('text', 'after external mutation');
    const batch = await manager.commit([{ op: 'text.set' }], []);
    expect(batch?.baseRevision).toBe(8);
  });

  it('refuses external synchronization while local changes are pending', async () => {
    const manager = createManager();
    manager.begin('text', 'pending');
    await manager.commit([{ op: 'text.set' }], []);
    await expect(manager.synchronize(8, { value: 8 })).rejects.toThrow('pending');
  });
  it('keeps gesture updates ephemeral and commits one batch', async () => {
    const manager = createManager();
    manager.begin('move', { x: 0, y: 0 });
    manager.update({ x: 10, y: 20 });
    manager.update({ x: 30, y: 40 });
    expect(manager.pendingBatches).toHaveLength(0);

    const batch = await manager.commit(
      [{ op: 'element.patch', frame: { x: 30, y: 40 } }],
      [{ op: 'element.patch', frame: { x: 0, y: 0 } }],
    );
    expect(batch?.commands).toHaveLength(1);
    expect(manager.pendingBatches).toHaveLength(1);
    expect(batch?.clientSequence).toBe(1);
  });

  it('cancels to the initial preview without a batch', () => {
    const manager = createManager();
    manager.begin('resize', { width: 10 });
    manager.update({ width: 50 });
    expect(manager.cancel()).toEqual({ width: 10 });
    expect(manager.pendingBatches).toHaveLength(0);
  });

  it('creates inverse and redo batches with monotonic sequence numbers', async () => {
    const manager = createManager();
    manager.begin('text', 'before');
    const original = await manager.commit([{ op: 'text.set', text: 'after' }], [{ op: 'text.set', text: 'before' }]);
    const undo = await manager.undo();
    const redo = await manager.redo();
    expect([original?.clientSequence, undo?.clientSequence, redo?.clientSequence]).toEqual([1, 2, 3]);
    expect(undo?.commands[0]).toMatchObject({ text: 'before' });
    expect(redo?.commands[0]).toMatchObject({ text: 'after' });
  });

  it('reports stale recovery rather than guessing a rebase', async () => {
    const recovery = new MemoryStoryRecoveryStore<{ value: number }>();
    await recovery.save({ storyId: 'story-1', revision: 3, document: { value: 0 }, unsentBatches: [] });
    expect(await createManager(recovery).restore()).toBe('stale');
  });

  it('serializes batches so rapid edits use acknowledged revisions', async () => {
    const manager = createManager();
    const queue = new StorySerializedCommandQueue(manager);
    const revisions: number[] = [];
    const send = async (batch: { baseRevision: number; clientMutationId: string }) => {
      revisions.push(batch.baseRevision);
      await manager.acknowledge(batch.clientMutationId, batch.baseRevision + 1, { value: batch.baseRevision + 1 });
    };
    const first = queue.enqueue({
      kind: 'text',
      preview: 'a',
      commands: [{ op: 'element.setText', text: 'a' }],
      inverseCommands: [],
      send,
    });
    const second = queue.enqueue({
      kind: 'text',
      preview: 'b',
      commands: [{ op: 'element.setText', text: 'b' }],
      inverseCommands: [],
      send,
    });
    await Promise.all([first, second]);
    expect(revisions).toEqual([4, 5]);
  });

  it('stops later batches after a stale failure and keeps the failed batch recoverable', async () => {
    const manager = createManager();
    const queue = new StorySerializedCommandQueue(manager);
    let sent = 0;
    const send = async () => {
      sent++;
      throw new Error('STALE_REVISION');
    };
    const first = queue.enqueue({
      kind: 'text',
      preview: 'a',
      commands: [{ op: 'element.setText' }],
      inverseCommands: [],
      send,
    });
    const second = queue.enqueue({
      kind: 'text',
      preview: 'b',
      commands: [{ op: 'element.setText' }],
      inverseCommands: [],
      send,
    });
    await expect(first).rejects.toThrow('STALE_REVISION');
    await expect(second).rejects.toThrow('STALE_REVISION');
    expect(sent).toBe(1);
    expect(manager.pendingBatches).toHaveLength(1);
    expect(queue.hasFailedBatch).toBe(true);
  });

  it('retries the exact failed mutation before accepting later work', async () => {
    const manager = createManager();
    const queue = new StorySerializedCommandQueue(manager);
    const mutationIds: string[] = [];
    let fail = true;
    const send = async (batch: { baseRevision: number; clientMutationId: string }) => {
      mutationIds.push(batch.clientMutationId);
      if (fail) throw new Error('offline');
      await manager.acknowledge(batch.clientMutationId, batch.baseRevision + 1, { value: 2 });
    };
    const first = queue.enqueue({
      kind: 'text',
      preview: 'a',
      commands: [{ op: 'element.setText' }],
      inverseCommands: [],
      send,
    });
    await expect(first).rejects.toThrow('offline');
    fail = false;
    await queue.retryFailed();

    expect(mutationIds).toHaveLength(2);
    expect(new Set(mutationIds).size).toBe(1);
    expect(queue.hasFailedBatch).toBe(false);
    expect(manager.pendingBatches).toHaveLength(0);
  });

  it('deduplicates concurrent retry requests', async () => {
    const manager = createManager();
    const queue = new StorySerializedCommandQueue(manager);
    let attempts = 0;
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolve) => (releaseRetry = resolve));
    const send = async (batch: { baseRevision: number; clientMutationId: string }) => {
      attempts++;
      if (attempts === 1) throw new Error('offline');
      await retryGate;
      await manager.acknowledge(batch.clientMutationId, batch.baseRevision + 1, { value: 2 });
    };
    await expect(
      queue.enqueue({
        kind: 'text',
        preview: 'a',
        commands: [{ op: 'element.setText' }],
        inverseCommands: [],
        send,
      }),
    ).rejects.toThrow('offline');

    const firstRetry = queue.retryFailed();
    const secondRetry = queue.retryFailed();
    expect(attempts).toBe(2);
    releaseRetry();
    await Promise.all([firstRetry, secondRetry]);
    expect(attempts).toBe(2);
  });

  it('serializes an active gesture commit with subsequent controls', async () => {
    const manager = createManager();
    const queue = new StorySerializedCommandQueue(manager);
    const revisions: number[] = [];
    const send = async (batch: { baseRevision: number; clientMutationId: string }) => {
      revisions.push(batch.baseRevision);
      await manager.acknowledge(batch.clientMutationId, batch.baseRevision + 1, { value: batch.baseRevision + 1 });
    };
    manager.begin('move', { x: 0, y: 0 });
    const gesture = queue.commitActive({
      commands: [{ op: 'element.patchGeometry' }],
      inverseCommands: [],
      send,
    });
    const control = queue.enqueue({
      kind: 'text',
      preview: 'after gesture',
      commands: [{ op: 'element.setText' }],
      inverseCommands: [],
      send,
    });
    await Promise.all([gesture, control]);

    expect(revisions).toEqual([4, 5]);
  });

  it('sends undo and redo batches through the serialized queue', async () => {
    const manager = createManager();
    const queue = new StorySerializedCommandQueue(manager);
    const operations: string[] = [];
    const send = async (batch: { commands: Array<{ op: string }>; clientMutationId: string; baseRevision: number }) => {
      operations.push(batch.commands[0].op);
      await manager.acknowledge(batch.clientMutationId, batch.baseRevision + 1, { value: operations.length });
    };
    await queue.enqueue({
      kind: 'text',
      preview: 'changed',
      commands: [{ op: 'text.after' }],
      inverseCommands: [{ op: 'text.before' }],
      send,
    });
    await queue.sendCommitted(await manager.undo(), send);
    await queue.sendCommitted(await manager.redo(), send);
    expect(operations).toEqual(['text.after', 'text.before', 'text.after']);
  });
});
