"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { FontSize, Indent } from "./extensions";
import "./editor.css";

const FONTS = [
  { label: "Sans Serif", value: "Arial, Helvetica, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Fixed Width", value: "'Courier New', monospace" },
  { label: "Garamond", value: "Garamond, serif" },
  { label: "Tahoma", value: "Tahoma, sans-serif" },
  { label: "Trebuchet", value: "'Trebuchet MS', sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
  { label: "Comic Sans", value: "'Comic Sans MS', cursive" },
];
const SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px"];
const EMOJIS = "😀 😄 😁 😉 😊 😍 🤩 😎 🤔 🙌 👏 👍 👎 🙏 💪 🎉 🔥 ✨ ⭐ ✅ ❌ ❤️ 💛 💚 💙 📌 📣 📝 📅 ⏰ 🚀 🌱 🎓 ☕ 💡".split(" ");

function Btn({
  active, disabled, title, onClick, children,
}: {
  active?: boolean; disabled?: boolean; title: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-sm transition-colors disabled:opacity-30 ${
        active ? "bg-pine text-paper" : "text-ink/70 hover:bg-ink/10"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px self-center bg-ink/15" />;

export type RichTextEditorHandle = { getHTML: () => string };

export default function RichTextEditor({
  value = "",
  onChange,
  placeholder = "Write your message…",
  attachments,
  onAttachmentsChange,
  registerInsert,
}: {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;
  registerInsert?: (fn: (text: string) => void) => void;
}) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [files, setFiles] = useState<File[]>(attachments ?? []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      FontSize,
      Indent,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: { attributes: { class: "rte-content" } },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  });

  const setFilesAndEmit = useCallback(
    (next: File[]) => { setFiles(next); onAttachmentsChange?.(next); },
    [onAttachmentsChange],
  );

  useEffect(() => {
    if (editor && registerInsert) {
      registerInsert((text: string) => editor.chain().focus().insertContent(text).run());
    }
  }, [editor, registerInsert]);

  if (!editor) {
    return <div className="rounded-xl border border-ink/15 p-4 text-sm text-ink/65">Loading editor…</div>;
  }

  const e = editor as Editor;

  function addImages(list: FileList | null) {
    if (!list) return;
    Array.from(list).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => e.chain().focus().setImage({ src: reader.result as string }).run();
      reader.readAsDataURL(file);
    });
  }

  function applyLink() {
    const url = linkUrl.trim();
    if (!url) { e.chain().focus().unsetLink().run(); }
    else {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      e.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setShowLink(false); setLinkUrl("");
  }

  // Indent/outdent: nest list items when inside a list, else indent the block.
  const inList = e.isActive("bulletList") || e.isActive("orderedList");
  const doIndent = () =>
    inList ? e.chain().focus().sinkListItem("listItem").run() : e.chain().focus().indent().run();
  const doOutdent = () =>
    inList ? e.chain().focus().liftListItem("listItem").run() : e.chain().focus().outdent().run();

  const curFont = FONTS.find((f) => e.isActive("textStyle", { fontFamily: f.value }))?.value ?? "";

  return (
    <div className="rounded-xl border border-ink/15 bg-paper">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-ink/12 p-1.5">
        <Btn title="Undo (Ctrl/⌘+Z)" disabled={!e.can().undo()} onClick={() => e.chain().focus().undo().run()}>↶</Btn>
        <Btn title="Redo (Ctrl/⌘+Y)" disabled={!e.can().redo()} onClick={() => e.chain().focus().redo().run()}>↷</Btn>
        <Divider />

        {/* Font family */}
        <select
          title="Font"
          value={curFont}
          onChange={(ev) => ev.target.value ? e.chain().focus().setFontFamily(ev.target.value).run() : e.chain().focus().unsetFontFamily().run()}
          className="h-8 rounded-md border border-ink/15 bg-paper px-1.5 text-xs text-ink/80"
        >
          <option value="">Font</option>
          {FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>

        {/* Font size */}
        <select
          title="Font size"
          onChange={(ev) => ev.target.value && e.chain().focus().setFontSize(ev.target.value).run()}
          className="h-8 rounded-md border border-ink/15 bg-paper px-1.5 text-xs text-ink/80"
          value=""
        >
          <option value="">Size</option>
          {SIZES.map((s) => <option key={s} value={s}>{s.replace("px", "")}</option>)}
        </select>
        <Divider />

        <Btn title="Bold (Ctrl/⌘+B)" active={e.isActive("bold")} onClick={() => e.chain().focus().toggleBold().run()}><b>B</b></Btn>
        <Btn title="Italic (Ctrl/⌘+I)" active={e.isActive("italic")} onClick={() => e.chain().focus().toggleItalic().run()}><i>I</i></Btn>
        <Btn title="Underline (Ctrl/⌘+U)" active={e.isActive("underline")} onClick={() => e.chain().focus().toggleUnderline().run()}><u>U</u></Btn>
        <Btn title="Strikethrough" active={e.isActive("strike")} onClick={() => e.chain().focus().toggleStrike().run()}><s>S</s></Btn>

        {/* Text color */}
        <label title="Text color" className="grid h-8 w-8 cursor-pointer place-items-center rounded-md hover:bg-ink/10">
          <span className="text-sm font-bold leading-none" style={{ color: e.getAttributes("textStyle").color || "#1a1a1a" }}>A</span>
          <input type="color" className="absolute h-0 w-0 opacity-0"
            onChange={(ev) => e.chain().focus().setColor(ev.target.value).run()} />
        </label>
        {/* Highlight */}
        <label title="Highlight" className="grid h-8 w-8 cursor-pointer place-items-center rounded-md hover:bg-ink/10">
          <span className="rounded px-1 text-xs font-semibold" style={{ background: e.getAttributes("highlight").color || "#fde68a" }}>H</span>
          <input type="color" className="absolute h-0 w-0 opacity-0"
            onChange={(ev) => e.chain().focus().toggleHighlight({ color: ev.target.value }).run()} />
        </label>
        <Divider />

        <Btn title="Bulleted list" active={e.isActive("bulletList")} onClick={() => e.chain().focus().toggleBulletList().run()}>•≡</Btn>
        <Btn title="Numbered list" active={e.isActive("orderedList")} onClick={() => e.chain().focus().toggleOrderedList().run()}>1.≡</Btn>
        <Btn title="Decrease indent" onClick={doOutdent}>⇤</Btn>
        <Btn title="Increase indent" onClick={doIndent}>⇥</Btn>
        <Btn title="Quote" active={e.isActive("blockquote")} onClick={() => e.chain().focus().toggleBlockquote().run()}>❝</Btn>
        <Divider />

        <Btn title="Align left" active={e.isActive({ textAlign: "left" })} onClick={() => e.chain().focus().setTextAlign("left").run()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4"><path d="M4 6h16M4 12h10M4 18h13" /></svg>
        </Btn>
        <Btn title="Align center" active={e.isActive({ textAlign: "center" })} onClick={() => e.chain().focus().setTextAlign("center").run()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4"><path d="M4 6h16M7 12h10M5 18h14" /></svg>
        </Btn>
        <Btn title="Align right" active={e.isActive({ textAlign: "right" })} onClick={() => e.chain().focus().setTextAlign("right").run()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4"><path d="M4 6h16M10 12h10M7 18h13" /></svg>
        </Btn>
        <Btn title="Justify" active={e.isActive({ textAlign: "justify" })} onClick={() => e.chain().focus().setTextAlign("justify").run()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </Btn>
        <Divider />

        {/* Link */}
        <div className="relative">
          <Btn title="Insert link" active={e.isActive("link")} onClick={() => { setLinkUrl(e.getAttributes("link").href ?? ""); setShowLink((s) => !s); setShowEmoji(false); }}>🔗</Btn>
          {showLink && (
            <div className="absolute left-0 top-9 z-20 flex w-64 items-center gap-1 rounded-lg border border-ink/15 bg-paper p-1.5 shadow-lg">
              <input autoFocus value={linkUrl} onChange={(ev) => setLinkUrl(ev.target.value)}
                onKeyDown={(ev) => ev.key === "Enter" && applyLink()}
                placeholder="https://…" className="min-w-0 flex-1 rounded border border-ink/15 px-2 py-1 text-sm" />
              <button type="button" onClick={applyLink} className="rounded bg-pine px-2 py-1 text-xs font-semibold text-paper">Apply</button>
            </div>
          )}
        </div>
        {/* Image */}
        <Btn title="Insert photo" onClick={() => imageInputRef.current?.click()}>🖼</Btn>
        {/* Emoji */}
        <div className="relative">
          <Btn title="Insert emoji" onClick={() => { setShowEmoji((s) => !s); setShowLink(false); }}>😊</Btn>
          {showEmoji && (
            <div className="absolute left-0 top-9 z-20 grid w-64 grid-cols-8 gap-0.5 rounded-lg border border-ink/15 bg-paper p-2 shadow-lg">
              {EMOJIS.map((em) => (
                <button key={em} type="button" className="rounded p-1 text-lg hover:bg-ink/10"
                  onClick={() => { e.chain().focus().insertContent(em).run(); setShowEmoji(false); }}>{em}</button>
              ))}
            </div>
          )}
        </div>
        {/* Attach files */}
        <Btn title="Attach file" onClick={() => fileInputRef.current?.click()}>📎</Btn>
        <Divider />

        <Btn title="Clear formatting" onClick={() => e.chain().focus().unsetAllMarks().clearNodes().run()}>⌫ₐ</Btn>
      </div>

      {/* Editable area */}
      <div className="px-4 py-3" onClick={() => e.chain().focus().run()}>
        <EditorContent editor={editor} />
      </div>

      {/* Attachment chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-ink/12 p-2">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 py-1 text-xs text-ink/70">
              📎 {f.name}
              <button type="button" className="text-ink/65 hover:text-red-600"
                onClick={() => setFilesAndEmit(files.filter((_, j) => j !== i))}>✕</button>
            </span>
          ))}
        </div>
      )}

      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(ev) => { addImages(ev.target.files); ev.target.value = ""; }} />
      <input ref={fileInputRef} type="file" multiple className="hidden"
        onChange={(ev) => { if (ev.target.files) setFilesAndEmit([...files, ...Array.from(ev.target.files)]); ev.target.value = ""; }} />
    </div>
  );
}
