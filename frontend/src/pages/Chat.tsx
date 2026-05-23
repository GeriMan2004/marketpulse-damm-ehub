/**
 * Chat — placeholder until the smolagents SSE wiring is real.
 *
 * Today: posts to /api/explain-view with the user's question as a
 * "visible_state.user_question" field and renders the bullets back.
 * It's a real LLM call, just not yet a full tool-using agent. The
 * `/api/chat` SSE endpoint exists with canned dialog for demo
 * purposes; we'll replace this when smolagents lands.
 */

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useExplainView } from "@/lib/hooks"

export default function Chat() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([])
  const ask = useExplainView()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const userMsg = input.trim()
    setInput("")
    setMessages(prev => [...prev, { role: "user", text: userMsg }])
    ask.mutate(
      { page: "chat", filters: {}, visible_state: { user_question: userMsg } },
      {
        onSuccess: (data) => {
          const reply = [data.headline, "", ...data.bullets].filter(Boolean).join("\n")
          setMessages(prev => [...prev, { role: "assistant", text: reply }])
        },
      },
    )
  }

  return (
    <div className="px-8 py-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Ask MarketPulse</h1>
        <div className="text-sm text-muted-foreground">
          Conversational deep-dive. Plain English questions about forecasts, gaps, and what to do.
        </div>
      </div>

      <Card className="h-[500px] flex flex-col">
        <CardContent className="flex-1 overflow-y-auto py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              Try: "Why is Estrella in grocery missing target?" or "What's the biggest promo opportunity right now?"
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-line ${
                m.role === "user"
                  ? "bg-primary/15 text-foreground"
                  : "bg-accent/40 text-foreground"
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex justify-start">
              <div className="bg-accent/40 rounded-lg px-4 py-2.5 text-sm italic text-muted-foreground">
                Thinking…
              </div>
            </div>
          )}
        </CardContent>
        <form onSubmit={handleSubmit} className="border-t border-border p-3 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask anything about the UK forecast…"
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
          <Button type="submit" disabled={!input.trim() || ask.isPending}>Send</Button>
        </form>
      </Card>
    </div>
  )
}
