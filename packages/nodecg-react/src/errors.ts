/** A readable message for a rejected Message ack or other failure. */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
