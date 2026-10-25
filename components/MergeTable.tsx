"use client";

import { useEffect, useRef, useState } from "react";

export type Col = { id: string; name: string };
export type Rows = Array<Record<string, string>>; // keyed by column id

let counter = 0;
const newId = () => `c${Date.now().toString(36)}_${counter++}`;

export const makeCol = (name: string): Col => ({ id: newId(), name });

export function defaultColumns(): Col[] {
  return [
    { id: newId(), name: "First Name" },
    { id: newId(), name: "Last Name" },
    { id: newId(), name: "Email" },
  ];
}
export function emptyRow(cols: Col[]): Record<string, string> {
  const r: Record<string, string> = {};
  cols.forEach((c) => (r[c.id] = ""));
  return r;
}

export default function MergeTable({
  columns,
  rows,
  onChange,
}: {
  columns: Col[];
  rows: Rows;
  onChange: (columns: Col[], rows: Rows) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; row: number; col: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => { setMenu(null); setShowAdd(false); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  function setCell(rowIdx: number, colId: string, value: string) {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [colId]: value } : r));
    onChange(columns, next);
  }
  function renameCol(colId: string, name: string) {
    onChange(columns.map((c) => (c.id === colId ? { ...c, name } : c)), rows);
  }
  function addColumn() {
    const col = { id: newId(), name: "" };
    onChange([...columns, col], rows.map((r) => ({ ...r, [col.id]: "" })));
  }
  function deleteColumn(colId: string) {
    if (columns.length <= 1) return;
    const nextCols = columns.filter((c) => c.id !== colId);
    const nextRows = rows.map((r) => {
      const { [colId]: _drop, ...rest } = r;
      void _drop;
      return rest;
    });
    onChange(nextCols, nextRows);
  }
  function addRows(n: number) {
    const add = Array.from({ length: n }, () => emptyRow(columns));
    onChange(columns, [...rows, ...add]);
    setShowAdd(false);
  }
  function deleteRow(rowIdx: number) {
    if (rows.length <= 1) { onChange(columns, [emptyRow(columns)]); return; }
    onChange(columns, rows.filter((_, i) => i !== rowIdx));
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="overflow-x-auto rounded-xl border border-ink/15" tabIndex={0} role="region" aria-label="Mail-merge table">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-ink/[0.04]">
              {columns.map((c) => (
                <th key={c.id} className="border-b border-r border-ink/10 p-0 last:border-r-0">
                  <input
                    value={c.name}
                    onChange={(e) => renameCol(c.id, e.target.value)}
                    placeholder="Column name"
                    className="w-full min-w-[8rem] bg-transparent px-2.5 py-2 text-xs font-semibold text-pine-deep placeholder:font-normal placeholder:text-ink/35 focus:outline-none"
                  />
                </th>
              ))}
              <th className="w-9 border-b border-ink/10 bg-ink/[0.02] p-0">
                <button onClick={addColumn} title="Add column" className="grid h-full w-full place-items-center py-2 text-ink/65 hover:bg-pine/5 hover:text-pine">
                  +
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {columns.map((c) => (
                  <td
                    key={c.id}
                    onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, row: ri, col: c.id }); }}
                    className="border-b border-r border-ink/8 p-0 last:border-r-0"
                  >
                    <input
                      value={r[c.id] ?? ""}
                      onChange={(e) => setCell(ri, c.id, e.target.value)}
                      className="w-full min-w-[8rem] bg-transparent px-2.5 py-2 text-ink focus:bg-pine/[0.03] focus:outline-none"
                    />
                  </td>
                ))}
                <td className="border-b border-ink/8 bg-ink/[0.02]" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add rows */}
      <div className="relative mt-2 inline-block">
        <button
          onClick={(e) => { e.stopPropagation(); setShowAdd((s) => !s); }}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5"
        >
          <span className="text-base leading-none">+</span> Add rows
        </button>
        {showAdd && (
          <div className="absolute left-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-lg border border-ink/15 bg-paper shadow-lg" onClick={(e) => e.stopPropagation()}>
            {[1, 3, 5].map((n) => (
              <button key={n} onClick={() => addRows(n)} className="block w-full px-3 py-2 text-left text-xs text-ink hover:bg-pine/5">
                {n} row{n > 1 ? "s" : ""}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink/65">Right-click a cell to delete its row or column.</p>

      {/* Right-click menu */}
      {menu && (
        <div
          style={{ position: "fixed", left: menu.x, top: menu.y }}
          className="z-50 w-40 overflow-hidden rounded-lg border border-ink/15 bg-paper shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => { deleteRow(menu.row); setMenu(null); }} className="block w-full px-3 py-2 text-left text-xs text-ink hover:bg-pine/5">
            Delete row
          </button>
          <button onClick={() => { deleteColumn(menu.col); setMenu(null); }} className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-40" disabled={columns.length <= 1}>
            Delete column
          </button>
        </div>
      )}
    </div>
  );
}
