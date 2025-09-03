//frontend
import React, { useState, useRef, useEffect } from 'react';
import { io } from "socket.io-client";

// --- Configuration ---
const SOCKET_URL = "https://fileshare-backend-ovft.onrender.com"
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const CHUNK_SIZE = 64 * 1024; // 64 KB
const HIGH_WATER_MARK = 16 * 1024 * 1024; // 16 MB buffer threshold

// =================================================================
// =================== UI COMPONENTS (UNCHANGED) ===================
// =================================================================

const Toaster = ({ message, onClear }) => {
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => {
                onClear();
            }, 3000); // Clear message after 3 seconds
            return () => clearTimeout(timer);
        }
    }, [message, onClear]);

    if (!message) return null;

    return (
        <div className="fixed top-5 right-5 bg-green-500 text-white py-2 px-4 rounded-lg shadow-lg animate-fade-in-down z-50">
            {message}
        </div>
    );
};

const FileList = ({ title, files }) => (
    <div className="mt-4 text-left">
        <h3 className="font-semibold text-gray-700">{title}</h3>
        {files.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">No files yet.</p>
        ) : (
            <div className="mt-2 space-y-2 max-h-32 sm:max-h-40 overflow-y-auto pr-2">
                {files.map(file => {
                    const fileSize = (file.size / 1024 / 1024).toFixed(2); // size in MB
                    return (
                        <div key={file.name} className="flex items-center justify-between p-2 bg-gray-50 rounded-md shadow-sm">
                            <div>
                                <p className="text-sm font-medium text-gray-800 truncate max-w-[150px] sm:max-w-[200px]">{file.name}</p>
                                <p className="text-xs text-gray-500">{fileSize} MB</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
    </div>
);


const WavyBackground = () => (
    <div className="absolute inset-0 overflow-hidden bg-[#4A79EE]">
        <svg className="absolute top-0 left-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ opacity: 0.1, transform: 'scale(1.5)', transformOrigin: 'center' }}>
            <path d="M-20,0 Q-10,20 0,0 T20,0 T40,0 T60,0 T80,0 T100,0 T120,0 V100 H-20 Z" fill="#FFFFFF" />
            <path d="M-20,10 Q-10,30 0,10 T20,10 T40,10 T60,10 T80,10 T100,10 T120,10 V110 H-20 Z" fill="#FFFFFF" />
            <path d="M-20,20 Q-10,40 0,20 T20,20 T40,20 T60,20 T80,20 T100,20 T120,20 V120 H-20 Z" fill="#FFFFFF" />
        </svg>
    </div>
);

const LogoIcon = () => (<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="18" fill="white" /><path d="M18 9C13.0294 9 9 13.0294 9 18C9 22.9706 13.0294 27 18 27C22.9706 27 27 22.9706 27 18C27 13.0294 22.9706 9 18 9ZM18 21C16.3431 21 15 19.6569 15 18C15 16.3431 16.3431 15 18 15C19.6569 15 21 16.3431 21 18C21 19.6569 19.6569 21 18 21Z" fill="#4A79EE" /></svg>);
const UploadIcon = () => (<svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 4v16m8-8H4"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M15.5 8.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 12.5a.5.5 0 100-1 .5.5 0 000 1z"></path></svg>);
const SuccessIcon = () => (<svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>);
const CopyIcon = () => (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>);
const CancelIcon = () => (<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>);

const Header = () => (
    <header className="flex justify-between items-center p-4 md:p-6 w-full max-w-7xl mx-auto text-white">
        <div className="flex items-center space-x-3">
            <LogoIcon />
            <span className="font-bold text-xl sm:text-2xl">Duplin</span>
        </div>
    </header>
);

const FileUploadView = ({ onFilesSelected, setView }) => {
    const [isDragging, setIsDragging] = React.useState(false);
    const fileInputRef = React.useRef(null);

    const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesSelected(Array.from(e.dataTransfer.files));
        }
    };
    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(Array.from(e.target.files));
        }
    };
    const openFileDialog = () => fileInputRef.current?.click();

    return (
        <div className="text-center text-white w-full px-4">
            <h1 className="text-4xl md:text-6xl font-bold mb-4">Send super big files</h1>
            <p className="text-base md:text-xl opacity-80">Simple. Fast. Beautiful.</p>
            <div
                className={`mt-8 sm:mt-12 mx-auto w-full max-w-2xl p-6 sm:p-8 bg-white/95 rounded-2xl shadow-2xl backdrop-blur-sm cursor-pointer border-4 border-dashed transition-all duration-300 ${isDragging ? 'border-blue-400 scale-105' : 'border-white/50'}`}
                onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop} onClick={openFileDialog}
            >
                <div className="flex flex-col items-center justify-center space-y-4 h-48 sm:h-56">
                    <UploadIcon />
                    <p className="text-xl sm:text-2xl font-semibold text-gray-700">Drop your file here to share</p>
                    <p className="text-gray-500">or click to browse</p>
                </div>
                <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
            </div>
            <p className="mt-8">
                <button onClick={() => setView('receiving')} className="text-white opacity-80 hover:opacity-100 underline">
                    Or receive a file?
                </button>
            </p>
        </div>
    );
};

