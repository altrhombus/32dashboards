/// <reference types="nodecg/types/augment-window" />
import { useEffect, useState } from "react";

/**
 * Subscribes a component to a NodeCG Replicant. Pass `namespace` to read a
 * Replicant owned by another bundle (e.g. a layout bundle reading core state).
 *
 * Returns undefined until the first value arrives. Values are copied out of
 * NodeCG's change-tracking proxy so React sees a new object on every change.
 */
export function useReplicant<T>(name: string, namespace?: string): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    const replicant = namespace ? nodecg.Replicant<T>(name, namespace) : nodecg.Replicant<T>(name);
    const handleChange = (newValue: T | undefined) => {
      setValue(newValue === undefined ? undefined : (JSON.parse(JSON.stringify(newValue)) as T));
    };
    replicant.on("change", handleChange);
    return () => {
      replicant.removeListener("change", handleChange);
    };
  }, [name, namespace]);

  return value;
}
