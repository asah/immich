export type StoryCommand = {
  op: string;
  [key: string]: unknown;
};

export type StoryCommandBatch = {
  baseRevision: number;
  clientSessionId: string;
  clientSequence: number;
  clientMutationId: string;
  commands: StoryCommand[];
};

export type StoryHistoryEntry = {
  batch: StoryCommandBatch;
  inverseCommands: StoryCommand[];
  acknowledged: boolean;
};

export type StoryRecoveryRecord<TDocument> = {
  storyId: string;
  revision: number;
  document: TDocument;
  unsentBatches: StoryCommandBatch[];
};

export interface StoryRecoveryStore<TDocument> {
  load(storyId: string): Promise<StoryRecoveryRecord<TDocument> | undefined>;
  save(record: StoryRecoveryRecord<TDocument>): Promise<void>;
  clear(storyId: string): Promise<void>;
}

type EphemeralTransaction<TPreview> = {
  kind: string;
  initial: TPreview;
  preview: TPreview;
};

export class StoryEditorTransactionManager<TDocument, TPreview = unknown> {
  readonly #storyId: string;
  readonly #sessionId: string;
  readonly #recovery: StoryRecoveryStore<TDocument>;
  #revision: number;
  #sequence = 0;
  #document: TDocument;
  #transaction?: EphemeralTransaction<TPreview>;
  #history: StoryHistoryEntry[] = [];
  #redo: StoryHistoryEntry[] = [];

  constructor(options: {
    storyId: string;
    sessionId: string;
    revision: number;
    document: TDocument;
    recovery: StoryRecoveryStore<TDocument>;
  }) {
    this.#storyId = options.storyId;
    this.#sessionId = options.sessionId;
    this.#revision = options.revision;
    this.#document = options.document;
    this.#recovery = options.recovery;
  }

  get preview(): TPreview | undefined {
    return this.#transaction?.preview;
  }

  get hasActiveTransaction() {
    return !!this.#transaction;
  }

  get pendingBatches() {
    return this.#history.filter(({ acknowledged }) => !acknowledged).map(({ batch }) => batch);
  }

  begin(kind: string, initial: TPreview) {
    if (this.#transaction) {
      throw new Error('An editor transaction is already active');
    }
    this.#transaction = { kind, initial: structuredClone(initial), preview: structuredClone(initial) };
  }

  update(preview: TPreview) {
    if (!this.#transaction) {
      throw new Error('No active editor transaction');
    }
    this.#transaction.preview = structuredClone(preview);
  }

  cancel(): TPreview | undefined {
    const initial = this.#transaction?.initial;
    this.#transaction = undefined;
    return initial;
  }

  async commit(commands: StoryCommand[], inverseCommands: StoryCommand[]) {
    if (!this.#transaction) {
      throw new Error('No active editor transaction');
    }
    this.#transaction = undefined;
    if (commands.length === 0) {
      return undefined;
    }
    const batch: StoryCommandBatch = {
      baseRevision: this.#revision,
      clientSessionId: this.#sessionId,
      clientSequence: ++this.#sequence,
      clientMutationId: crypto.randomUUID(),
      commands: structuredClone(commands),
    };
    this.#history.push({ batch, inverseCommands: structuredClone(inverseCommands), acknowledged: false });
    this.#redo = [];
    await this.#persist();
    return batch;
  }

  async acknowledge(clientMutationId: string, revision: number, canonicalDocument: TDocument) {
    const entry = this.#history.find(({ batch }) => batch.clientMutationId === clientMutationId);
    if (!entry) {
      throw new Error('Unknown mutation acknowledgement');
    }
    entry.acknowledged = true;
    this.#revision = revision;
    this.#document = structuredClone(canonicalDocument);
    if (this.pendingBatches.length === 0) await this.#recovery.clear(this.#storyId);
    else await this.#persist();
  }

  async synchronize(revision: number, canonicalDocument: TDocument) {
    if (this.#transaction || this.pendingBatches.length > 0) {
      throw new Error('Cannot synchronize while editor changes are pending');
    }
    this.#revision = revision;
    this.#document = structuredClone(canonicalDocument);
    await this.#recovery.clear(this.#storyId);
  }

  async undo() {
    if (this.#transaction) {
      this.cancel();
      return undefined;
    }
    const original = this.#history.pop();
    if (!original) {
      return undefined;
    }
    this.#redo.push(original);
    const batch: StoryCommandBatch = {
      baseRevision: this.#revision,
      clientSessionId: this.#sessionId,
      clientSequence: ++this.#sequence,
      clientMutationId: crypto.randomUUID(),
      commands: structuredClone(original.inverseCommands),
    };
    this.#history.push({ batch, inverseCommands: structuredClone(original.batch.commands), acknowledged: false });
    await this.#persist();
    return batch;
  }

  async redo() {
    if (this.#transaction) {
      this.cancel();
      return undefined;
    }
    const original = this.#redo.pop();
    if (!original) {
      return undefined;
    }
    const batch: StoryCommandBatch = {
      baseRevision: this.#revision,
      clientSessionId: this.#sessionId,
      clientSequence: ++this.#sequence,
      clientMutationId: crypto.randomUUID(),
      commands: structuredClone(original.batch.commands),
    };
    this.#history.push({ batch, inverseCommands: structuredClone(original.inverseCommands), acknowledged: false });
    await this.#persist();
    return batch;
  }

