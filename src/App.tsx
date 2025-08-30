import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
} from "@google/genai";
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
      const startTime = performance.now();
      console.log(`[${startTime.toFixed(2)}ms] Speech ended`);

      const audioBuffer = new Float32Array(audioChunk.buffer);
      const wf = new WaveFile();
      wf.fromScratch(1, 16000, "32f", audioBuffer);

      const wavefileTime = performance.now();
      console.log(
        `[${wavefileTime.toFixed(2)}ms] Created wavefile - to send. (${(
          wavefileTime - startTime
        ).toFixed(2)}ms)`
      );

      wf.toBitDepth("16");

      const audiob64 = wf.toBase64();
      const encodedTime = performance.now();
      console.log(
        `[${encodedTime.toFixed(2)}ms] Encoded Audio (${(
          encodedTime - wavefileTime
        ).toFixed(2)}ms)`
      );

      sendAudio(audiob64)
        .then(() => {
          const sentTime = performance.now();
          console.log(
            `[${sentTime.toFixed(2)}ms] Audio sent successfully (${(
              sentTime - encodedTime
            ).toFixed(2)}ms)`
          );
        })
        .catch((error) => {
          console.error("Error sending audio:", error);
        });
    },

    onSpeechRealStart: () => {
      const speechStartTime = performance.now();
      console.log(`[${speechStartTime.toFixed(2)}ms] Speech started`);
    },
    startOnLoad: false,
  });

  let sendAudioTimeout: number;
  const [active, setActive] = useState(false);
  const [textInput, setTextInput] = useState("");
  const responseQueue = useRef<any[]>([]);
  const [messageHistory, setMessageHistory] = useState<Message[]>([]);
  const firstMessageTime = useRef<number | null>(null);
  const lastMessageTime = useRef<number | null>(null);
  const audioPlaying = useRef<boolean>(false);
  const audioPlaybackQueue = useRef<Int16Array>(new Int16Array(0));
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
    const turnStartTime = performance.now();
    console.log(`[${turnStartTime.toFixed(2)}ms] Starting turn handling`);
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
        const turnCompleteTime = performance.now();
        console.log(
          `[${turnCompleteTime.toFixed(2)}ms] Turn complete detected (${(
            turnCompleteTime - turnStartTime
          ).toFixed(2)}ms turn duration)`
        );
        if (lastMessageTime.current && firstMessageTime.current) {
          console.log(
            `[${turnCompleteTime.toFixed(
              2
            )}ms] Message span: first at ${firstMessageTime.current.toFixed(
              2
            )}ms, last at ${lastMessageTime.current.toFixed(2)}ms (${(
              lastMessageTime.current - firstMessageTime.current
            ).toFixed(2)}ms total)`
          );
        }
      }
      // await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    const turnEndTime = performance.now();
    console.log(
      `[${turnEndTime.toFixed(2)}ms] Turn handling complete (${(
        turnEndTime - turnStartTime
      ).toFixed(2)}ms total)`
    );
    // Reset message timing for next turn
    firstMessageTime.current = null;
    lastMessageTime.current = null;
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
  const model = "gemini-2.5-flash-preview-native-audio-dialog";
  const config = { responseModalities: [Modality.AUDIO] };

  // Function to start session
  // Gets token from backend
  // Starts Live Session with google
  // Start VAD
  async function startSession() {
    const sessionStartTime = performance.now();
    console.log(
      `[${sessionStartTime.toFixed(2)}ms] Starting session - VAD listening: ${
        vad.listening
      }`
    );
    const token = await fetchToken();
    const tokenFetchTime = performance.now();
    console.log(
      `[${tokenFetchTime.toFixed(2)}ms] Fetched Token (${(
        tokenFetchTime - sessionStartTime
      ).toFixed(2)}ms):`,
      token
    );
    setActive(true);

    // Create AI instance directly
    const aiCreationStartTime = performance.now();
    console.log(
      `[${aiCreationStartTime.toFixed(2)}ms] Creating AI instance with token: ${
        token.name
      }`
    );
    const googleAI = new GoogleGenAI({
      apiKey: token.name,
      httpOptions: {
        apiVersion: "v1alpha",
      },
    });
    setAi(googleAI);
    const aiSetTime = performance.now();
    console.log(
      `[${aiSetTime.toFixed(2)}ms] AI instance created and set (${(
        aiSetTime - aiCreationStartTime
      ).toFixed(2)}ms)`
    );

    // Start Live Session with Google using the instance directly
    const session = await googleAI.live.connect({
      model: model,
      config: config,
      callbacks: {
        onmessage: (message) => {
          const messageTime = performance.now();

          if (firstMessageTime.current === null) {
            firstMessageTime.current = messageTime;
            console.log(
              `[${messageTime.toFixed(
                2
              )}ms] First message received from server:`,
              message
            );
          } else {
            console.log(
              `[${messageTime.toFixed(2)}ms] Message received from server:`,
              message
            );
          }
          lastMessageTime.current = messageTime;
          // responseQueue.current.push(message);
          // console.log("Updated response queue", responseQueue.current);
          console.log("Playing audio chunk");
          // Play the audio chunk here
          processAudioChunk(message).catch((error) => {
            console.error("Error processing audio chunk:", error);
          });
        },
        onopen: () => {
          const connectionOpenTime = performance.now();
          console.log(
            `[${connectionOpenTime.toFixed(
              2
            )}ms] WebSocket connection opened (${(
              connectionOpenTime - sessionStartTime
            ).toFixed(2)}ms from session start)`
          );
        },
        onclose: () => {
          const connectionCloseTime = performance.now();
          console.log(
            `[${connectionCloseTime.toFixed(2)}ms] WebSocket connection closed`
          );
        },
        onerror: (error) => {
          const errorTime = performance.now();
          console.error(`[${errorTime.toFixed(2)}ms] Connection error:`, error);
        },
      },
    });

    setLiveSession(session);
    const sessionSetTime = performance.now();
    console.log(
      `[${sessionSetTime.toFixed(2)}ms] Live session created and set (${(
        sessionSetTime - aiSetTime
      ).toFixed(2)}ms)`
    );
    vad.start();
    const vadStartTime = performance.now();
    console.log(
      `[${vadStartTime.toFixed(2)}ms] VAD started (${(
        vadStartTime - sessionStartTime
      ).toFixed(2)}ms total session setup time)`
    );
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
    const audioSentTime = performance.now();
    console.log(`[${audioSentTime.toFixed(2)}ms] Audio sent`);

    // await processAudioTurn();
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

    const messageDisplayTime = performance.now();
    console.log(
      `[${messageDisplayTime.toFixed(2)}ms] Displaying text message:`,
      responseMsg
    );
    setMessageHistory((prev) => [
      ...prev,
      { role: "model", text: responseMsg },
    ]);
  }

  async function processAudioChunk(turnData: LiveServerMessage) {
    if (turnData.serverContent?.generationComplete) {
      // Handle the case when the generation is complete
      audioPlaying.current = false;
    }
    if (!turnData?.data) {
      console.log("No data here");
      return;
    }

    const binaryString = atob(turnData.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const intArray = new Int16Array(bytes.buffer);

    if (audioPlaying.current) {
      const newQueue = new Int16Array(
        audioPlaybackQueue.current.length + intArray.length
      );
      newQueue.set(audioPlaybackQueue.current);
      newQueue.set(intArray, audioPlaybackQueue.current.length);
      audioPlaybackQueue.current = newQueue;
      return;
    } else {
      audioPlaying.current = true;
    }
    // const audioBuffer = new Int16Array(intArray);
    const wf = new WaveFile();
    wf.fromScratch(1, 24000, "16", intArray);
    wf.toSampleRate(44100);

    // Create blob URL from WaveFile and play it
    const waveBuffer = wf.toBuffer();
    const blob = new Blob([new Uint8Array(waveBuffer)], { type: "audio/wav" });
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.addEventListener("ended", () => {
      console.log("Audio playback ended");
      URL.revokeObjectURL(audioUrl);
      const audioPlaybackQueueTemp: Int16Array = Int16Array.from(
        audioPlaybackQueue.current
      );
      // flush the queue
      audioPlaybackQueue.current = new Int16Array(0);
      processAudioQueue(audioPlaybackQueueTemp)
        .then(() => {
          console.log("Processed audio playback queue");
        })
        .catch((error) => {
          console.error("Error processing audio playback queue:", error);
        });
    });
    audio.play();

    // Clean up the URL when done
  }

  async function processAudioQueue(audioBuffer: Int16Array) {
    if (!audioPlaying.current) return;
    if (!audioBuffer || audioBuffer.length === 0) return;

    const wf = new WaveFile();
    wf.fromScratch(1, 24000, "16", audioBuffer);
    wf.toSampleRate(44100);

    // Create blob URL from WaveFile and play it
    const waveBuffer = wf.toBuffer();
    const blob = new Blob([new Uint8Array(waveBuffer)], { type: "audio/wav" });
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);

    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(audioUrl);
      const audioPlaybackQueueTemp: Int16Array = Int16Array.from(
        audioPlaybackQueue.current
      );
      // flush the queue
      audioPlaybackQueue.current = new Int16Array(0);
      processAudioQueue(audioPlaybackQueueTemp)
        .then(() => {
          console.log("Processed audio playback queue");
        })
        .catch((error) => {
          console.error("Error processing audio playback queue:", error);
        });
    });
    audio.play();
  }

  async function processAudioTurn() {
    const processingStartTime = performance.now();
    console.log(
      `[${processingStartTime.toFixed(2)}ms] Starting audio turn processing`
    );
    const turns = await handleTurn();
    const turnsHandledTime = performance.now();
    console.log(
      `[${turnsHandledTime.toFixed(2)}ms] Processed Audio Turns (${(
        turnsHandledTime - processingStartTime
      ).toFixed(2)}ms):`,
      turns
    );

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
    const audioBufferTime = performance.now();
    console.log(
      `[${audioBufferTime.toFixed(2)}ms] Combined audio buffer length: ${
        audioBuffer.length
      }`
    );
    const wf = new WaveFile();
    wf.fromScratch(1, 24000, "16", audioBuffer);
    wf.toSampleRate(44100);
    const waveFileTime = performance.now();
    console.log(
      `[${waveFileTime.toFixed(2)}ms] Created wavefile (${(
        waveFileTime - audioBufferTime
      ).toFixed(2)}ms)`
    );

    // Create blob URL from WaveFile and play it
    const waveBuffer = wf.toBuffer();
    const blob = new Blob([new Uint8Array(waveBuffer)], { type: "audio/wav" });
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    const audioPlayTime = performance.now();
    console.log(
      `[${audioPlayTime.toFixed(2)}ms] Playing audio response (${(
        audioPlayTime - processingStartTime
      ).toFixed(2)}ms total processing time)`
    );
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
