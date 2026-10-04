import { useCallback, useEffect, useState } from "react";
import { fetchKindCounts, HubSchemaMissingError } from "./hub";

/**
 * The one piece of hub data the shell itself needs: how many game links there
 * are, for the badge on the menu tile. Lists fetch their own rows.
 */
export function useHub() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  /** True when 02_hub.sql has not been run yet, so the UI can say so plainly. */
  const [schemaMissing, setSchemaMissing] = useState(false);

  const loadCounts = useCallback(async () => {
    try {
      setCounts(await fetchKindCounts());
      setSchemaMissing(false);
    } catch (e) {
      // Anything else is left alone: the badge is decorative, and a failure
      // here should not surface.
      if (e instanceof HubSchemaMissingError) setSchemaMissing(true);
    }
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  return { counts, schemaMissing, refreshCounts: loadCounts };
}
