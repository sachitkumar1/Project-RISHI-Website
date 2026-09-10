"use client";

import { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent, BubbleMenu, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Color } from "@tiptap/extension-color";
import TextStyle from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";

// FontSize as a textStyle attribute (no extra dependency).
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: { fontSize?: string | null }) =>
            attrs.fontSize ? { style: `font-size:${attrs.fontSize}` } : {},
        },
      },
    }];
  },
});
const setFontSize = (editor: Editor, size: string) =>
  editor.chain().focus().setMark("textStyle", { fontSize: size }).run();
const unsetFontSize = (editor: Editor) =>
  editor.chain().focus().setMark("textStyle", { fontSize: null }).run();

const FONTS: [string, string][] = [
  ["", "Default"], ["Inter, sans-serif", "Sans serif"], ["Georgia, serif", "Serif"],
  ["'Courier New', monospace", "Monospace"], ["'Fraunces', serif", "Display"],
];
const SIZES = ["8", "9", "10", "11", "12", "14", "18", "24", "30", "36", "48", "60", "72", "96"];
const COLORS = ["#141b12", "#1f6f54", "#c9820f", "#b91c1c", "#1d4ed8", "#7c3aed", "#0f766e", "#6b7280", "#000000", "#ffffff"];
const HILITES = ["#fff3bf", "#d3f9d8", "#ffe3e3", "#d0ebff", "#f3d9fa", "#ffec99", "#e9fac8", "transparent"];

function extensions(placeholder?: string) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
    Image.configure({ inline: false, allowBase64: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Highlight.configure({ multicolor: true }),
    TextStyle, Color, FontFamily, FontSize,
    Table.configure({ resizable: true }), TableRow, TableHeader, TableCell,
    TaskList, TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: placeholder ?? "Start typing the agenda..." }),
  ];
}

function Tb({ on, active, disabled, title, children }: {
  on: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={on} disabled={disabled}
      className={`grid h-8 min-w-8 shrink-0 place-items-center rounded px-1.5 text-sm transition-colors disabled:opacity-30 ${active ? "bg-pine text-paper" : "text-ink/70 hover:bg-pine/8"}`}>
      {children}
    </button>
  );
}
const Div = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-pine/15" />;
const I = ({ d, sw = 2 }: { d: string; sw?: number }) => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {d.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);

