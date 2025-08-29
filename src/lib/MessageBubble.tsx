import type { Message } from "./types";

function MessageBubble({ message }: { message: Message }) {
  return (
    <div
      className={` p-1 flex justify-center items-center ${
        message.role === "user" ? "text-blue-500" : "text-green-500"
      }`}
    >
      {message.text}
    </div>
  );
}
export default MessageBubble;
