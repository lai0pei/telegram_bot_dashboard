"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { flowGraph, isCallbackMatch, pathTo, type FlowRule } from "@/lib/flow";

const NODE_W = 200;
const NODE_H = 84;
const COL_GAP = 90;
const ROW_GAP = 22;
const HEADER_H = 30;
const PAD = 16;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;

const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

/**
 * The whole conversation on one canvas: starting points on the left, every button press one column further right.
 * Zoom with the buttons or ctrl/⌘ + scroll; scroll to pan. Clicking a box opens it in the builder's columns.
 */
export function FlowMap<T extends FlowRule>({
  rules,
  selectedId,
  title,
  onPick,
}: {
  rules: readonly T[];
  selectedId?: number;
  /** The box title for a rule (what starts or reaches it). */
  title: (rule: T) => string;
  /** Called with the route of reply IDs from a starting point down to the clicked box. */
  onPick: (path: number[]) => void;
}) {
  const graph = flowGraph(rules);
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);

  // Positions: one column per depth, then a lane on the right for replies no button leads to.
  const pos = new Map<number, { x: number; y: number }>();
  const colX = (c: number) => PAD + c * (NODE_W + COL_GAP);
  graph.columns.forEach((ids, c) => ids.forEach((id, r) => pos.set(id, { x: colX(c), y: PAD + HEADER_H + r * (NODE_H + ROW_GAP) })));
  const unusedCol = graph.columns.length;
  graph.unused.forEach((rule, r) => pos.set(rule.id, { x: colX(unusedCol), y: PAD + HEADER_H + r * (NODE_H + ROW_GAP) }));
  const colCount = graph.columns.length + (graph.unused.length ? 1 : 0);
  const tallest = Math.max(1, ...graph.columns.map((c) => c.length), graph.unused.length);
  const width = colX(colCount) - COL_GAP + PAD;
  const height = PAD + HEADER_H + tallest * (NODE_H + ROW_GAP) + PAD;
  const unlinkedCount = (id: number) => graph.unlinked.filter((u) => u.from === id).length;
  const rulesById = new Map(rules.map((r) => [r.id, r]));

  // ctrl/⌘ + wheel (also a trackpad pinch) zooms the map instead of the page; a native listener because React's is passive.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clamp(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function fit() {
    const w = viewport.current?.clientWidth ?? width;
    setZoom(clamp(Math.min(1, (w - 8) / width)));
  }

  const headerFor = (c: number) => (c === 0 ? "Starts when…" : c === 1 ? "1 button press" : `${c} button presses`);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="icon" onClick={() => setZoom((z) => clamp(z / 1.2))} aria-label="Zoom out" disabled={zoom <= MIN_ZOOM}>
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-[var(--muted)]" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <Button type="button" variant="outline" size="icon" onClick={() => setZoom((z) => clamp(z * 1.2))} aria-label="Zoom in" disabled={zoom >= MAX_ZOOM}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={fit}>
          <Maximize2 className="h-3.5 w-3.5" />
          Fit
        </Button>
        <span className="ml-2 hidden text-xs text-[var(--muted)] sm:inline">Ctrl/⌘ + scroll to zoom · dashed lines go back</span>
      </div>
      <div ref={viewport} className="max-h-[70dvh] overflow-auto rounded-lg border border-[var(--card-border)] bg-[var(--background)]">
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div className="relative origin-top-left" style={{ width, height, transform: `scale(${zoom})` }}>
            <svg className="absolute inset-0" width={width} height={height} aria-hidden>
              <defs>
                <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0 L8 4 L0 8 z" fill="currentColor" />
                </marker>
              </defs>
              {graph.edges.map((e, i) => {
                const a = pos.get(e.from);
                const b = pos.get(e.to);
                if (!a || !b) return null;
                const x1 = a.x + NODE_W;
                const y1 = a.y + NODE_H / 2;
                const x2 = b.x;
                const y2 = b.y + NODE_H / 2;
                const bend = e.back ? 70 : Math.max(30, (x2 - x1) / 2);
                return (
                  <path
                    key={i}
                    d={`M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray={e.back ? "5 4" : undefined}
                    markerEnd="url(#flow-arrow)"
                    className={e.back ? "text-[var(--muted)] opacity-60" : "text-[var(--primary)]"}
                  >
                    <title>{`“${e.label}”`}</title>
                  </path>
                );
              })}
            </svg>
            {Array.from({ length: colCount }, (_, c) => (
              <p key={c} className="absolute text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]" style={{ left: colX(c), top: PAD, width: NODE_W }}>
                {c === unusedCol && graph.unused.length ? "Unused replies" : headerFor(c)}
              </p>
            ))}
            {[...pos.entries()].map(([id, p]) => {
              const rule = rulesById.get(id);
              if (!rule) return null;
              const dead = unlinkedCount(id);
              const active = id === selectedId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPick(graph.parent.has(id) ? pathTo(graph, id) : [id])}
                  aria-label={`${title(rule)}: ${rule.replyText.split("\n")[0]}`}
                  className={`absolute flex flex-col gap-0.5 overflow-hidden rounded-xl border bg-[var(--card)] p-2.5 text-left shadow-sm transition-shadow hover:shadow-md ${
                    active ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/30" : "border-[var(--card-border)]"
                  } ${rule.enabled ? "" : "opacity-60"}`}
                  style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                >
                  <span className="truncate text-[11px] font-semibold text-[var(--primary)]">{title(rule)}</span>
                  <span className="line-clamp-2 text-xs">{rule.replyText}</span>
                  <span className="mt-auto flex gap-2 text-[10px] text-[var(--muted)]">
                    {isCallbackMatch(rule) && rule.callbackAction === "toast" ? <span>pop-up</span> : null}
                    {!rule.enabled && <span>switched off</span>}
                    {dead > 0 && <span className="text-amber-600">{dead} button{dead === 1 ? "" : "s"} go nowhere</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