  async restore(): Promise<'none' | 'ready' | 'stale'> {
    const record = await this.#recovery.load(this.#storyId);
    if (!record) {
      return 'none';
    }
    if (record.revision !== this.#revision) {
      return 'stale';
    }
    this.#document = structuredClone(record.document);
    this.#history = record.unsentBatches.map((batch) => ({ batch, inverseCommands: [], acknowledged: false }));
    this.#sequence = Math.max(this.#sequence, ...record.unsentBatches.map(({ clientSequence }) => clientSequence), 0);
    return 'ready';
  }

  async discardRecovery() {
    await this.#recovery.clear(this.#storyId);
  }

  async #persist() {
    await this.#recovery.save({
      storyId: this.#storyId,
      revision: this.#revision,
      document: structuredClone(this.#document),
      unsentBatches: structuredClone(this.pendingBatches),
    });
  }
}

export class MemoryStoryRecoveryStore<TDocument> implements StoryRecoveryStore<TDocument> {
  readonly #records = new Map<string, StoryRecoveryRecord<TDocument>>();

  async load(storyId: string) {
    const record = this.#records.get(storyId);
    return record ? structuredClone(record) : undefined;
  }

  async save(record: StoryRecoveryRecord<TDocument>) {
    this.#records.set(record.storyId, structuredClone(record));
  }

  async clear(storyId: string) {
    this.#records.delete(storyId);
  }
}

export class LocalStorageStoryRecoveryStore<TDocument> implements StoryRecoveryStore<TDocument> {
  private storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

  constructor(
    storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined = undefined,
    private prefix = 'immich-story-recovery:',
  ) {
    this.storage =
      storage === undefined ? (typeof localStorage === 'undefined' ? undefined : localStorage) : (storage ?? undefined);
  }

  async load(storyId: string) {
    const serialized = this.storage?.getItem(this.#key(storyId));
    if (!serialized) return undefined;
    try {
      const record = JSON.parse(serialized) as StoryRecoveryRecord<TDocument>;
      if (record.storyId !== storyId || !Array.isArray(record.unsentBatches)) throw new TypeError('Invalid recovery');
      return record;
    } catch {
      this.storage?.removeItem(this.#key(storyId));
      return undefined;
    }
  }

  async save(record: StoryRecoveryRecord<TDocument>) {
    this.storage?.setItem(this.#key(record.storyId), JSON.stringify(record));
  }

  async clear(storyId: string) {
    this.storage?.removeItem(this.#key(storyId));
  }

  #key(storyId: string) {
    return `${this.prefix}${storyId}`;
  }
}

/** Serializes command construction and sending so each batch observes the prior acknowledgement revision. */
export class StorySerializedCommandQueue<TDocument, TPreview> {
  #tail: Promise<void> = Promise.resolve();
  #failed?: { batch: StoryCommandBatch; send: (batch: StoryCommandBatch) => Promise<void> };
  #retrying?: Promise<void>;
  constructor(private manager: StoryEditorTransactionManager<TDocument, TPreview>) {}

  enqueue(options: {
    kind: string;
    preview: TPreview;
    commands: StoryCommand[];
    inverseCommands: StoryCommand[];
    send: (batch: StoryCommandBatch) => Promise<void>;
  }) {
    return this.#append(async () => {
      this.manager.begin(options.kind, options.preview);
      const batch = await this.manager.commit(options.commands, options.inverseCommands);
      if (batch) await this.#send(batch, options.send);
    });
  }

  /** Commits a gesture transaction that was begun before pointer previews started. */
  commitActive(options: {
    commands: StoryCommand[];
    inverseCommands: StoryCommand[];
    send: (batch: StoryCommandBatch) => Promise<void>;
  }) {
    return this.#append(async () => {
      const batch = await this.manager.commit(options.commands, options.inverseCommands);
      if (batch) await this.#send(batch, options.send);
    });
  }

  get hasFailedBatch() {
    return !!this.#failed;
  }

  /** Retries the exact persisted mutation so server idempotency remains effective. */
  async retryFailed() {
    if (this.#retrying) return this.#retrying;
    const failed = this.#failed;
    if (!failed) return;
    const retry = this.#send(failed.batch, failed.send).finally(() => {
      this.#retrying = undefined;
    });
    this.#retrying = retry;
    this.#tail = retry;
    return retry;
  }

  settled() {
    return this.#tail;
  }

  sendCommitted(batch: StoryCommandBatch | undefined, send: (batch: StoryCommandBatch) => Promise<void>) {
    if (!batch) return Promise.resolve();
    return this.#append(() => this.#send(batch, send));
  }

  #append(work: () => Promise<void>) {
    const result = this.#tail.then(work);
    this.#tail = result;
    return result;
  }

  async #send(batch: StoryCommandBatch, send: (batch: StoryCommandBatch) => Promise<void>) {
    try {
      await send(batch);
      if (this.#failed?.batch.clientMutationId === batch.clientMutationId) {
        this.#failed = undefined;
      }
    } catch (error) {
      this.#failed = { batch, send };
      throw error;
    }
  }
}