function SwatchPopover({ label, swatches, onPick, children }: {
  label: string; swatches: string[]; onPick: (c: string) => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const id = setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => { clearTimeout(id); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); document.removeEventListener("mousedown", onDoc); };
  }, [open]);
  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 200), top: r.bottom + 4 });
    setOpen((v) => !v);
  };
  return (
    <>
      <button ref={btnRef} type="button" title={label} onMouseDown={(e) => e.preventDefault()} onClick={toggle}
        className="grid h-8 min-w-8 shrink-0 place-items-center rounded px-1.5 text-sm text-ink/70 transition-colors hover:bg-pine/8">
        {children}
      </button>
      {open && (
        <div ref={popRef} className="fixed z-[1300] grid grid-cols-5 gap-1.5 rounded-xl border border-pine/15 bg-paper p-2 shadow-xl"
          style={{ left: pos.left, top: pos.top }} onMouseDown={(e) => e.preventDefault()}>
          {swatches.map((c) => (
            <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setOpen(false); }}
              title={c === "transparent" ? "None" : c}
              className="h-6 w-6 rounded border border-pine/15 transition-transform hover:scale-110"
              style={c === "transparent"
                ? { backgroundImage: "linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%),linear-gradient(45deg,#ddd 25%,#fff 25%,#fff 75%,#ddd 75%)", backgroundSize: "8px 8px", backgroundPosition: "0 0,4px 4px" }
                : { background: c }} />
          ))}
        </div>
      )}
    </>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [, force] = useState(0);
  useEffect(() => {
    const h = () => force((n) => n + 1);
    editor.on("selectionUpdate", h); editor.on("transaction", h);
    return () => { editor.off("selectionUpdate", h); editor.off("transaction", h); };
  }, [editor]);

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const addImage = () => { const url = window.prompt("Image URL"); if (url) editor.chain().focus().setImage({ src: url }).run(); };
  const uploadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => editor.chain().focus().setImage({ src: reader.result as string }).run();
    reader.readAsDataURL(file);
  };

  const heading = editor.isActive("heading", { level: 1 }) ? "1"
    : editor.isActive("heading", { level: 2 }) ? "2"
    : editor.isActive("heading", { level: 3 }) ? "3" : "p";
  const curSize = (editor.getAttributes("textStyle").fontSize as string | undefined)?.replace("px", "") ?? "";
  const selCls = "h-8 shrink-0 rounded border border-pine/15 bg-paper px-1 text-xs text-ink/80 outline-none";

  return (
    <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto px-2 py-1.5">
      <Tb on={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo"><I d="M9 14L4 9l5-5|M4 9h11a5 5 0 0 1 0 10h-1" /></Tb>
      <Tb on={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo"><I d="M15 14l5-5-5-5|M20 9H9a5 5 0 0 0 0 10h1" /></Tb>
      <Div />
      <select value={heading} title="Text style" onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => { const v = e.target.value; if (v === "p") editor.chain().focus().setParagraph().run(); else editor.chain().focus().toggleHeading({ level: Number(v) as 1 | 2 | 3 }).run(); }}
        className={selCls}>
        <option value="p">Normal</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option>
      </select>
      <select title="Font" defaultValue="" onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run()}
        className={selCls}>
        {FONTS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
      </select>
      <select title="Font size" value={curSize} onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => e.target.value ? setFontSize(editor, `${e.target.value}px`) : unsetFontSize(editor)}
        className={selCls}>
        <option value="">Size</option>
        {SIZES.map((sz) => <option key={sz} value={sz}>{sz}</option>)}
      </select>
      <Div />
      <Tb on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><b>B</b></Tb>
      <Tb on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><i>I</i></Tb>
      <Tb on={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></Tb>
      <Tb on={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough"><s>S</s></Tb>
      <Tb on={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline code"><span className="font-mono text-xs">{"</>"}</span></Tb>
      <SwatchPopover label="Text color" swatches={COLORS} onPick={(c) => editor.chain().focus().setColor(c).run()}>
        <span className="flex flex-col items-center leading-none"><span>A</span><span className="mt-0.5 block h-1 w-3.5 rounded-sm" style={{ background: (editor.getAttributes("textStyle").color as string) || "#141b12" }} /></span>
      </SwatchPopover>
      <SwatchPopover label="Highlight" swatches={HILITES} onPick={(c) => c === "transparent" ? editor.chain().focus().unsetHighlight().run() : editor.chain().focus().toggleHighlight({ color: c }).run()}>
        <I d="M12 20l7-7-3-3-7 7v3z|M16 10l3-3a1.5 1.5 0 0 0-2-2l-3 3" />
      </SwatchPopover>
      <Div />
      <Tb on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bulleted list"><I d="M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01" /></Tb>
      <Tb on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list"><I d="M10 6h11|M10 12h11|M10 18h11|M4 6h1v4|M4 10h2|M6 18H4l2-2.5V15H4" sw={1.7} /></Tb>
      <Tb on={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")} title="Checklist"><I d="M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Tb>
      <Tb on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">&#10077;</Tb>
      <Tb on={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code block">{"{ }"}</Tb>
      <Div />
      <Tb on={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left"><I d="M3 6h18|M3 12h12|M3 18h15" /></Tb>
      <Tb on={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align center"><I d="M3 6h18|M6 12h12|M4 18h16" /></Tb>
      <Tb on={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right"><I d="M3 6h18|M9 12h12|M6 18h15" /></Tb>
      <Div />
      <Tb on={setLink} active={editor.isActive("link")} title="Insert link"><I d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></Tb>
      <Tb on={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table"><I d="M3 3h18v18H3z|M3 9h18|M3 15h18|M9 3v18|M15 3v18" sw={1.6} /></Tb>
      <Tb on={addImage} title="Image from URL"><I d="M3 3h18v18H3z|M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z|M21 15l-5-5L5 21" sw={1.6} /></Tb>
      <label title="Upload image" className="grid h-8 min-w-8 shrink-0 cursor-pointer place-items-center rounded px-1.5 text-ink/70 hover:bg-pine/8">
        <I d="M12 15V4|M7 9l5-5 5 5|M4 20h16" />
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }} />
      </label>
      <Tb on={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"><I d="M4 12h16" /></Tb>

      {editor.isActive("table") && (
        <>
          <Div />
          <Tb on={() => editor.chain().focus().addColumnAfter().run()} title="Add column">+col</Tb>
          <Tb on={() => editor.chain().focus().addRowAfter().run()} title="Add row">+row</Tb>
          <Tb on={() => editor.chain().focus().deleteColumn().run()} title="Delete column">-col</Tb>
          <Tb on={() => editor.chain().focus().deleteRow().run()} title="Delete row">-row</Tb>
          <Tb on={() => editor.chain().focus().deleteTable().run()} title="Delete table">xtbl</Tb>
        </>
      )}
    </div>
  );
}

export default function MeetingEditor({
  html, editable, placeholder, onChange, fullscreen, onToggleFullscreen,
}: {
  html: string;
  editable: boolean;
  placeholder?: string;
  onChange?: (html: string) => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}) {
  const editor = useEditor({
    editable,
    extensions: extensions(placeholder),
    content: html || "",
    editorProps: { attributes: { class: "doc-prose focus:outline-none" } },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    immediatelyRender: false,
  });

  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    if (html !== cur && !editor.isFocused) editor.commands.setContent(html || "", false);
  }, [html, editor]);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onToggleFullscreen?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, onToggleFullscreen]);

  if (!editor) return <div className="rounded-2xl border border-pine/12 bg-paper p-6 text-sm text-ink/40">Loading editor...</div>;

  const toolbar = editable && (
    <div className="flex items-center justify-between gap-2 border-b border-pine/12 bg-paper">
      <div className="min-w-0 flex-1"><Toolbar editor={editor} /></div>
      {onToggleFullscreen && (
        <button type="button" onClick={onToggleFullscreen} title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
          className="mr-2 shrink-0 rounded-full border border-pine/20 px-3 py-1.5 text-xs font-semibold text-pine-deep hover:bg-pine/5">
          {fullscreen ? "Exit full screen \u2715" : "Full screen \u2922"}
        </button>
      )}
    </div>
  );

  const bubble = editable && (
    <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} className="flex items-center gap-0.5 rounded-lg border border-pine/15 bg-paper p-1 shadow-lg">
      <Tb on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><b>B</b></Tb>
      <Tb on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><i>I</i></Tb>
      <Tb on={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></Tb>
      <Tb on={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive("highlight")} title="Highlight"><I d="M12 20l7-7-3-3-7 7v3z|M16 10l3-3a1.5 1.5 0 0 0-2-2l-3 3" /></Tb>
      <Tb on={() => { const url = window.prompt("Link URL", "https://"); if (url) editor.chain().focus().setLink({ href: url }).run(); }} active={editor.isActive("link")} title="Link"><I d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></Tb>
    </BubbleMenu>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[1200] flex flex-col bg-[#e9e7df]">
        <div className="shrink-0 shadow-sm">{toolbar}</div>
        {bubble}
        <div className="flex-1 overflow-y-auto py-8">
          <div className="mx-auto w-full max-w-3xl rounded-md bg-white px-14 py-12 shadow-[0_1px_10px_rgba(0,0,0,0.14)]">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-pine/12 bg-paper">
      {toolbar}
      {bubble}
      <div className="max-h-[70vh] overflow-y-auto p-5">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
