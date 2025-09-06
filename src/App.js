import React, { useState, useRef, useEffect, useCallback } from 'react';
import { io } from "socket.io-client";
// Lucide icons
import { X, Copy, Upload, File, Image, Music, Video, FileText, Download } from 'lucide-react';

// --- Configuration ---
const SOCKET_URL = process.env.REACT_APP_BASE_URL
console.log("SOCKET_URL", SOCKET_URL)
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" },
{
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
},];

const CHUNK_SIZE = 256 * 1024; // 256 KB
const HIGH_WATER_MARK = 64 * 1024 * 1024; // 64 MB

// =================================================================
// =================== UI COMPONENTS (UPDATED) =====================
// =================================================================

// --- New `useModal` hook for managing modal state cleanly ---
const useModal = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);

    const openModal = (content) => {
        setModalContent(content);
        setIsOpen(true);
    };

    const closeModal = () => {
        setIsOpen(false);
        setModalContent(null);
    };

    return { isOpen, modalContent, openModal, closeModal };
};

// --- New `FilePreviewModal` component ---
const FilePreviewModal = ({ file, isOpen, onClose }) => {
    if (!isOpen || !file) return null;

    const fileType = file.type;

    const renderPreview = () => {
        // Handle local files (File object)
        const fileBlob = file.file;
        const localUrl = fileBlob ? URL.createObjectURL(fileBlob) : null;
        const isLocal = !!fileBlob;

        // Handle remote files (URL from downloaded blob)
        const remoteUrl = file.downloadedUrl;
        const url = isLocal ? localUrl : remoteUrl;

        // Determine if a preview is possible
        if (fileType?.startsWith('image/')) {
            return <img src={url} alt={file.name} className="max-h-96 max-w-full object-contain" />;
        } else if (fileType?.startsWith('video/')) {
            return <video controls src={url} className="max-h-96 max-w-full" />;
        } else if (fileType?.startsWith('audio/')) {
            return <audio controls src={url} className="w-full" />;
        } else if (fileType === 'application/pdf') {
            return <p className="text-gray-500">PDF preview is not supported. Please download the file to view it.</p>;
        } else {
            return <p className="text-gray-500">No preview available for this file type.</p>;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl p-6 relative w-full max-w-xl">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors z-10">
                    <X />
                </button>
                <h3 className="text-lg font-semibold mb-4 text-gray-800 break-words">{file?.name}</h3>
                <div className="flex justify-center items-center p-4 bg-gray-100 rounded-lg">
                    {renderPreview()}
                </div>
                <p className="mt-4 text-sm text-gray-500">
                    Size: {(file?.size / 1024 / 1024).toFixed(2)} MB
                </p>
            </div>
        </div>
    );
};

// --- Updated `FileList` component with thumbnails and click handler ---
const FileList = ({ title, files, showDownloadButton, onDownload, showDeleteButton, onDelete, onFileClick }) => {
    const getFileIcon = (file) => {
        const fileType = file?.type;
        if (fileType?.startsWith('image/')) {
            return <Image className="h-6 w-6 text-blue-400" />;
        }
        if (fileType?.startsWith('video/')) {
            return <Video className="h-6 w-6 text-blue-400" />;
        }
        if (fileType?.startsWith('audio/')) {
            return <Music className="h-6 w-6 text-purple-400" />;
        }
        if (fileType === 'application/pdf') {
            return <FileText className="h-6 w-6 text-red-400" />;
        }
        return <File className="h-6 w-6 text-gray-400" />;
    };

    return (
        <div className="mt-4 text-left">
            <h3 className="font-semibold text-gray-700">{title}</h3>
            {files.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">No files yet.</p>
            ) : (
                <div className="mt-2 space-y-2 max-h-32 sm:max-h-40 overflow-y-auto pr-2">
                    {files.map(file => {
                        if (!file || !file.name) {
                            return null;
                        }

                        const fileSize = (file.size / 1024 / 1024).toFixed(2);
                        return (
                            <div key={file.name} className="flex items-center justify-between p-2 bg-gray-50 rounded-md shadow-sm">
                                <div className="flex-1 flex items-center space-x-3 cursor-pointer" onClick={() => onFileClick(file)}>
                                    <div className="flex-shrink-0">{getFileIcon(file)}</div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-800 truncate max-w-[150px] sm:max-w-[200px]">{file.name}</p>
                                        <p className="text-xs text-gray-500">{fileSize} MB</p>
                                        {file.progress !== undefined && file.progress < 100 && (
                                            <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
                                                <div
                                                    className="bg-blue-500 h-1 rounded-full"
                                                    style={{ width: `${file.progress}%` }}
                                                ></div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex space-x-2">
                                    {showDownloadButton && (
                                        <button onClick={(e) => { e.stopPropagation(); onDownload(file.name); }} className="text-gray-400 hover:text-blue-600">
                                            <Download className="h-5 w-5" />
                                        </button>
                                    )}
                                    {showDeleteButton && (
                                        <button onClick={(e) => { e.stopPropagation(); onDelete(file.name); }} className="text-gray-400 hover:text-red-600">
                                            <X className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const Toaster = ({ message, onClear }) => {
    useEffect(() => {
        if (message) {
            const timer = setTimeout(() => {
                onClear();
            }, 3000);
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


const WavyBackground = () => (
    <div className="absolute inset-0 overflow-hidden bg-[#4A79EE]">
        <svg className="absolute top-0 left-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ opacity: 0.1, transform: 'scale(1.5)', transformOrigin: 'center' }}>
            <path d="M-20,0 Q-10,20 0,0 T20,0 T40,0 T60,0 T80,0 T100,0 T120,0 V100 H-20 Z" fill="#FFFFFF" />
            <path d="M-20,10 Q-10,30 0,10 T20,10 T40,10 T60,10 T80,10 T100,10 T120,10 V110 H-20 Z" fill="#FFFFFF" />
            <path d="M-20,20 Q-10,40 0,20 T20,20 T40,20 T60,20 T80,20 T100,20 T120,20 V120 H-20 Z" fill="#FFFFFF" />
        </svg>
    </div>
);


const Header = () => (
    <header className="flex flex-col items-center p-4 md:p-6 w-full max-w-7xl mx-auto text-white">
        <div className="flex items-center space-x-2 sm:space-x-4 mb-2">
            {/* Share Fiber Logo and Name */}
            <div className="flex items-center space-x-2">
                <img src='/logo.svg' alt='Share Fiber Icon' width={35} height={35} className="flex-shrink-0" />
                <span className="font-bold text-xl sm:text-2xl leading-none">Share Fiber</span>
            </div>
            {/* The 'X' separator */}
            <span className="text-xl sm:text-2xl font-bold text-blue-200">X</span>
            {/* Andcoder Logo and Name */}
            <div className="flex items-center space-x-2">
                {/* <img src='/andcoder-logo.svg' alt='Andcoder Icon' className="h-7 sm:h-8 flex-shrink-0" /> */}
                <span className="font-bold text-xl sm:text-2xl leading-none">ANDCODER</span>
            </div>
        </div>
        <span className="text-sm sm:text-base font-light opacity-80 mt-1">
            A Service from <span className="font-medium">ANDCODER</span>
        </span>
    </header>
);

const SubHeader = () => (
    <h2 className="text-white text-center text-xl sm:text-xl md:text-2xl font-semibold tracking-wide mt-4 md:mt-6">
        Elegant file transfer, simplified for you.
    </h2>
);

// This component now conditionally renders based on socket connection status
const FileUploadView = ({ onFilesSelected, setView, isReady }) => {
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
        <div className="text-center w-full px-4">
            {isReady ? (
                <>
                    <div
                        className={`mt-8 sm:mt-12 mx-auto w-full max-w-xl p-6 sm:p-8 bg-white rounded-2xl shadow-2xl backdrop-blur-sm cursor-pointer border-2 border-dashed transition-all duration-300 ${isDragging ? 'border-blue-500 scale-105' : 'border-black/50'}`}
                        onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
                    >
                        <div className="flex flex-col items-center justify-center space-y-4">
                            <Upload className="h-8 w-8 text-blue-500 mx-auto" />
                            <p className="text-lg font-medium text-gray-700">Drag and Drop files to upload</p>
                            <p className="text-gray-500">or</p>
                            <button
                                onClick={openFileDialog}
                                className="bg-blue-500 text-white font-medium py-2 px-6 rounded-full hover:bg-blue-600 transition-colors"
                            >
                                Browse
                            </button>
                            <p className="text-xs text-gray-400">Supported formats: XLS, XLSX</p>
                        </div>
                        <input type="file" multiple ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                    </div>
                    <p className="mt-8">
                        <button onClick={() => setView('receiving')} className="text-white opacity-80 hover:opacity-100 underline">
                            Or receive a file?
                        </button>
                    </p>
                </>
            ) : (
                <div className="mt-8 sm:mt-12 mx-auto w-full max-w-xl p-6 sm:p-8 bg-white rounded-2xl shadow-2xl backdrop-blur-sm text-center">
                    <p className="text-lg font-medium text-gray-700 animate-pulse">
                        Please wait until I'm ready to transfer your files...
                    </p>
                    <p className="mt-8">
                        <button onClick={() => setView('receiving')} className="text-white opacity-80 hover:opacity-100 underline">
                            Or receive a file?
                        </button>
                    </p>
                </div>
            )}
        </div>
    );
};

// --- New SharingStatusCard Component ---
const SharingStatusCard = ({ shareLink, downloadCode, status, onCopy, copied, onCancel }) => (
    <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 w-full relative h-full flex flex-col items-center justify-center text-center">
        <button onClick={onCancel} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors z-10">
            <X />
        </button>
        <h3 className="text-gray-500 text-sm font-medium">Status:</h3>
        <p className="text-md sm:text-lg font-semibold text-gray-800">{status}</p>

        {downloadCode && (
            <>
                <p className="text-5xl sm:text-6xl font-extrabold tracking-widest text-gray-800 mt-4 sm:mt-6 mb-4">{downloadCode}</p>
                <div className="bg-gray-100 rounded-lg p-3 flex items-center justify-between mt-6 w-full">
                    <span className="text-blue-600 font-mono text-xs truncate pr-2">{shareLink}</span>
                    <button onClick={onCopy} className="bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600 transition-colors flex items-center space-x-2">
                        <Copy className="h-5 w-5" />
                        <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                </div>
            </>
        )}
    </div>
);


// --- Refactored SharingView Component ---
const SharingView = ({ myFiles, peerFiles, shareLink, downloadCode, status, onAddFiles, onDownloadAll, isDownloading, onCancel, downloadProgress, onFileDelete, onFileDownload, onFileClick, peerFileCount }) => {
    const [copied, setCopied] = React.useState(false);
    const addFilesInputRef = useRef(null);
    const [activeTab, setActiveTab] = useState('upload'); // State for the tabs

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
        <div className="flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full max-w-6xl mx-auto">
            {/* Left Card: File List & Upload */}
            <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 w-full lg:w-3/5 text-center relative">
                <div className="flex border-b border-gray-200 mb-6">
                    <button onClick={() => setActiveTab('upload')} className={`flex-1 py-3 font-semibold transition-colors ${activeTab === 'upload' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
                        Upload
                    </button>
                    <button
                        onClick={() => setActiveTab('download')}
                        className={`flex-1 py-3 font-semibold transition-colors relative flex items-center justify-center space-x-2 ${activeTab === 'download' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                        <span>Download</span>
                        {peerFileCount > 0 && (
                            <span className="bg-red-500 text-white text-[10px] rounded-full px-2 py-0.5 font-bold">
                                {peerFileCount}
                            </span>
                        )}
                    </button>
                </div>
                {activeTab === 'upload' ? (
                    <>
                        <div onClick={() => addFilesInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-400 cursor-pointer hover:border-blue-400 transition-colors duration-200">
                            <Upload className="h-8 w-8 text-blue-500 mx-auto" />
                            <p className="mt-2 text-sm">Drag & drop or click to choose files</p>
                            <div className="text-xs text-gray-500 mt-2 flex justify-between">
                                <span>Supported formats: XLS, XLSX</span>
                                <span>Max: 25MB</span>
                            </div>
                        </div>
                        <input type="file" multiple ref={addFilesInputRef} className="hidden" onChange={handleFileSelect} />
                        <FileList title="Your Files" files={myFiles} showDeleteButton={true} onDelete={onFileDelete} onFileClick={onFileClick} />
                    </>
                ) : (
                    <>
                        <FileList title="Remote User's Files" files={peerFiles} showDownloadButton={true} onDownload={onFileDownload} onFileClick={onFileClick} />
                        {peerFiles.length > 0 && (
                            <button
                                onClick={onDownloadAll}
                                disabled={isDownloading}
                                className={`mt-4 w-full font-bold py-3 rounded-lg transition-colors relative overflow-hidden ${isDownloading ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
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
                    </>
                )}
            </div>

            {/* Right Card: Status (Simplified) */}
            <div className="w-full lg:w-2/5">
                <SharingStatusCard
                    shareLink={shareLink}
                    downloadCode={downloadCode}
                    status={status}
                    onCopy={copyToClipboard}
                    copied={copied}
                    onCancel={onCancel}
                />
            </div>
        </div>
    );
};


// --- Refactored ReceiverView Component ---
const ReceiverView = ({ onJoin, status, isConnected, peerFiles, myFiles, onAddFiles, onDownloadAll, isDownloading, onCancel, downloadProgress, onFileDelete, onFileDownload, onFileClick, peerFileCount }) => {
    const [inputCode, setInputCode] = useState('');
    const addFilesInputRef = useRef(null);
    const [activeTab, setActiveTab] = useState('download');

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            onAddFiles(Array.from(e.target.files));
        }
    };

    if (!isConnected) {
        return (
            <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 w-full max-w-md text-center relative">
                <button onClick={onCancel} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors z-10">
                    <X />
                </button>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Receive a File</h2>
                <p className="text-gray-600 mt-2">Enter the 4-digit code from the sender.</p>
                <div className="mt-6 flex items-center space-x-2">
                    <input
                        type="tel"
                        maxLength="4"
                        value={inputCode}
                        onChange={(e) => {
                            const value = e.target.value;
                            if (value.length <= 4) {
                                setInputCode(value);
                            }
                        }}
                        placeholder="1234"
                        className="w-full text-center text-xl font-mono p-2 border-2 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition"
                    />
                    <button
                        onClick={() => onJoin(inputCode)}
                        disabled={inputCode.length !== 4}
                        className={`bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-colors ${inputCode.length !== 4 ? 'bg-gray-400 cursor-not-allowed' : 'hover:bg-blue-600'}`}
                    >
                        Connect
                    </button>
                </div>
                <div className="mt-4 p-3 bg-gray-100 rounded-lg text-gray-800 min-h-[50px] text-sm">
                    <strong>Status:</strong> {status}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6 w-full max-w-6xl mx-auto">
            {/* Left Card: Download/Upload Files */}
            <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-6 w-full lg:w-3/5 text-center relative">
                <div className="flex border-b border-gray-200 mb-6">
                    <button
                        onClick={() => setActiveTab('download')}
                        className={`flex-1 py-3 font-semibold transition-colors relative flex items-center justify-center space-x-2 ${activeTab === 'download' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                        <span>Download</span>
                        {peerFileCount > 0 && (
                            <span className="bg-red-500 text-white text-[10px] rounded-full px-2 py-0.5 font-bold">
                                {peerFileCount}
                            </span>
                        )}
                    </button>
                    <button onClick={() => setActiveTab('upload')} className={`flex-1 py-3 font-semibold transition-colors ${activeTab === 'upload' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
                        Upload
                    </button>
                </div>
                {activeTab === 'download' ? (
                    <>
                        <FileList
                            title="Remote Files to Download"
                            files={peerFiles}
                            showDownloadButton={true}
                            onDownload={onFileDownload}
                            onFileClick={onFileClick}
                        />
                        {peerFiles.length > 0 && (
                            <button
                                onClick={onDownloadAll}
                                disabled={isDownloading}
                                className={`mt-4 w-full font-bold py-3 rounded-lg transition-colors relative overflow-hidden ${isDownloading ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
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
                    </>
                ) : (
                    <>
                        <div onClick={() => addFilesInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-400 cursor-pointer hover:border-blue-400 transition-colors duration-200">
                            <Upload className="h-8 w-8 text-blue-500 mx-auto" />
                            <p className="mt-2 text-sm">Drag & drop or click to choose files</p>
                            <div className="text-xs text-gray-500 mt-2 flex justify-between">
                                <span>Supported formats: XLS, XLSX</span>
                                <span>Max: 25MB</span>
                            </div>
                        </div>
                        <input type="file" multiple ref={addFilesInputRef} className="hidden" onChange={handleFileSelect} />
                        <FileList title="Your Files" files={myFiles} showDeleteButton={true} onDelete={onFileDelete} onFileClick={onFileClick} />
                    </>
                )}
            </div>

            {/* Right Card: Status (Simplified) */}
            <div className="w-full lg:w-2/5">
                <SharingStatusCard
                    shareLink=""
                    downloadCode=""
                    status={status}
                    onCopy={() => { }}
                    copied={false}
                    onCancel={onCancel}
                />
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
    const [peerFileCount, setPeerFileCount] = useState(0);
    const [isSocketReady, setIsSocketReady] = useState(false);

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
    
    // Add this ref to track the files being downloaded to handle the sequential process
    const downloadQueueRef = useRef([]);

    // Refs for receiving file chunks
    const receivingFileRef = useRef(null);
    const receivedChunksRef = useRef([]);
    const totalDownloadSizeRef = useRef(0);
    const totalReceivedSizeRef = useRef(0);
    const downloadedTotalSizeRef = useRef(0);

    // Modal state from custom hook
    const { isOpen, modalContent, openModal, closeModal } = useModal();

    useEffect(() => {
        myFilesRef.current = myFiles;
    }, [myFiles]);

    useEffect(() => {
        setPeerFileCount(peerFiles.length);
    }, [peerFiles]);
    
    // =================================================================
    // ================== WEBRTC & SOCKET FUNCTIONS ====================
    // =================================================================

    const sendFile = useCallback((fileName) => {
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
                    dcRef.current.send(JSON.stringify({ type: 'eof', payload: { name: file.name } }));
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
    }, []);


    const handleDataChannelMessage = useCallback((e) => {
    const { data } = e;
    try {
        if (typeof data === "string") {
            const message = JSON.parse(data);
            if (message.type === 'file-list') {
                setPeerFiles(message.payload.map(file => ({ ...file, progress: 0 })));
            } else if (message.type === 'request-file') {
                sendFile(message.payload.name);
            } else if (message.type === 'info') {
                receivingFileRef.current = { ...message.payload };
                receivedChunksRef.current = [];
                setPeerFiles(prevFiles => prevFiles.map(f => f.name === message.payload.name ? { ...f, progress: 0 } : f));
                totalReceivedSizeRef.current = 0;
                totalDownloadSizeRef.current = message.payload.size;
            } else if (message.type === 'eof') {
                const { name } = message.payload;
                const file = receivingFileRef.current;
                if (!file || file.name !== name) return;

                const fileBlob = new Blob(receivedChunksRef.current, { type: file.type });
                const url = URL.createObjectURL(fileBlob);
                
                // Store the downloaded blob for this specific file
                setDownloadedBlobs(prev => ({ ...prev, [file.name]: url }));
                
                // Update the file with downloadedUrl for preview
                setPeerFiles(prevFiles => prevFiles.map(f => 
                    f.name === file.name ? { ...f, downloadedUrl: url, progress: 100 } : f
                ));
                
                // Add to downloaded total size
                downloadedTotalSizeRef.current += file.size;
                
                receivingFileRef.current = null;
                
                // Check if there are more files in the download queue
                if (downloadQueueRef.current.length > 0) {
                    const nextFile = downloadQueueRef.current.shift();
                    if (nextFile) {
                        dcRef.current.send(JSON.stringify({ type: 'request-file', payload: { name: nextFile.name } }));
                    }
                } else {
                    setIsDownloading(false);
                    setDownloadProgress(0);
                    downloadedTotalSizeRef.current = 0; // Reset total size
                    setToaster("All files downloaded!");
                    
                    if (dcRef.current?.readyState === 'open') {
                        dcRef.current.send(JSON.stringify({ type: 'download-complete' }));
                    }
                }
            } else if (message.type === 'download-complete') {
                setToaster("Files sent successfully!");
                // No change needed here, let the sender handle their own files
            }
        } else {
            if (receivingFileRef.current) {
                receivedChunksRef.current.push(data);
                totalReceivedSizeRef.current += data.byteLength;
                
                // Calculate progress differently for single vs multiple file downloads
                let overallProgress;
                const totalSizeOfAllFiles = peerFiles.reduce((sum, file) => sum + file.size, 0);
                const downloadedSize = downloadedTotalSizeRef.current + totalReceivedSizeRef.current;
                overallProgress = totalSizeOfAllFiles > 0 ? Math.round((downloadedSize / totalSizeOfAllFiles) * 100) : 0;
                
                setDownloadProgress(overallProgress);
                
                setPeerFiles(prevFiles => prevFiles.map(f => 
                    f.name === receivingFileRef.current?.name 
                        ? { ...f, progress: Math.round((totalReceivedSizeRef.current / totalDownloadSizeRef.current) * 100) } 
                        : f
                ));
            }
        }
    } catch (err) { 
        console.error("Message error:", err); 
    }
}, [peerFiles, setPeerFiles, setDownloadProgress, setIsDownloading, setToaster, sendFile]);
    
    const setupDC = useCallback(() => {
        dcRef.current.binaryType = "arraybuffer";
        dcRef.current.onopen = () => shareMyFileList();
        dcRef.current.onclose = () => {
            setIsConnected(false);
            setPeerFiles([]);
        };
        dcRef.current.onerror = (e) => console.error("DC error:", e);
        dcRef.current.onmessage = handleDataChannelMessage;
    }, [handleDataChannelMessage]);

    const newPC = useCallback((isHost) => {
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
    }, [setupDC]);

    

    // Move the initializeSocket function BEFORE handleResetState
// Replace the function definitions in this order:

const initializeSocket = useCallback(() => {
    if (socketRef.current) {
        socketRef.current.off();
        socketRef.current.disconnect();
    }

    const socket = io(SOCKET_URL, {
        transports: ["websocket"],
        secure: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
        console.log("Connected:", socket.id);
        setIsSocketReady(true);
    });

    socket.on("disconnect", () => {
        console.log("Disconnected:", socket.id);
        setIsSocketReady(false);
    });

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
        newPC(true);
        setStatus("Peer disconnected. Waiting for a new one...");
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
}, [newPC]); // Remove handleResetState from dependencies to avoid circular dependency

const handleResetState = useCallback((reinitializeSocket = true) => {
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
    closeModal();

    if (reinitializeSocket) {
        initializeSocket();
    }
}, [closeModal, initializeSocket]);

    // Use a single useEffect for socket initialization
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
    }, [initializeSocket]);
    
    // =================================================================
    // ================== FILE DOWNLOAD & UI HANDLERS ==================
    // =================================================================

    useEffect(() => {
    if (Object.keys(downloadedBlobs).length > 0) {
        Object.entries(downloadedBlobs).forEach(([name, url]) => {
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
        });

        // Don't remove files from peerFiles list anymore - they stay for potential re-download
        // Just clear the downloadedBlobs
        setDownloadedBlobs({});
    }
}, [downloadedBlobs]);

    const handleFilesSelected = (selectedFiles) => {
        setMyFiles(selectedFiles.map(file => ({ file, name: file.name, size: file.size, type: file.type })));
        socketRef.current.emit("create-room");
    };

    const handleFileDelete = (fileName) => {
        setMyFiles(prevFiles => prevFiles.filter(file => file.name !== fileName));
    };
    
const handleFileDownload = useCallback((fileName) => {
    if (dcRef.current?.readyState === 'open') {
        const fileToDownload = peerFiles.find(file => file.name === fileName);
        if (fileToDownload) {
            // Clear the download queue for single file download
            downloadQueueRef.current = [fileToDownload];
            
            setIsDownloading(true);
            setDownloadProgress(0);
            totalReceivedSizeRef.current = 0;
            downloadedTotalSizeRef.current = 0;
            
            const firstFile = downloadQueueRef.current.shift();
            if (firstFile) {
                dcRef.current.send(JSON.stringify({ type: 'request-file', payload: { name: firstFile.name } }));
            }
        }
    }
}, [peerFiles, setIsDownloading, setDownloadProgress]);

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

    const handleDownloadAll = useCallback(() => {
        if (dcRef.current?.readyState === 'open' && peerFiles.length > 0) {
            setIsDownloading(true);
            
            downloadQueueRef.current = [...peerFiles];
            
            setDownloadProgress(0);
            totalReceivedSizeRef.current = 0;
            downloadedTotalSizeRef.current = 0;

            const firstFile = downloadQueueRef.current.shift();
            if (firstFile) {
                dcRef.current.send(JSON.stringify({ type: 'request-file', payload: { name: firstFile.name } }));
            }
        }
    }, [peerFiles, setIsDownloading, setDownloadProgress]);

    const handleCancel = useCallback(() => {
        if (isHost) {
            socketRef.current.emit("cancel-session", roomRef.current);
        }
        handleResetState(true);
    }, [isHost, handleResetState]);

    const handleFileClick = useCallback((file) => {
        if (file.downloadedUrl || file.file) {
            openModal(file);
        } else {
            setToaster("File must be downloaded to view a preview.");
        }
    }, [openModal, setToaster]);

    const renderView = () => {
        const props = { status, isConnected, myFiles, peerFiles, onAddFiles: handleAddFiles, onCancel: handleCancel, downloadProgress, onFileDelete: handleFileDelete, onFileDownload: handleFileDownload, onFileClick: handleFileClick, peerFileCount };
        switch (view) {
            case 'sharing':
                return <SharingView {...props} shareLink={shareLink} downloadCode={downloadCode} onDownloadAll={handleDownloadAll} isDownloading={isDownloading} />;
            case 'receiving':
                return <ReceiverView {...props} onJoin={handleJoin} onDownloadAll={handleDownloadAll} isDownloading={isDownloading} />;
            case 'upload':
            default:
                return <FileUploadView onFilesSelected={handleFilesSelected} setView={setView} isReady={isSocketReady} />;
        }
    };

    return (
        <div className="relative min-h-screen w-full flex flex-col items-center justify-center font-sans overflow-hidden p-4 sm:p-6 md:p-8">
            <WavyBackground />
            <Toaster message={toaster} onClear={() => setToaster('')} />
            <div className="relative z-10 w-full flex flex-col items-center justify-center flex-grow">
                {/* Header is now always visible */}
                <Header />
                {view === 'upload' && <SubHeader />} {/* SubHeader is now only visible on the upload view */}
                <main className="flex-grow flex items-center justify-center w-full max-w-7xl">
                    {renderView()}
                </main>
            </div>
            <FilePreviewModal file={modalContent} isOpen={isOpen} onClose={closeModal} />
        </div>
    );
}