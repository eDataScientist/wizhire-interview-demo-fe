import MessageBubble from "./MessageBubble";
import type { Message } from "./types";

function MessageRow({ message }: { message: Message }) {
  return (
    <div
      className={` w-full flex  ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <MessageBubble message={message} />
    </div>
  );
}

export default MessageRow;
