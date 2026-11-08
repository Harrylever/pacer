import Image from "next/image";
import { copy } from "@/content/landing";
import { chatSchedule } from "@/components/islands/chat-schedule";
import { ChatBubble, ConfirmCard } from "@/components/ui/ChatBubble";

/**
 * The bot conversation shown in the hero phone. Every message is in the
 * server HTML and takes its space from the start (so nothing shifts); a CSS
 * timeline then plays them in, with typing dots before each bot message.
 * With no JavaScript the timeline still plays; with reduced motion the whole
 * conversation is simply shown.
 */
export function Chat() {
  const schedule = chatSchedule(false);
  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-divider bg-surface-raised px-4 pb-3 pt-2">
        <Image
          src="/brand/pacer-mark.svg"
          alt=""
          width={30}
          height={30}
          unoptimized
        />
        <div>
          <div className="font-display text-[17px] font-medium leading-tight">
            Pacer
          </div>
          <div className="text-[11px] leading-tight text-ink-muted">bot</div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 px-3 py-3.5">
        {copy.chat.map((message) => {
          const step = schedule.find((s) => s.id === message.id)!;
          return (
            <div
              key={message.id}
              className="grid [&>*]:col-start-1 [&>*]:row-start-1"
              style={
                {
                  "--show": `${step.showAt}ms`,
                  "--typing": `${step.typingAt ?? 0}ms`,
                } as React.CSSProperties
              }
            >
              {step.typingAt !== null && (
                <div
                  className="chat-typing self-start justify-self-start"
                  aria-hidden="true"
                >
                  <i />
                  <i />
                  <i />
                </div>
              )}
              <div
                className={`chat-msg flex ${message.from === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.actions ? (
                  <ConfirmCard text={message.text} actions={message.actions} />
                ) : (
                  <ChatBubble from={message.from}>{message.text}</ChatBubble>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
