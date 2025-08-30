import { GoogleGenAI, Modality, Session } from "@google/genai";
import "./App.css";
import { useMicVAD } from "@ricky0123/vad-react";
import { useState, useRef } from "react";
import type { Message } from "./lib/types";
import { WaveFile } from "wavefile";
import MessageRow from "./lib/MessageRow";

function App() {
  let vad = useMicVAD({
    onSpeechEnd: (audioChunk) => {
      // audioChunks.push(audioChunk);
      console.log("Speech ended, audio chunk:", audioChunk);
      const audioBuffer = new Float32Array(audioChunk.buffer);
      const wf = new WaveFile();
      wf.fromScratch(1, 16000, "32f", audioBuffer);
      wf.toBitDepth("16");

      const audiob64 = wf.toBase64();

      sendAudio(audiob64)
        .then(() => {
          console.log("Audio sent successfully");
        })
        .catch((error) => {
          console.error("Error sending audio:", error);
        });
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
  const [messageHistory, setMessageHistory] = useState<Message[]>([]);
  const audioCtx = new AudioContext();
  let audioChunks: any[] = [];

  const backendUrl = "http://localhost:8000/token";

  async function playAudioChunks(wf: WaveFile) {
    wf.toSampleRate(44100);
    const url = wf.toDataURI();
    const audio = new Audio(url);

    audio.play().catch((error) => {
      console.error("Error playing audio:", error);
    });

    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
    });
  }

  async function waitMessage() {
    // console.log("response queue", responseQueue.current);
    let done = false;
    let message = undefined;
    while (!done) {
      message = responseQueue.current.shift();
      // console.log("Message:", message);
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
    // console.log("entering loop");
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
    // console.log("exiting loop");
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
  const config = { responseModalities: [Modality.AUDIO] };

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
          // console.log("Received message:", message);
          responseQueue.current.push(message);
          // console.log("Updated response queue", responseQueue.current);
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
    vad.start();
  }

  // Function to send audio to session
  async function sendAudio(audioB64: string) {
    if (!liveSession) return;

    liveSession.sendRealtimeInput({
      audio: {
        data: audioB64,
        mimeType: "audio/pcm;rate=16000",
      },
    });

    await processAudioTurn();
  }

  // Function to send text to session
  async function sendText() {
    if (!liveSession) return;

    // console.log("Sending text:", textInput);

    liveSession.sendClientContent({
      turns: textInput,
    });

    await processAudioTurn();

    setTextInput("");
  }

  async function displayTextMessage(turns: any[]) {
    let responseMsg = "";

    for (const turn of turns) {
      if (turn.text) {
        responseMsg += turn.text;
      } else {
        // responseMsg += `Received inline data: ${turn.data}\n`;
        continue;
      }
    }

    console.log(responseMsg);
    setMessageHistory((prev) => [
      ...prev,
      { role: "model", text: responseMsg },
    ]);
  }

  async function processAudioTurn() {
    const turns = await handleTurn();

    // setMessageHistory((prev) => [...prev, { role: "user", text: textInput }]);

    // Combine audio data strings and save as wave file
    const combinedAudio = turns.reduce((acc, turn) => {
      if (turn.data) {
        // Browser-compatible base64 decoding
        const binaryString = atob(turn.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const intArray = new Int16Array(bytes.buffer);
        return acc.concat(Array.from(intArray));
      }
      return acc;
    }, []);

    const audioBuffer = new Int16Array(combinedAudio);
    const wf = new WaveFile();
    wf.fromScratch(1, 24000, "16", audioBuffer);
    wf.toSampleRate(44100);

    // Create blob URL from WaveFile and play it
    const waveBuffer = wf.toBuffer();
    const blob = new Blob([new Uint8Array(waveBuffer)], { type: "audio/wav" });
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.play();

    // Clean up the URL when done
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(audioUrl);
    });
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
              {messageHistory.map((msg, index) => (
                <MessageRow key={index} message={msg} />
              ))}
            </div>
            <div className="p-4">
              {active && (
                <div className=" w-full p-1 flex gap-2">
                  <p>User Speaking: {vad.userSpeaking}</p>
                  {/* <input
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
                  </button> */}
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
