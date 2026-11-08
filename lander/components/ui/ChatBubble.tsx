import type { ReactNode } from "react";

/** One chat message. Bot messages sit left on white; the user's sit right in green. */
export function ChatBubble({
  from,
  children,
}: {
  from: "bot" | "user";
  children: ReactNode;
}) {
  return from === "bot" ? (
    <div className="max-w-[86%] self-start rounded-2xl rounded-bl-md border border-divider bg-surface-raised px-3 py-2.5 text-[13px] leading-snug">
      {children}
    </div>
  ) : (
    <div className="max-w-[86%] self-end rounded-2xl rounded-br-md bg-primary px-3 py-2.5 text-[13px] leading-snug text-on-primary">
      {children}
    </div>
  );
}

/** The bot's confirmation card: a question with Confirm and Cancel. */
export function ConfirmCard({
  text,
  actions,
}: {
  text: string;
  actions: [string, string];
}) {
  return (
    <div className="max-w-[92%] self-start rounded-2xl rounded-bl-md border border-divider bg-surface-raised px-3 py-3 text-[13px] leading-snug">
      <p>{text}</p>
      <div className="mt-2.5 flex gap-2">
        <span className="flex-1 rounded-[10px] bg-primary py-2 text-center text-[12.5px] font-medium text-on-primary">
          {actions[0]}
        </span>
        <span className="flex-1 rounded-[10px] border border-border-control py-2 text-center text-[12.5px] font-medium text-ink">
          {actions[1]}
        </span>
      </div>
    </div>
  );
}
