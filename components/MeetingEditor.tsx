"use client";

import { useEffect, useState, useCallback } from "react";
import { useEditor, EditorContent, BubbleMenu, type Editor } from "@tiptap/react";
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

const FONTS = [
  ["", "Default"], ["Inter, sans-serif", "Sans serif"], ["Georgia, serif", "Serif"],
  ["'Courier New', monospace", "Monospace"], ["'Fraunces', serif", "Display"],
];
const COLORS = ["#141b12", "#1f6f54", "#c9820f", "#b91c1c", "#1d4ed8", "#7c3aed", "#0f766e", "#6b7280"];
const HILITES = ["#fff3bf", "#d3f9d8", "#ffe3e3", "#d0ebff", "#f3d9fa", "transparent"];

function extensions(placeholder?: string) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
    Image.configure({ inline: false, allowBase64: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Highlight.configure({ multicolor: true }),
    TextStyle, Color, FontFamily,
    Table.configure({ resizable: true }), TableRow, TableHeader, TableCell,
    TaskList, TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: placeholder ?? "Start typing the agenda…" }),
  ];
}

// ------- toolbar button -------
function Tb({ on, active, disabled, title, children }: {
  on: () => void; active?: boolean; disabled?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={on} disabled={disabled}
      className={`grid h-8 min-w-8 place-items-center rounded px-1.5 text-sm transition-colors disabled:opacity-30 ${active ? "bg-pine text-paper" : "text-ink/70 hover:bg-pine/8"}`}>
      {children}
    </button>
  );
}
const Div = () => <span className="mx-0.5 h-5 w-px bg-pine/15" />;

