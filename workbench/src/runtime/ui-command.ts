export interface UiCommand<
  TName extends string = string,
  TPayload = undefined,
> {
  readonly name: TName;
  readonly featureId?: string;
  readonly payload: TPayload;
}

export type AnyUiCommand = UiCommand<string, unknown>;

export type CommandHandler<TCommand extends AnyUiCommand = AnyUiCommand> = (
  command: TCommand,
) => void | Promise<void>;

export type CommandDispatcher = (command: AnyUiCommand) => Promise<void>;

export class CommandBus {
  readonly #handlers = new Map<string, Set<CommandHandler>>();
  #disposed = false;

  subscribe<TCommand extends AnyUiCommand>(
    name: TCommand["name"] | "*",
    handler: CommandHandler<TCommand>,
  ): () => void {
    this.assertActive();
    const handlers = this.#handlers.get(name) ?? new Set<CommandHandler>();
    const genericHandler = handler as CommandHandler;
    handlers.add(genericHandler);
    this.#handlers.set(name, handlers);
    return () => {
      handlers.delete(genericHandler);
      if (handlers.size === 0) this.#handlers.delete(name);
    };
  }

  async dispatch(command: AnyUiCommand): Promise<void> {
    this.assertActive();
    const handlers = [
      ...(this.#handlers.get(command.name) ?? []),
      ...(this.#handlers.get("*") ?? []),
    ];
    for (const handler of handlers) await handler(command);
  }

  listenerCount(name?: string): number {
    if (name) return this.#handlers.get(name)?.size ?? 0;
    let count = 0;
    for (const handlers of this.#handlers.values()) count += handlers.size;
    return count;
  }

  dispose(): void {
    this.#handlers.clear();
    this.#disposed = true;
  }

  private assertActive(): void {
    if (this.#disposed) throw new Error("CommandBus has been disposed");
  }
}