const SharingView = ({ myFiles, peerFiles, shareLink, downloadCode, status, isConnected, onAddFiles, onDownloadAll, isDownloading, onCancel, downloadProgress }) => {
    const [copied, setCopied] = React.useState(false);
    const addFilesInputRef = useRef(null);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(shareLink).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(err => console.error('Failed to copy!', err));
    };

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            onAddFiles(Array.from(e.target.files));
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-md text-center relative">
            <button onClick={onCancel} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors z-10">
                <CancelIcon />
            </button>
            <SuccessIcon />
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mt-4">Ready to Share!</h2>
            <p className="text-gray-600 mt-2">Share the link or code below.</p>

            <div className="mt-6 bg-gray-100 rounded-lg p-3 flex items-center justify-between">
                <span className="text-blue-600 font-mono text-sm truncate pr-2">{shareLink}</span>
                <button onClick={copyToClipboard} className="bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 transition-colors">
                    {copied ? 'Copied!' : <CopyIcon />}
                </button>
            </div>
            <div className="mt-4">
                <p className="text-gray-500">Or use this download code:</p>
                <p className="text-3xl sm:text-4xl font-bold tracking-widest text-gray-800 mt-2">{downloadCode}</p>
            </div>

            <FileList title="Your Files" files={myFiles} />

            {isConnected && (
                <>
                    <FileList title="Remote User's Files" files={peerFiles} />
                    {peerFiles.length > 0 && (
                        <button
                            onClick={onDownloadAll}
                            disabled={isDownloading}
                            className={`mt-4 w-full font-bold py-3 rounded-lg transition-colors relative overflow-hidden ${isDownloading ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'
                                }`}
                        >
                            {isDownloading ? (
                                <>
                                    <div
                                        className="absolute top-0 left-0 h-full bg-blue-400 transition-all duration-150"
                                        style={{ width: `${downloadProgress}%` }}
                                    ></div>
                                    <span className="relative z-10 text-white">Downloading... {downloadProgress}%</span>
                                </>
                            ) : (
                                'Download All Files'
                            )}
                        </button>
                    )}
                    <button onClick={() => addFilesInputRef.current?.click()} className="mt-4 w-full bg-green-500 text-white font-bold py-3 rounded-lg hover:bg-green-600 transition-colors">
                        Add & Share More Files
                    </button>
                    <input type="file" multiple ref={addFilesInputRef} className="hidden" onChange={handleFileSelect} />
                </>
            )}

            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-blue-800 text-sm">
                <strong>Status:</strong> {status}
            </div>
        </div>
    );
};


