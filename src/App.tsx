import "./App.css";
import { useMicVAD } from "@ricky0123/vad-react";

function App() {
  const vad = useMicVAD({
    onSpeechEnd(audio) {
      console.log("User stopped speaking");
    },
  });
  return <></>;
}

export default App;
