import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/components/ui';

interface ChatMsg {
  id: string;
  from: 'user' | 'bot';
  text: string;
}

/**
 * Placeholder-chat. `onSendMessage` is de centrale haak voor de latere RAG-bot
 * (POST /help/chat). Voorlopig een lokaal canned antwoord dat naar artikelen /
 * ticket leidt.
 */
export function HelpChatPanel() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');

  function onSendMessage(text: string) {
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), from: 'user', text },
      {
        id: crypto.randomUUID(),
        from: 'bot',
        text: 'Bedankt voor je vraag! Bekijk hierboven de relevante artikelen. Lost dat het niet op? Maak dan een ticket aan via de knop onderaan.',
      },
    ]);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    onSendMessage(text);
  }

  return (
    <div className="flex flex-col">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Stel een vraag
      </h3>
      <div className="mb-2 max-h-40 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Typ je vraag — binnenkort beantwoordt onze assistent deze automatisch.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.from === 'user' ? 'text-right' : 'text-left'}>
            <span
              className={`inline-block rounded-lg px-3 py-1.5 text-sm ${
                m.from === 'user'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Typ je vraag…"
        />
        <Button type="submit">Stuur</Button>
      </form>
    </div>
  );
}