const ReceiverView = ({ onJoin, status, isConnected, peerFiles, myFiles, onAddFiles, onDownloadAll, isDownloading, onCancel, downloadProgress }) => {
    const [inputCode, setInputCode] = useState('');
    const addFilesInputRef = useRef(null);

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            onAddFiles(Array.from(e.target.files));
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-md text-center relative">
            {isConnected && (
                <button onClick={onCancel} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors z-10">
                    <CancelIcon />
                </button>
            )}
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-800">Receive a File</h2>

            {!isConnected ? (
                <>
                    <p className="text-gray-600 mt-2">Enter the 4-digit code from the sender.</p>
                    <div className="mt-6 flex items-center space-x-2">
                        <input
                            type="text"
                            maxLength="4"
                            value={inputCode}
                            onChange={(e) => setInputCode(e.target.value.trim())}
                            placeholder="1234"
                            className="w-full text-center text-2xl font-mono p-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition"
                        />
                        <button
                            onClick={() => onJoin(inputCode)}
                            className="bg-blue-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Receive
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <p className="text-gray-600 mt-2">Connection successful!</p>
                    <FileList title="Files to Download" files={peerFiles} />
                    {peerFiles.length > 0 && (
                        <button
                            onClick={onDownloadAll}
                            disabled={isDownloading}
                            className={`mt-4 w-full font-bold py-3 rounded-lg transition-colors relative overflow-hidden ${isDownloading ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'
                                }`}
                        >
                            {isDownloading ? (
                                <>
                                    <div
                                        className="absolute top-0 left-0 h-full bg-blue-400 transition-all duration-150"
                                        style={{ width: `${downloadProgress}%` }}
                                    ></div>
                                    <span className="relative z-10 text-white">Downloading... {downloadProgress}%</span>
                                </>
                            ) : (
                                'Download All Files'
                            )}
                        </button>
                    )}
                    <FileList title="Your Files" files={myFiles} />
                    <button onClick={() => addFilesInputRef.current?.click()} className="mt-4 w-full bg-green-500 text-white font-bold py-3 rounded-lg hover:bg-green-600 transition-colors">
                        Add & Share Files
                    </button>
                    <input type="file" multiple ref={addFilesInputRef} className="hidden" onChange={handleFileSelect} />
                </>
            )}

            <div className="mt-6 p-3 bg-gray-100 rounded-lg text-gray-800 min-h-[50px] text-sm">
                <strong>Status:</strong> {status}
            </div>
        </div>
    );
}

// =================================================================
// ============== MAIN APP COMPONENT WITH WEBRTC LOGIC =============
// =================================================================

