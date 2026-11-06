/** Puts something back. Resolves once the laptop has done it, or rejects with why it couldn't. */
export type Undo = () => Promise<unknown>;

/** Does something on the laptop, says what it did, and offers its Undo. */
export type Act = (promise: Promise<unknown>, done: string, undo?: Undo, tag?: string) => void;