function Toolbar({ editor }: { editor: Editor }) {
  // subscribe to selection/state changes so active states re-render
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
  const addImage = () => {
    const url = window.prompt("Image URL");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };
  const uploadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => editor.chain().focus().setImage({ src: reader.result as string }).run();
    reader.readAsDataURL(file);
  };

  const heading = editor.isActive("heading", { level: 1 }) ? "1"
    : editor.isActive("heading", { level: 2 }) ? "2"
    : editor.isActive("heading", { level: 3 }) ? "3" : "p";

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-pine/12 bg-paper/95 px-2 py-1.5 backdrop-blur">
      <Tb on={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">↺</Tb>
      <Tb on={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">↻</Tb>
      <Div />
      <select value={heading} title="Text style" onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: Number(v) as 1 | 2 | 3 }).run();
        }}
        className="h-8 rounded border border-pine/15 bg-paper px-1 text-xs text-ink/80 outline-none">
        <option value="p">Normal</option><option value="1">Heading 1</option><option value="2">Heading 2</option><option value="3">Heading 3</option>
      </select>
      <select title="Font" defaultValue="" onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run()}
        className="h-8 rounded border border-pine/15 bg-paper px-1 text-xs text-ink/80 outline-none">
        {FONTS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
      </select>
      <Div />
      <Tb on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><b>B</b></Tb>
      <Tb on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><i>I</i></Tb>
      <Tb on={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></Tb>
      <Tb on={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough"><s>S</s></Tb>
      <Tb on={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline code"><span className="font-mono text-xs">{"</>"}</span></Tb>
      {/* text color */}
      <div className="group/color relative">
        <Tb on={() => {}} title="Text color"><span className="border-b-2 border-current pb-0.5">A</span></Tb>
        <div className="absolute left-0 top-full z-20 hidden grid-cols-4 gap-1 rounded-lg border border-pine/15 bg-paper p-1.5 shadow-lg group-hover/color:grid">
          {COLORS.map((c) => <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setColor(c).run()} className="h-5 w-5 rounded" style={{ background: c }} />)}
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().unsetColor().run()} className="col-span-4 mt-0.5 rounded text-[10px] text-ink/50 hover:bg-pine/5">reset</button>
        </div>
      </div>
      {/* highlight */}
      <div className="group/hl relative">
        <Tb on={() => {}} active={editor.isActive("highlight")} title="Highlight">🖍</Tb>
        <div className="absolute left-0 top-full z-20 hidden grid-cols-3 gap-1 rounded-lg border border-pine/15 bg-paper p-1.5 shadow-lg group-hover/hl:grid">
          {HILITES.map((c) => <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => c === "transparent" ? editor.chain().focus().unsetHighlight().run() : editor.chain().focus().toggleHighlight({ color: c }).run()} className="h-5 w-5 rounded border border-pine/10" style={{ background: c === "transparent" ? "#fff" : c }} />)}
        </div>
      </div>
      <Div />
      <Tb on={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bulleted list">•</Tb>
      <Tb on={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">1.</Tb>
      <Tb on={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")} title="Checklist">☑</Tb>
      <Tb on={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Quote">❝</Tb>
      <Tb on={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code block">{"{ }"}</Tb>
      <Div />
      <Tb on={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left">⯇</Tb>
      <Tb on={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align center">≡</Tb>
      <Tb on={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right">⯈</Tb>
      <Div />
      <Tb on={setLink} active={editor.isActive("link")} title="Insert link">🔗</Tb>
      <Tb on={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert table">▦</Tb>
      <Tb on={addImage} title="Image from URL">🖼</Tb>
      <label title="Upload image" className="grid h-8 min-w-8 cursor-pointer place-items-center rounded px-1.5 text-sm text-ink/70 hover:bg-pine/8">
        ⬆<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }} />
      </label>
      <Tb on={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">―</Tb>

      {/* table controls appear only inside a table */}
      {editor.isActive("table") && (
        <>
          <Div />
          <Tb on={() => editor.chain().focus().addColumnAfter().run()} title="Add column">＋col</Tb>
          <Tb on={() => editor.chain().focus().addRowAfter().run()} title="Add row">＋row</Tb>
          <Tb on={() => editor.chain().focus().deleteColumn().run()} title="Delete column">－col</Tb>
          <Tb on={() => editor.chain().focus().deleteRow().run()} title="Delete row">－row</Tb>
          <Tb on={() => editor.chain().focus().deleteTable().run()} title="Delete table">✕tbl</Tb>
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

  // keep editable state in sync
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  // if content changes from outside (e.g. a live remote update) and differs, replace it
  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    if (html !== cur && !editor.isFocused) editor.commands.setContent(html || "", false);
  }, [html, editor]);

  const Frame = useCallback((children: React.ReactNode) => (
    fullscreen
      ? <div className="fixed inset-0 z-[1200] flex flex-col bg-paper">{children}</div>
      : <div className="overflow-hidden rounded-2xl border border-pine/12 bg-paper">{children}</div>
  ), [fullscreen]);

  if (!editor) return <div className="rounded-2xl border border-pine/12 bg-paper p-6 text-sm text-ink/40">Loading editor…</div>;

  return Frame(
    <>
      {editable && (
        <div className="flex items-center justify-between gap-2 border-b border-pine/10">
          <div className="min-w-0 flex-1 overflow-x-auto"><Toolbar editor={editor} /></div>
          {onToggleFullscreen && (
            <button type="button" onClick={onToggleFullscreen} title={fullscreen ? "Exit full screen" : "Full screen"}
              className="mr-2 shrink-0 rounded-full border border-pine/20 px-3 py-1.5 text-xs font-semibold text-pine-deep hover:bg-pine/5">
              {fullscreen ? "Exit full screen ✕" : "Full screen ⤢"}
            </button>
          )}
        </div>
      )}
      {editor && editable && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} className="flex items-center gap-0.5 rounded-lg border border-pine/15 bg-paper p-1 shadow-lg">
          <Tb on={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><b>B</b></Tb>
          <Tb on={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><i>I</i></Tb>
          <Tb on={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></Tb>
          <Tb on={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive("highlight")} title="Highlight">🖍</Tb>
          <Tb on={() => { const url = window.prompt("Link URL", "https://"); if (url) editor.chain().focus().setLink({ href: url }).run(); }} active={editor.isActive("link")} title="Link">🔗</Tb>
        </BubbleMenu>
      )}
      <div className={`${fullscreen ? "flex-1" : "max-h-[70vh]"} overflow-y-auto ${fullscreen ? "px-0 py-8" : "p-5"}`}>
        <div className={fullscreen ? "mx-auto w-full max-w-3xl px-6" : ""}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}
