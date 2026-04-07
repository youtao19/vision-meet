const assistantMessages: string[] = [];
const unsubscribe = session.subscribe((ev) => {
  if (ev.type === "message_update") {
    if (
      (ev.message as { role?: unknown }).role === "assistant" &&
      ev.assistantMessageEvent.type === "text_delta"
    ) {
      assistantMessages.push(ev.assistantMessageEvent.delta);
    }
  }
});
