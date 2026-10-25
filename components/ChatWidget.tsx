"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/Avatar";

type Contact = { email: string; name: string; group: string };
type ChatSummary = {
  id: string; isGroup: boolean; title: string | null; createdBy: string;
  createdAt: string; memberEmails: string[]; lastMessage: string | null; lastAt: string | null;
};
type Reaction = { email: string; emoji: string };
type Message = { id: string; chatId: string; senderEmail: string; body: string; reactions: Reaction[]; createdAt: string };
type MemberInfo = { name: string; avatar: string | null };

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"];
const EMOJIS = ["😀", "😂", "😍", "😎", "😭", "👍", "🙏", "🎉", "🔥", "❤️", "✅", "👀", "💯", "🤝", "🙌", "😅", "🥳", "📌", "⏰", "✨"];

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const fmtDay = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function lastSeenMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("rishi:chat:lastSeen") || "{}"); } catch { return {}; }
}
function setLastSeen(chatId: string, at: string) {
  if (typeof window === "undefined") return;
  const m = lastSeenMap(); m[chatId] = at;
  try { localStorage.setItem("rishi:chat:lastSeen", JSON.stringify(m)); } catch { /* ignore */ }
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<"normal" | "large" | "full">("normal");
  const [view, setView] = useState<"list" | "thread" | "new">("list");
  const [me, setMe] = useState("");
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<Record<string, MemberInfo>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  // new-chat state
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seenVersion = useRef(0); // bump to recompute unread after marking seen

  const nameOf = useCallback((email: string) => members[email.toLowerCase()]?.name ?? email, [members]);
  const avatarOf = useCallback((email: string) => members[email.toLowerCase()]?.avatar ?? null, [members]);

  const chatTitle = useCallback((c: ChatSummary) => {
    if (c.isGroup) return c.title || c.memberEmails.filter((e) => e !== me).map(nameOf).join(", ") || "Group chat";
    const other = c.memberEmails.find((e) => e.toLowerCase() !== me.toLowerCase());
    return other ? nameOf(other) : "Direct message";
  }, [me, nameOf]);

  async function deleteChat(id: string, title: string) {
    if (!confirm(`Delete your copy of "${title}"? It's removed from your list only — the other people keep the conversation, and it'll come back if someone sends a new message.`)) return;
    try {
      await fetch(`/api/lms/chat/${id}`, { method: "DELETE" });
      if (activeId === id) { setActiveId(null); setView("list"); }
      await loadChats();
    } catch { /* ignore */ }
  }
  const loadChats = useCallback(async () => {
    try {
      const res = await fetch("/api/lms/chat");
      if (!res.ok) return;
      const d = await res.json();
      setMe(d.me); setChats(d.chats ?? []); setContacts(d.contacts ?? []); setMembers(d.members ?? {});
      setErrorMsg(d.chatsError ?? null);
    } catch { /* offline */ }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/lms/chat/${id}`);
      if (!res.ok) return;
      const d = await res.json();
      setMessages(d.messages ?? []);
      const last = (d.messages ?? [])[(d.messages ?? []).length - 1];
      if (last) { setLastSeen(id, last.createdAt); seenVersion.current++; }
    } catch { /* ignore */ }
  }, []);

  // Initial + polling for the chat list while open.
  useEffect(() => {
    if (!open) return;
    loadChats();
    const iv = setInterval(loadChats, 8000);
    return () => clearInterval(iv);
  }, [open, loadChats]);

  // Polling messages while a thread is open.
  useEffect(() => {
    if (!open || view !== "thread" || !activeId) return;
    loadMessages(activeId);
    const iv = setInterval(() => loadMessages(activeId), 3500);
    return () => clearInterval(iv);
  }, [open, view, activeId, loadMessages]);

  // Auto-scroll to newest message.
  useEffect(() => {
    if (view === "thread" && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, view]);

  const unreadCount = useMemo(() => {
    const seen = lastSeenMap();
    return chats.filter((c) => c.lastAt && (!seen[c.id] || c.lastAt > seen[c.id])).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, seenVersion.current]);

  function openChat(id: string) {
    setActiveId(id);
    setView("thread");
    setReactingTo(null);
    const c = chats.find((x) => x.id === id);
    if (c?.lastAt) { setLastSeen(id, c.lastAt); seenVersion.current++; }
  }

  async function send() {
    const body = text.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    setText("");
    setShowEmoji(false);
    try {
      await fetch(`/api/lms/chat/${activeId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }),
      });
      await loadMessages(activeId);
      loadChats();
    } catch { setText(body); }
    setSending(false);
  }

  async function react(messageId: string, emoji: string) {
    setReactingTo(null);
    try {
      const res = await fetch(`/api/lms/chat/${activeId}/react`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, emoji }),
      });
      if (res.ok) {
        const d = await res.json();
        setMessages((ms) => ms.map((m) => (m.id === messageId ? d.message : m)));
      }
    } catch { /* ignore */ }
  }

  async function startChat() {
    if (picked.length === 0) return;
    const isGroup = picked.length > 1;
    try {
      const res = await fetch("/api/lms/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberEmails: picked, isGroup, title: isGroup ? groupTitle : null }),
      });
      const d = await res.json();
      if (!res.ok) { setErrorMsg(d.error || "Couldn't start the chat."); return; }
      setErrorMsg(null);
      setPicked([]); setGroupTitle(""); setSearch("");
      await loadChats();
      openChat(d.chat.id);
    } catch { /* ignore */ }
  }

  const dims =
    size === "full" ? { width: "100vw", height: "100vh", right: 0, bottom: 0, borderRadius: 0 }
    : size === "large" ? { width: "min(34rem, calc(100vw - 2rem))", height: "min(44rem, calc(100vh - 2rem))", right: "1.5rem", bottom: "1.5rem", borderRadius: "1.5rem" }
    : { width: "min(24rem, calc(100vw - 2rem))", height: "min(34rem, calc(100vh - 2rem))", right: "1.5rem", bottom: "1.5rem", borderRadius: "1.5rem" };

  const groupReactions = (m: Message) => {
    const counts = new Map<string, { n: number; mine: boolean }>();
    for (const r of m.reactions) {
      const cur = counts.get(r.emoji) ?? { n: 0, mine: false };
      cur.n++; if (r.email === me.toLowerCase()) cur.mine = true;
      counts.set(r.emoji, cur);
    }
    return Array.from(counts.entries());
  };

  const filteredContacts = contacts.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setView("list"); }}
          className="fixed bottom-6 right-6 z-[900] grid h-14 w-14 place-items-center rounded-full bg-pine text-paper shadow-xl transition-transform hover:scale-105"
          aria-label="Open chat"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-marigold px-1 text-[11px] font-bold text-pine-deep">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          style={{ position: "fixed", zIndex: 900, ...dims }}
          className="flex flex-col overflow-hidden border border-pine/20 bg-paper shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-pine/12 bg-pine px-3 py-2.5 text-paper">
            {view === "thread" || view === "new" ? (
              <button onClick={() => { setView("list"); setActiveId(null); }} className="grid h-8 w-8 place-items-center rounded-full hover:bg-paper/10" aria-label="Back">←</button>
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-paper/10">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" /></svg>
              </span>
            )}
            <p className="flex-1 truncate font-display text-sm font-semibold">
              {view === "thread" && activeId
                ? (chats.find((c) => c.id === activeId) ? chatTitle(chats.find((c) => c.id === activeId)!) : "Chat")
                : view === "new" ? "New chat" : "Messages"}
            </p>
            <button onClick={() => setSize(size === "normal" ? "large" : size === "large" ? "full" : "normal")}
              className="grid h-8 w-8 place-items-center rounded-full text-xs hover:bg-paper/10" title="Resize" aria-label="Resize">
              {size === "full" ? "🗗" : "⤢"}
            </button>
            <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-paper/10" aria-label="Close">✕</button>
          </div>

          {/* Body */}
          {view === "list" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <button onClick={() => { setView("new"); setPicked([]); setSearch(""); setGroupTitle(""); }}
                className="m-3 rounded-xl bg-marigold px-4 py-2 text-sm font-semibold text-pine-deep hover:brightness-105">+ New chat</button>
              {errorMsg && (
                <p className="mx-3 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{errorMsg}</p>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {chats.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-ink/65">No conversations yet. Start one!</p>
                ) : chats.map((c) => {
                  const seen = lastSeenMap();
                  const unread = c.lastAt && (!seen[c.id] || c.lastAt > seen[c.id]);
                  const other = c.memberEmails.find((e) => e.toLowerCase() !== me.toLowerCase()) || me;
                  return (
                    <div key={c.id} className="group relative flex w-full items-center gap-2 rounded-xl px-2 py-2.5 hover:bg-pine/[0.04]">
                      <button onClick={() => openChat(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <Avatar src={c.isGroup ? null : avatarOf(other)} name={chatTitle(c)} size={40} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`truncate text-sm ${unread ? "font-bold text-ink" : "font-semibold text-ink/90"}`}>{chatTitle(c)}</p>
                            {c.lastAt && <span className="shrink-0 text-[11px] text-ink/65">{fmtDay(c.lastAt)}</span>}
                          </div>
                          <p className={`truncate text-xs ${unread ? "text-ink/80" : "text-ink/70"}`}>{c.lastMessage ?? "No messages yet"}</p>
                        </div>
                        {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-marigold" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteChat(c.id, chatTitle(c)); }}
                        title="Delete conversation" aria-label="Delete conversation"
                        className="shrink-0 rounded-full p-1.5 text-ink/65 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "new" && (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members…"
                className="w-full rounded-xl border border-pine/20 px-3 py-2 text-sm outline-none focus:border-pine" />
              {errorMsg && (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{errorMsg}</p>
              )}
              {picked.length > 1 && (
                <input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Group name (optional)"
                  className="mt-2 w-full rounded-xl border border-pine/20 px-3 py-2 text-sm outline-none focus:border-pine" />
              )}
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
                {filteredContacts.map((c) => {
                  const on = picked.includes(c.email);
                  return (
                    <button key={c.email} onClick={() => setPicked((p) => on ? p.filter((x) => x !== c.email) : [...p, c.email])}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-pine/[0.04]">
                      <input type="checkbox" readOnly checked={on} className="accent-pine" />
                      <Avatar src={avatarOf(c.email)} name={c.name} size={32} />
                      <span className="text-sm text-ink">{c.name}</span>
                    </button>
                  );
                })}
                {filteredContacts.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink/65">No members found.</p>}
              </div>
              <button onClick={startChat} disabled={picked.length === 0}
                className="mt-2 rounded-xl bg-pine px-4 py-2.5 text-sm font-semibold text-paper disabled:opacity-50">
                {picked.length > 1 ? `Start group chat (${picked.length})` : "Start chat"}
              </button>
            </div>
          )}

          {view === "thread" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div ref={scrollRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">
                {messages.length === 0 && <p className="py-8 text-center text-sm text-ink/65">Say hello 👋</p>}
                {messages.map((m, i) => {
                  const mine = m.senderEmail.toLowerCase() === me.toLowerCase();
                  const prev = messages[i - 1];
                  const showSender = !mine && (!prev || prev.senderEmail !== m.senderEmail);
                  const active = chats.find((c) => c.id === activeId);
                  const isGroup = active?.isGroup;
                  const reacts = groupReactions(m);
                  return (
                    <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                      {showSender && isGroup && <span className="mb-0.5 ml-1 text-[11px] font-medium text-ink/70">{nameOf(m.senderEmail)}</span>}
                      <div className="group relative max-w-[80%]">
                        <div
                          onClick={() => setReactingTo(reactingTo === m.id ? null : m.id)}
                          className={`cursor-pointer whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? "bg-pine text-paper" : "bg-pine/[0.06] text-ink"}`}
                        >
                          {m.body}
                        </div>
                        {/* reaction bar */}
                        {reactingTo === m.id && (
                          <div className={`absolute z-10 ${mine ? "right-0" : "left-0"} -top-9 flex gap-0.5 rounded-full border border-pine/15 bg-paper px-1.5 py-1 shadow-lg`}>
                            {REACTIONS.map((e) => (
                              <button key={e} onClick={(ev) => { ev.stopPropagation(); react(m.id, e); }} className="rounded-full px-1 text-base hover:bg-pine/10">{e}</button>
                            ))}
                          </div>
                        )}
                        <div className={`mt-0.5 flex items-center gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                          <span className="text-[10px] text-ink/65">{fmtTime(m.createdAt)}</span>
                        </div>
                        {reacts.length > 0 && (
                          <div className={`-mt-0.5 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                            {reacts.map(([emoji, info]) => (
                              <button key={emoji} onClick={() => react(m.id, emoji)}
                                className={`flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] ${info.mine ? "border-pine bg-pine/10" : "border-pine/15 bg-paper"}`}>
                                <span>{emoji}</span><span className="text-ink/75">{info.n}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Composer */}
              <div className="border-t border-pine/12 p-2">
                {showEmoji && (
                  <div className="mb-2 flex flex-wrap gap-1 rounded-xl border border-pine/12 bg-pine/[0.02] p-2">
                    {EMOJIS.map((e) => (
                      <button key={e} onClick={() => setText((t) => t + e)} className="rounded px-1 text-lg hover:bg-pine/10">{e}</button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-1.5">
                  <button onClick={() => setShowEmoji((v) => !v)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg hover:bg-pine/10" aria-label="Emoji">😊</button>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    rows={1}
                    placeholder="Message…"
                    className="max-h-28 min-h-[2.25rem] flex-1 resize-none rounded-2xl border border-pine/20 px-3 py-2 text-sm outline-none focus:border-pine"
                  />
                  <button onClick={send} disabled={!text.trim() || sending}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine text-paper disabled:opacity-40" aria-label="Send">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
