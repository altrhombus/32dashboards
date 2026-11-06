/** Copies a value out of NodeCG's change-tracking proxy. */
export const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
