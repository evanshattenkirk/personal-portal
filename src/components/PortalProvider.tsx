"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { EntityMap, EntityName, PortalData } from "@/lib/types";
import { saveRecord } from "@/app/actions";
import { validateRecord } from "@/lib/records";
type Context = PortalData & {
  ready: boolean;
  save: <K extends EntityName>(
    entity: K,
    record: EntityMap[K],
  ) => Promise<void>;
};
const PortalContext = createContext<Context | null>(null);
const KEY = "fieldbook-fictional-demo-v3";
export default function PortalProvider({
  initialData,
  children,
}: {
  initialData: PortalData;
  children: ReactNode;
}) {
  const [data, setData] = useState(initialData);
  const [ready, setReady] = useState(!initialData.demo);
  const current = useRef(initialData);
  useEffect(() => {
    if (initialData.demo) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved.demo && saved.trips && saved.tasks && saved.scenarios) {
            current.current = saved;
            setData(saved);
          }
        }
      } catch {
        /* Demo storage is optional until a save. */
      }
    }
    setReady(true);
  }, [initialData]);
  async function save<K extends EntityName>(entity: K, record: EntityMap[K]) {
    validateRecord(entity, record);
    let stored = record;
    if (!data.demo) {
      const response = await saveRecord(entity, record);
      if (response.error || !response.record)
        throw new Error(response.error ?? "Could not save.");
      stored = response.record as EntityMap[K];
    }
    const previous = current.current;
    const rows = previous[entity] as EntityMap[K][];
    const next = {
      ...previous,
      [entity]: rows.some((r) => r.id === record.id)
        ? rows.map((r) => (r.id === record.id ? stored : r))
        : [...rows, stored],
    };
    if (data.demo) {
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        throw new Error(
          "Browser storage is unavailable. This demo change could not be saved.",
        );
      }
    }
    current.current = next;
    setData(next);
  }
  return (
    <PortalContext.Provider value={{ ...data, ready, save }}>
      {children}
    </PortalContext.Provider>
  );
}
export function usePortal() {
  const context = useContext(PortalContext);
  if (!context) throw new Error("PortalProvider missing");
  return context;
}
