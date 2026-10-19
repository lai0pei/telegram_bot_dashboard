import { motion } from "motion/react";
import { memo } from "react";
import { fadeUp, spring } from "@/components/motion";
import type { BotMessageRow } from "./types";

export const MessageRow = memo(function MessageRow({ message }: { message: BotMessageRow }) {
  const isIncoming = message.direction === "in";
  return (
    <motion.div
      layout
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      exit={fadeUp.exit}
      transition={spring}
      className={`rounded-lg p-2 text-sm ${
        isIncoming ? "mr-auto bg-black/5 dark:bg-white/5" : "ml-auto bg-[var(--primary)]/10"
      } max-w-[85%]`}
    >
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
        <span className="truncate">
          {isIncoming ? message.fromFirstName ?? message.fromUsername ?? message.chatId : "You"} · chat{" "}
          {message.chatId}
        </span>
        <span className="shrink-0">{new Date(message.createdAt).toLocaleString()}</span>
      </div>
      <div className="break-words">{message.text}</div>
    </motion.div>
  );
});
