import { GoogleGenAI, Modality, Session } from "@google/genai";
import "./App.css";
import { useMicVAD } from "@ricky0123/vad-react";
import { useState, useRef } from "react";

function App() {
  let vad = useMicVAD({
    onSpeechEnd: (audioChunk) => {
      // audioChunks.push(audioChunk);
      console.log("Speech ended, audio chunk:", audioChunk);
    },

    onSpeechRealStart: () => {
      console.log("Speech started");
    },
    startOnLoad: false,
  });

  let sendAudioTimeout: number;
  const [active, setActive] = useState(false);
  const [textInput, setTextInput] = useState("");
  const responseQueue = useRef<any[]>([]);
  let audioChunks: any[] = [];

  const backendUrl = "http://localhost:8000/token";

  async function waitMessage() {
    console.log("response queue", responseQueue.current);
    let done = false;
    let message = undefined;
    while (!done) {
      message = responseQueue.current.shift();
      console.log("Message:", message);
      if (message) {
        done = true;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    return message;
  }

  async function handleTurn() {
    const turns = [];
    let done = false;
    console.log("entering loop");
    while (!done) {
      const message = await waitMessage();
      turns.push(message);
      // console.log("HandleTurn - Message:", message);
      if (
        message &&
        message.serverContent &&
        message.serverContent.turnComplete
      ) {
        done = true;
      }
      // await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.log("exiting loop");
    return turns;
  }

  // Function to fetch token
  async function fetchToken() {
    const response = await fetch(backendUrl, {
      method: "POST",
    });
    const data = await response.json();
    return data.token;
  }

  // Google client setup
  const [ai, setAi] = useState<GoogleGenAI | null>(null);
  const [liveSession, setLiveSession] = useState<Session | null>(null);
  const model = "gemini-live-2.5-flash-preview";
  const config = { responseModalities: [Modality.TEXT] };

  // Function to start session
  // Gets token from backend
  // Starts Live Session with google
  // Start VAD
  async function startSession() {
    console.log(vad.listening);
    const token = await fetchToken();
    console.log("Fetched Token:", token);
    setActive(true);

    // Create AI instance directly
    console.log(token.name);
    const googleAI = new GoogleGenAI({
      apiKey: token.name,
      httpOptions: {
        apiVersion: "v1alpha",
      },
    });
    setAi(googleAI);

    // Start Live Session with Google using the instance directly
    const session = await googleAI.live.connect({
      model: model,
      config: config,
      callbacks: {
        onmessage: (message) => {
          console.log("Received message:", message);
          responseQueue.current.push(message);
          console.log("Updated response queue", responseQueue.current);
        },
        onopen: () => {
          console.log("WebSocket connection opened");
        },
        onclose: () => {
          console.log("WebSocket connection closed");
        },
        onerror: (error) => {
          console.error("Connection error:", error);
        },
      },
    });

    setLiveSession(session);
  }

  // Function to send audio to session

  // Function to send text to session
  async function sendText() {
    if (!liveSession) return;

    // console.log("Sending text:", textInput);

    liveSession.sendClientContent({
      turns: textInput,
    });

    const turns = await handleTurn();

    console.log("Completed turns:", turns);
    for (const turn of turns) {
      if (turn.text) {
        console.log("Received text: %s\n", turn.text);
      } else if (turn.data) {
        console.log("Received inline data: %s\n", turn.data);
      }
    }

    setTextInput("");
  }
  return (
    <>
      <main className="flex flex-col h-full w-2/3">
        <header className="flex justify-between flex-row py-2 ">
          <h3>Interview Demo</h3>
          <p
            className={`flex justify-center items-center gap-2 text-center ${
              active ? "text-green-500" : "text-red-500"
            }`}
          >
            Connection Live{" "}
            <span className="material-symbols-sharp">
              {active ? "toggle_on" : "toggle_off"}
            </span>
          </p>
        </header>
        <section className="flex-1">
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto">
              {/* Messages will be rendered here */}
            </div>
            <div className="p-4">
              {active && (
                <div className=" w-full p-1 flex gap-2">
                  <input
                    id="user-input"
                    type="text"
                    title="user-input"
                    onChange={(e) => setTextInput(e.target.value)}
                    className="w-full bg-blue-950 text-white p-2 rounded-lg focus:outline-none"
                  />
                  <button
                    className="p-2 rounded-full flex justify-center items-center bg-blue-500 text-white hover:bg-blue-600"
                    onClick={sendText}
                  >
                    <span className="material-symbols-sharp">send</span>
                  </button>
                </div>
              )}
              {!active && (
                <button
                  className="bg-blue-500 text-white p-2 rounded flex justify-center items-center mx-auto hover:bg-blue-600"
                  onClick={startSession}
                >
                  Start Interview
                </button>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

export default App;
