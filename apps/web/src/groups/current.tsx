import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useGroups } from '../api/queries';
import type { GroupSummary } from '../api/types';
import { readPref, writePref } from '../lib/storage';

const KEY = 'iamin-group';

interface CurrentGroup {
  groups: GroupSummary[];
  /** Le groupe affiché : le dernier choisi s'il existe encore, sinon le premier. */
  current: GroupSummary | undefined;
  select: (groupId: string) => void;
  loading: boolean;
  error: Error | null;
}

const Ctx = createContext<CurrentGroup | null>(null);

export function GroupProvider({ children }: { children: ReactNode }) {
  const query = useGroups();
  const [saved, setSaved] = useState<string | null>(() => readPref(KEY));
  const select = useCallback((id: string) => {
    writePref(KEY, id);
    setSaved(id);
  }, []);
  const value = useMemo<CurrentGroup>(() => {
    const groups = query.data ?? [];
    return {
      groups,
      current: groups.find((g) => g.id === saved) ?? groups[0],
      select,
      loading: query.isPending,
      error: query.error,
    };
  }, [query.data, query.isPending, query.error, saved, select]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentGroup(): CurrentGroup {
  const value = useContext(Ctx);
  if (!value) throw new Error('useCurrentGroup doit être utilisé dans <GroupProvider>');
  return value;
}