export default function App() {
    // UI State
    const [view, setView] = useState('upload');
    const [status, setStatus] = useState("Waiting to start...");
    const [downloadCode, setDownloadCode] = useState('');
    const [shareLink, setShareLink] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [toaster, setToaster] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    const [isHost, setIsHost] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);

    // File Management State
    const [myFiles, setMyFiles] = useState([]);
    const [peerFiles, setPeerFiles] = useState([]);
    const [downloadedBlobs, setDownloadedBlobs] = useState({});

    // WebRTC & Socket State (using refs)
    const socketRef = useRef(null);
    const pcRef = useRef(null);
    const dcRef = useRef(null);
    const roomRef = useRef('');
    const myFilesRef = useRef(myFiles);

    // Refs for receiving file chunks
    const receivingFileRef = useRef(null);
    const receivedChunksRef = useRef([]);
    const totalDownloadSizeRef = useRef(0);
    const totalReceivedSizeRef = useRef(0);

    useEffect(() => {
        myFilesRef.current = myFiles;
    }, [myFiles]);

    const initializeSocket = () => {
        if (socketRef.current) {
            socketRef.current.off(); // Remove all event listeners
            socketRef.current.disconnect();
        }

        // const socket = io(SOCKET_URL);
        const socket = io(SOCKET_URL, {
            transports: ["websocket"],
            secure: true,
        });

        socketRef.current = socket;

        socket.on("connect", () => console.log("Connected:", socket.id));

        socket.on("room-created", (roomId) => {
            roomRef.current = roomId;
            setDownloadCode(roomId);
            setShareLink(`${window.location.origin}/receive/${roomId}`);
            setStatus(`Room ${roomId} created. Waiting for peer...`);
            setIsHost(true);
            newPC(true);
            setView('sharing');
        });

        socket.on("peer-joined", async () => {
            setStatus("Peer joined. Establishing connection...");
            if (pcRef.current) {
                const offer = await pcRef.current.createOffer();
                await pcRef.current.setLocalDescription(offer);
                socket.emit("signal", { room: roomRef.current, data: { type: "offer", sdp: pcRef.current.localDescription } });
            }
        });

        socket.on("peer-left", () => {
            setStatus("Peer left. Waiting for a new connection...");
            pcRef.current?.close();
            newPC(true); // Re-initialize as host waiting for new peer
        });

        socket.on("session-cancelled", () => {
            setToaster("The session was ended by the host.");
            handleResetState(true);
        });

        socket.on("signal", async (msg) => {
            if (!pcRef.current) newPC(false);

            if (msg.type === "offer") {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                const answer = await pcRef.current.createAnswer();
                await pcRef.current.setLocalDescription(answer);
                socket.emit("signal", { room: roomRef.current, data: { type: "answer", sdp: pcRef.current.localDescription } });
            } else if (msg.type === "answer") {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            } else if (msg.type === "ice") {
                try {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
                } catch (e) { console.error("ICE candidate error", e); }
            }
        });

        socket.on('room-full', () => setStatus('Error: Session is full.'));
        socket.on('room-not-found', () => setStatus('Error: Share code not found.'));
    };

    const handleResetState = (reinitializeSocket = true) => {
        pcRef.current?.close();
        pcRef.current = null;
        dcRef.current = null;

        setIsConnected(false);
        setIsDownloading(false);
        setMyFiles([]);
        setPeerFiles([]);
        setDownloadedBlobs({});
        setDownloadCode('');
        setShareLink('');
        setIsHost(false);
        setDownloadProgress(0);
        setStatus("Waiting to start...");
        setView('upload');

        if (reinitializeSocket) {
            initializeSocket();
        }
    };

    useEffect(() => {
        initializeSocket();

        const path = window.location.pathname;
        if (path.startsWith('/receive/')) {
            const roomFromUrl = path.split('/')[2];
            if (roomFromUrl) {
                setView('receiving');
                setTimeout(() => handleJoin(roomFromUrl), 100);
            }
        }

        return () => {
            socketRef.current?.disconnect();
        };
    }, []);

    const newPC = (isHost) => {
        pcRef.current = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current.onicecandidate = (e) => {
            if (e.candidate) socketRef.current.emit("signal", { room: roomRef.current, data: { type: "ice", candidate: e.candidate } });
        };
        pcRef.current.onconnectionstatechange = () => {
            const state = pcRef.current?.connectionState;
            setStatus("Connection: " + state);
            setIsConnected(state === 'connected');
            if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                if (isHost) {
                    pcRef.current?.close();
                    newPC(true);
                    setStatus("Peer disconnected. Waiting for a new one...");
                }
            }
        };
        if (isHost) {
            dcRef.current = pcRef.current.createDataChannel("file-transfer");
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
        dcRef.current.onopen = () => shareMyFileList();
        dcRef.current.onclose = () => {
            setIsConnected(false);
            setPeerFiles([]);
        };
        dcRef.current.onerror = (e) => console.error("DC error:", e);
        dcRef.current.onmessage = handleDataChannelMessage;
    };

    const handleDataChannelMessage = (e) => {
        const { data } = e;
        try {
            if (typeof data === "string") {
                const message = JSON.parse(data);
                if (message.type === 'file-list') setPeerFiles(message.payload);
                else if (message.type === 'request-file') sendFile(message.payload.name);
                else if (message.type === 'info') {
                    receivingFileRef.current = { ...message.payload };
                    receivedChunksRef.current = [];
                } else if (message.type === 'eof') {
                    const file = receivingFileRef.current;
                    if (!file) return;
                    const fileBlob = new Blob(receivedChunksRef.current, { type: file.type });
                    const url = URL.createObjectURL(fileBlob);
                    setDownloadedBlobs(prev => ({ ...prev, [file.name]: url }));
                    receivingFileRef.current = null;
                } else if (message.type === 'download-complete') {
                    setToaster("Files sent successfully!");
                    setMyFiles([]);
                }
            } else {
                if (receivingFileRef.current) {
                    receivedChunksRef.current.push(data);
                    totalReceivedSizeRef.current += data.byteLength;
                    if (totalDownloadSizeRef.current > 0) {
                        const percent = Math.round((totalReceivedSizeRef.current / totalDownloadSizeRef.current) * 100);
                        setDownloadProgress(percent);
                    }
                }
            }
        } catch (err) { console.error("Message error:", err); }
    };

    useEffect(() => {
        if (peerFiles.length > 0 && Object.keys(downloadedBlobs).length === peerFiles.length) {
            setToaster("Download finished!");
            Object.entries(downloadedBlobs).forEach(([name, url]) => {
                const a = document.createElement('a'); a.href = url; a.download = name;
                document.body.appendChild(a); a.click(); a.remove();
            });
            if (dcRef.current?.readyState === 'open') {
                dcRef.current.send(JSON.stringify({ type: 'download-complete' }));
            }
            setPeerFiles([]);
            setDownloadedBlobs({});
            setIsDownloading(false);
            setDownloadProgress(0);
            totalDownloadSizeRef.current = 0;
            totalReceivedSizeRef.current = 0;
        }
    }, [downloadedBlobs, peerFiles]);

    const sendFile = (fileName) => {
        const fileData = myFilesRef.current.find(f => f.name === fileName);
        if (!fileData) {
            console.error(`File ${fileName} not found.`);
            return;
        }

        const file = fileData.file;
        if (!file || !dcRef.current || dcRef.current.readyState !== "open") {
            return;
        }

        dcRef.current.send(JSON.stringify({ type: 'info', payload: { name: file.name, size: file.size, type: file.type } }));

        const fileReader = new FileReader();
        let offset = 0;
        let isReading = false;

        const readSlice = (o) => {
            if (isReading) return;
            isReading = true;
            const slice = file.slice(o, o + CHUNK_SIZE);
            fileReader.readAsArrayBuffer(slice);
        };

        dcRef.current.onbufferedamountlow = () => {
            if (offset < file.size) {
                readSlice(offset);
            }
        };

        fileReader.onload = (e) => {
            isReading = false;
            if (!dcRef.current || dcRef.current.readyState !== "open") return;

            try {
                dcRef.current.send(e.target.result);
                offset += e.target.result.byteLength;

                if (offset < file.size) {
                    if (dcRef.current.bufferedAmount < HIGH_WATER_MARK) {
                        readSlice(offset);
                    }
                } else {
                    dcRef.current.send(JSON.stringify({ type: 'eof' }));
                }
            } catch (error) {
                console.error("Send error:", error);
            }
        };

        fileReader.onerror = () => {
            isReading = false;
            console.error("FileReader error.");
        };

        readSlice(0);
    };

    const handleFilesSelected = (selectedFiles) => {
        setMyFiles(selectedFiles.map(file => ({ file, name: file.name, size: file.size, type: file.type })));
        socketRef.current.emit("create-room");
    };

    const handleAddFiles = (newFiles) => {
        const filesToAdd = newFiles
            .filter(nf => !myFiles.some(mf => mf.name === nf.name))
            .map(file => ({ file, name: file.name, size: file.size, type: file.type }));
        if (filesToAdd.length > 0) setMyFiles(prev => [...prev, ...filesToAdd]);
    };

    const shareMyFileList = () => {
        if (dcRef.current?.readyState === 'open') {
            const metadata = myFilesRef.current.map(({ file, ...meta }) => meta);
            dcRef.current.send(JSON.stringify({ type: 'file-list', payload: metadata }));
        }
    };
    useEffect(() => { if (isConnected) shareMyFileList(); }, [myFiles, isConnected]);

    const handleJoin = (code) => {
        if (!code || code.length !== 4) return setStatus("Please enter a valid 4-digit code.");
        roomRef.current = code;
        socketRef.current.emit("join-room", code);
        setStatus(`Joining session ${code}...`);
    };

    const handleDownloadAll = () => {
        if (dcRef.current?.readyState === 'open' && peerFiles.length > 0) {
            setIsDownloading(true);
            setDownloadProgress(0);
            totalReceivedSizeRef.current = 0;
            totalDownloadSizeRef.current = peerFiles.reduce((sum, file) => sum + file.size, 0);
            peerFiles.forEach(file => {
                dcRef.current.send(JSON.stringify({ type: 'request-file', payload: { name: file.name } }));
            });
        }
    };

    const handleCancel = () => {
        if (isHost) {
            socketRef.current.emit("cancel-session", roomRef.current);
        }
        handleResetState(true);
    };

    const renderView = () => {
        const props = { status, isConnected, myFiles, peerFiles, onAddFiles: handleAddFiles, onCancel: handleCancel, downloadProgress };
        switch (view) {
            case 'sharing':
                return <SharingView {...props} shareLink={shareLink} downloadCode={downloadCode} onDownloadAll={handleDownloadAll} isDownloading={isDownloading} />;
            case 'receiving':
                return <ReceiverView {...props} onJoin={handleJoin} onDownloadAll={handleDownloadAll} isDownloading={isDownloading} />;
            case 'upload':
            default:
                return <FileUploadView onFilesSelected={handleFilesSelected} setView={setView} />;
        }
    };

    return (
        <div className="relative min-h-screen w-full flex flex-col items-center justify-center font-sans overflow-hidden p-4 sm:p-6 md:p-8">
            <WavyBackground />
            <Toaster message={toaster} onClear={() => setToaster('')} />
            <div className="relative z-10 w-full flex flex-col items-center justify-center flex-grow">
                {view === 'upload' && <Header />}
                <main className="flex-grow flex items-center justify-center w-full max-w-7xl">
                    {renderView()}
                </main>
            </div>
        </div>
    );
}