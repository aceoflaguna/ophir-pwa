import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError, errorText } from "../api/client";
import type { ChatMessage } from "../api/types";
import { usePolling } from "../hooks/usePolling";
import { fmtTime } from "../util/format";
import { Modal } from "./ui";

const POLL_MS = 4000;

/**
 * Rider <-> driver chat for one live ride. Mount it only while the ride is accepted / arrived / in_progress
 * (give it `key={ride.id}`): it polls from mount, and stops polling when the server says the chat is closed.
 */
export default function RideChat({ rideId, me, peerName }: { rideId: string; me: "rider" | "driver"; peerName?: string }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);              // highest message id the user has viewed
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const cursor = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  const merge = (incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    cursor.current = Math.max(cursor.current, ...incoming.map((m) => m.id));
    setMsgs((cur) => {
      const have = new Set(cur.map((m) => m.id));
      return [...cur, ...incoming.filter((m) => !have.has(m.id))].sort((a, b) => a.id - b.id);
    });
  };

  usePolling(async () => {
    if (document.hidden) return;
    try { merge((await api.messages(rideId, cursor.current)).messages); }
    catch (e) { if (e instanceof ApiError && e.code === "CHAT_CLOSED") setClosed(true); }
  }, POLL_MS, !closed);

  const peerLabel = me === "rider" ? "driver" : "rider";
  const unread = msgs.filter((m) => m.senderRole !== me && m.id > seen).length;

  // Viewing the thread marks everything as seen and keeps it scrolled to the latest message.
  useEffect(() => {
    if (!open || !msgs.length) return;
    setSeen(msgs[msgs.length - 1]!.id);
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [open, msgs]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true); setError(null);
    try { merge([(await api.sendMessage(rideId, body)).message]); setText(""); }
    catch (x) { if (x instanceof ApiError && x.code === "CHAT_CLOSED") setClosed(true); setError(errorText(x)); }
    finally { setSending(false); }
  }

  return (
    <>
      <button className="btn-cp-ghost btn-block nr-chat-open" onClick={() => setOpen(true)} aria-label={`Message ${peerLabel}${unread ? `, ${unread} unread` : ""}`}>
        Message {peerLabel}{unread > 0 && <span className="nr-chat-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <Modal title={peerName ? `Chat with ${peerName}` : `Chat with ${peerLabel}`} onClose={() => setOpen(false)}>
          <div className="nr-chat" role="log" aria-live="polite">
            {msgs.length === 0 && <div className="nr-empty">No messages yet. Say where you are or what you are wearing.</div>}
            {msgs.map((m) => (
              <div key={m.id} className={`nr-bubble ${m.senderRole === me ? "mine" : "theirs"}`}>
                <p>{m.body}</p><time>{fmtTime(m.createdAt)}</time>
              </div>
            ))}
            <div ref={bottom} />
          </div>
          {closed ? <div className="nr-panel nr-muted">This trip has ended, so the chat is closed.</div> : (
            <form className="nr-chat-form" onSubmit={send}>
              <input className="form-control" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={`Message your ${peerLabel}`} aria-label="Message" autoComplete="off" />
              <button className="btn-cp" disabled={sending || !text.trim()}>Send</button>
            </form>
          )}
          {error && <div className="nr-error mt-2">{error}</div>}
        </Modal>
      )}
    </>
  );
}