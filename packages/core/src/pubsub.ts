import { EventEmitter } from 'node:events';

export interface PubSub {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, callback: (message: string) => void): Promise<() => void>;
}

export class MemoryPubSub implements PubSub {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  async publish(channel: string, message: string): Promise<void> {
    this.emitter.emit(channel, message);
  }

  async subscribe(channel: string, callback: (message: string) => void): Promise<() => void> {
    this.emitter.on(channel, callback);
    return () => {
      this.emitter.off(channel, callback);
    };
  }
}

export const globalPubSub = new MemoryPubSub();
