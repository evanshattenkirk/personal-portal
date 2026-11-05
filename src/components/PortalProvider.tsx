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
import { decideProposal, saveRecord } from "@/app/actions";
import { validateRecord } from "@/lib/records";
import { parseChanges, resolveChange } from "@/lib/proposals";
type Context = PortalData & {
  ready: boolean;
  save: <K extends EntityName>(
    entity: K,
    record: EntityMap[K],
  ) => Promise<void>;
  decide: (
    id: string,
    decision: "accepted" | "rejected",
    feedback?: string,
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
            // Older demo saves predate notes and briefs; fill gaps from the fixtures.
            const merged = { ...initialData, ...saved };
            current.current = merged;
            setData(merged);
          }
        }
      } catch {
        /* Demo storage is optional until a save. */
      }
    }
    setReady(true);
  }, [initialData]);
  function commit(updates: { entity: EntityName; record: { id: string } }[]) {
    let next = current.current;
    for (const { entity, record } of updates) {
      const rows = next[entity] as { id: string }[];
      next = {
        ...next,
        [entity]: rows.some((r) => r.id === record.id)
          ? rows.map((r) => (r.id === record.id ? record : r))
          : [...rows, record],
      };
    }
    if (next.demo) {
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
  async function decide(
    id: string,
    decision: "accepted" | "rejected",
    feedback = "",
  ) {
    if (!data.demo) {
      const res = await decideProposal(id, decision, feedback);
      if (res.error || !res.proposal)
        throw new Error(res.error ?? "Could not save.");
      commit([
        ...(res.saved as { entity: EntityName; record: { id: string } }[]),
        { entity: "proposals", record: res.proposal },
      ]);
      return;
    }
    const proposal = current.current.proposals.find((x) => x.id === id);
    if (!proposal || proposal.status !== "pending")
      throw new Error("This proposal was already decided.");
    const updates: { entity: EntityName; record: { id: string } }[] = [];
    if (decision === "accepted")
      for (const change of parseChanges(proposal.changes)) {
        const rows = current.current[change.entity] as unknown as Record<
          string,
          unknown
        >[];
        const existing =
          change.op === "update"
            ? (rows.find((r) => r.id === change.id) ?? null)
            : null;
        updates.push({
          entity: change.entity,
          record: resolveChange(change, existing, {
            tripSlug: proposal.tripSlug,
            id: crypto.randomUUID(),
          }) as { id: string },
        });
      }
    if (feedback.trim() && proposal.tripSlug)
      updates.push({
        entity: "notes",
        record: {
          id: crypto.randomUUID(),
          tripSlug: proposal.tripSlug,
          body: `About "${proposal.title}": ${feedback.trim()}`,
          kind: "ask_ai",
          status: "open",
          aiReply: null,
          createdAt: new Date().toISOString(),
        } as { id: string },
      });
    updates.push({
      entity: "proposals",
      record: {
        ...proposal,
        status: decision,
        decidedAt: new Date().toISOString(),
        feedback: feedback.trim() || null,
      } as { id: string },
    });
    commit(updates);
  }
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
    <PortalContext.Provider value={{ ...data, ready, save, decide }}>
      {children}
    </PortalContext.Provider>
  );
}
export function usePortal() {
  const context = useContext(PortalContext);
  if (!context) throw new Error("PortalProvider missing");
  return context;
}
