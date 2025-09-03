import React, { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";

// Use environment variable for the deployed server URL
// In development, this will default to localhost:5000
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

// Public STUN server provided by Google
// For production, it's highly recommended to add your own TURN server for reliability
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  // Example of a TURN server configuration:
  // {
  //   urls: "turn:your-turn-server.com:3478",
  //   username: "your-username",
  //   credential: "your-password",
  // },
];

// Constants for file transfer
const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk
const BUFFER_THRESHOLD = 16 * 1024 * 1024; // 16 MB buffer threshold for backpressure

export default function FileShare() {
  const [room, setRoom] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [file, setFile] = useState(null);
  const [receivedFile, setReceivedFile] = useState(null);

  // Refs for persistent objects that don't trigger re-renders
  const socketRef = useRef(null);
  const pcRef = useRef(null); // RTCPeerConnection
  const dcRef = useRef(null); // RTCDataChannel
  const roomRef = useRef(""); // To hold the current room ID for socket listeners

  // Refs for file receiving logic
  const fileInfoRef = useRef({ name: "", size: 0, type: "" });
  const receivedSizeRef = useRef(0);
  const receivedChunksRef = useRef([]);
  // Ref to hold the blob URL for proper cleanup
  const receivedFileUrlRef = useRef(null);

  // Effect to keep the roomRef synchronized with the room state
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Main effect to set up and tear down the socket connection.
  // Runs only once when the component mounts.
  useEffect(() => {
    socketRef.current = io(SOCKET_URL);

    // --- Socket Event Listeners ---

    socketRef.current.on("connect", () => {
      console.log("Connected to signaling server with ID:", socketRef.current.id);
    });

    socketRef.current.on("room-created", (roomId) => {
      console.log("Room created:", roomId);
      setRoom(roomId);
      setStatus(`Room created: ${roomId}. Waiting for peer...`);
      newPC(true); // Host creates the PeerConnection
    });

    socketRef.current.on("peer-joined", async () => {
      console.log("Peer joined, creating offer...");
      setStatus("Peer joined, creating offer...");
      if (pcRef.current) {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer);
        socketRef.current.emit("signal", {
          room: roomRef.current,
          data: { type: "offer", sdp: pcRef.current.localDescription },
        });
      }
    });

    socketRef.current.on("signal", async (msg) => {
      if (!pcRef.current) newPC(false); // Joiner creates PeerConnection on first signal

      console.log("Signal received:", msg.type);

      if (msg.type === "offer") {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socketRef.current.emit("signal", {
          room: roomRef.current,
          data: { type: "answer", sdp: pcRef.current.localDescription },
        });
      } else if (msg.type === "answer") {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      } else if (msg.type === "ice") {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch (e) {
          console.error("Error adding received ICE candidate", e);
        }
      }
    });

    // --- Error Handling Listeners ---
    socketRef.current.on('room-full', () => {
      alert('The room is already full.');
      setStatus('Room is full. Please create a new one.');
    });

    socketRef.current.on('room-not-found', () => {
      alert('Room not found.');
      setStatus('Room not found. Please check the code.');
    });

    // Cleanup function: disconnects socket and closes peer connection on unmount
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (pcRef.current) pcRef.current.close();
      // Clean up blob URL to prevent memory leaks
      if (receivedFileUrlRef.current) {
        URL.revokeObjectURL(receivedFileUrlRef.current);
      }
    };
  }, []); // Empty dependency array ensures this effect runs only once

  // --- WebRTC Setup Functions ---

  const newPC = (isHost) => {
    pcRef.current = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pcRef.current.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current.emit("signal", {
          room: roomRef.current,
          data: { type: "ice", candidate: e.candidate },
        });
      }
    };

    pcRef.current.onconnectionstatechange = () => {
      if (pcRef.current) {
        setStatus("Connection state: " + pcRef.current.connectionState);
      }
    };

    if (isHost) {
      // ✅ FIX: Removed `{ negotiated: true, id: 0 }` to allow for standard in-band negotiation.
      // This ensures the 'ondatachannel' event fires correctly for the remote peer.
      dcRef.current = pcRef.current.createDataChannel("file");
      setupDC();
    } else {
      pcRef.current.ondatachannel = (e) => {
        dcRef.current = e.channel;
        setupDC();
      };
    }
  };

  const setupDC = () => {
    dcRef.current.binaryType = "arraybuffer";
    dcRef.current.onopen = () => setStatus("DataChannel open ✅ Ready to send/receive.");
    dcRef.current.onclose = () => setStatus("DataChannel closed ❌");
    dcRef.current.onerror = (e) => console.error("DataChannel error:", e);

    // Handles incoming messages (file metadata and chunks)
    dcRef.current.onmessage = async (e) => {
      const { data } = e;
      try {
        if (typeof data === "string") {
          const message = JSON.parse(data);
          if (message.type === 'info') {
            fileInfoRef.current = message.payload;
            receivedSizeRef.current = 0;
            receivedChunksRef.current = [];
            setReceivedFile(null); // Reset previous file
            console.log("Receiving file:", fileInfoRef.current);
            setStatus(`Receiving file: ${fileInfoRef.current.name}`);
          } else if (message.type === 'eof') {
            setStatus("File received ✅. Ready for download.");
            const fileBlob = new Blob(receivedChunksRef.current, { type: fileInfoRef.current.type });
            const url = URL.createObjectURL(fileBlob);
            
            // Clean up previous blob URL if it exists
            if (receivedFileUrlRef.current) {
              URL.revokeObjectURL(receivedFileUrlRef.current);
            }
            receivedFileUrlRef.current = url; // Store new URL in ref for cleanup

            setReceivedFile({
              name: fileInfoRef.current.name,
              type: fileInfoRef.current.type,
              size: fileInfoRef.current.size,
              url: url,
            });
            receivedChunksRef.current = []; // Clear buffer
          }
        } else {
          receivedSizeRef.current += data.byteLength;
          receivedChunksRef.current.push(data);
          const percentage = ((receivedSizeRef.current / fileInfoRef.current.size) * 100).toFixed(2);
          setStatus(`Receiving... ${percentage}%`);
        }
      } catch (err) {
        console.error("Error on message:", err);
      }
    };
  };

  // --- User Action Handlers ---

  const host = () => {
    socketRef.current.emit("create-room");
  };

  const join = () => {
    if (!room) return alert("Please enter a room code.");
    socketRef.current.emit("join-room", room);
    setStatus("Joining room...");
  };

  const sendFile = async () => {
    if (!file || !dcRef.current || dcRef.current.readyState !== "open") {
      return alert("Select a file and ensure the connection is open.");
    }
    setStatus("Preparing to send...");
    setReceivedFile(null); // Clear any previously received file on sender side

    // 1. Send file metadata first
    dcRef.current.send(JSON.stringify({
      type: 'info',
      payload: { name: file.name, size: file.size, type: file.type }
    }));

    // 2. Stream the file in chunks
    const fileReader = new FileReader();
    let offset = 0;

    fileReader.onload = async (e) => {
        const chunk = e.target.result;
        
        // Wait if the buffer is full (backpressure)
        if (dcRef.current.bufferedAmount > BUFFER_THRESHOLD) {
            await new Promise(resolve => {
                dcRef.current.onbufferedamountlow = () => {
                    dcRef.current.onbufferedamountlow = null; // Important to clear the listener
                    resolve();
                };
            });
        }
        
        dcRef.current.send(chunk);
        offset += chunk.byteLength;
        
        const percentage = ((offset / file.size) * 100).toFixed(2);
        setStatus(`Sending... ${percentage}%`);

        if (offset < file.size) {
            readSlice(offset);
        } else {
            // 3. Send End-Of-File signal
            dcRef.current.send(JSON.stringify({ type: 'eof' }));
            setStatus("File sent ✅");
        }
    };
    
    fileReader.onerror = (error) => console.error("FileReader error:", error);

    const readSlice = o => {
        const slice = file.slice(o, o + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice);
    };
    readSlice(0);
  };

  const handleDownload = () => {
    if (!receivedFile) return;
    const a = document.createElement('a');
    a.href = receivedFile.url;
    a.download = receivedFile.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // --- JSX Render ---

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', maxWidth: '600px', margin: 'auto' }}>
      <h2 style={{ textAlign: 'center' }}>P2P File Share (WebRTC)</h2>
      <p style={{ textAlign: 'center', color: '#555' }}>Connect with a remote user securely and transfer files directly.</p>
      
      <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <h3>Step 1: Create or Join a Room</h3>
        <button onClick={host} style={{ width: '100%', padding: '10px', marginBottom: '10px' }}>Host New Room</button>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input
            placeholder="Enter room code"
            value={room}
            onChange={(e) => setRoom(e.target.value.trim())}
            style={{ flexGrow: 1, marginRight: '10px', padding: '10px' }}
          />
          <button onClick={join}>Join Room</button>
        </div>
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '16px' }}>
        <h3>Step 2: Select and Send File</h3>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <input type="file" onChange={(e) => setFile(e.target.files[0])} style={{ flexGrow: 1 }}/>
          <button onClick={sendFile}>Send File</button>
        </div>
      </div>
      
      <div style={{ marginTop: '20px', padding: '10px', background: '#f0f0f0', borderRadius: '8px', textAlign: 'center' }}>
        <strong>Status:</strong> {status}
      </div>

      {receivedFile && (
        <div style={{ marginTop: '20px', border: '1px solid #4CAF50', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <h3>File Received!</h3>
          <p><strong>Name:</strong> {receivedFile.name}</p>
          {receivedFile.type.startsWith('image/') && (
            <div style={{ margin: '10px 0' }}>
              <img src={receivedFile.url} alt="File preview" style={{ maxWidth: '100%', maxHeight: '300px', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>
          )}
          <button onClick={handleDownload} style={{ padding: '10px 20px', cursor: 'pointer' }}>
            Download File
          </button>
        </div>
      )}
    </div>
  );
}