import { useState } from "react";
import { Sparkles, X, ArrowUp, ShieldCheck } from "lucide-react";
import { api } from "../services/api";
import { useAuth } from "../contexts/AuthContext";
import { Button, Notice, useAction } from "../components/ui";
export default function Assistant({ onClose }) {
  const { user } = useAuth(),
    [input, setInput] = useState(""),
    [messages, setMessages] = useState([]),
    action = useAction();
  async function send(text) {
    if (!text.trim() || action.busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    const data = await action.run(
      async () => (await api.post("/ai/chat", { message: text })).data,
    );
    if (data)
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.answer, label: data.label },
      ]);
  }
  return (
    <div className="assistant-shade">
      <aside
        className="assistant-panel"
        role="dialog"
        aria-modal="true"
        aria-label="AI assistant"
      >
        <header>
          <div className="assistant-symbol">
            <Sparkles size={21} />
          </div>
          <div>
            <h2>Your workspace assistant</h2>
            <p>Answers grounded in your records</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close assistant"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="chat-body">
          {!messages.length && (
            <>
              <h3>A little clarity goes a long way.</h3>
              <p>
                Ask about{" "}
                {user.role === "EMPLOYEE"
                  ? "your leave, attendance or company policy."
                  : "your team, attendance, leave or payroll."}
              </p>
              <div className="chat-suggestions">
                {(user.role === "EMPLOYEE"
                  ? [
                      "How many sick leaves do I have left this year?",
                      "What are the attendance rules?",
                    ]
                  : [
                      "How many active employees do we have?",
                      "Who is on leave today?",
                      "Who came late most often this month?",
                    ]
                ).map((t) => (
                  <button key={t} onClick={() => send(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-message ${m.role}`}>
              {m.role === "assistant" && (
                <span>{m.label || "AI-generated"}</span>
              )}
              <p>{m.text}</p>
            </div>
          ))}
          {action.busy && (
            <p role="status">Checking your authorized records…</p>
          )}
          <Notice>{action.error}</Notice>
        </div>
        <footer>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              aria-label="Ask the assistant"
              placeholder="Ask a question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
            />
            <Button
              aria-label="Send question"
              loading={action.busy}
              disabled={!input.trim()}
            >
              <ArrowUp size={18} />
            </Button>
          </form>
          <small>
            <ShieldCheck size={12} /> Your role controls what the assistant can
            access.
          </small>
        </footer>
      </aside>
    </div>
  );
}
