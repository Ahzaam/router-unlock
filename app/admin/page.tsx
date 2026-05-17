"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import {
  Play,
  Square,
  RefreshCcw,
  Send,
  CheckCircle2,
  XCircle,
  Shield,
  Users,
  Terminal as TerminalIcon,
  Search,
  FileText,
  Download as DownloadIcon,
  Globe,
  Wifi,
  Activity,
  Video,
} from "lucide-react";
import { getSocket } from "@/lib/socket";

type LogEntry = {
  id: string;
  timestamp: string;
  type: "system" | "sent" | "received" | "error";
  content: string;
  commandType?: "AT" | "CMD";
};

type Session = {
  code: string;
  name: string;
  adminId: string | null;
  routerId: string | null;
  agentId: string | null;
};

function AdminPageContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [selectedSessionCode, setSelectedSessionCode] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ code: string } | null>(null);

  // State per session
  const [sessionData, setSessionData] = useState<
    Record<
      string,
      {
        logs: LogEntry[];
        history: { type: "AT" | "CMD"; cmd: string }[];
        commandType: "AT" | "CMD";
        commandInput: string;
        friendConnected: boolean;
        agentConnected: boolean;
        files: string[];
        devices: { ip: string; mac: string }[];
        activeTab: "history" | "files" | "network";
        requestPath: string;
        isScanning: boolean;
      }
    >
  >({});

  const terminalRef = useRef<HTMLDivElement>(null);

  const getSelectedData = () => {
    if (!selectedSessionCode) return null;
    return (
      sessionData[selectedSessionCode] || {
        logs: [],
        history: [],
        commandType: "AT" as const,
        commandInput: "",
        friendConnected: false,
        agentConnected: false,
        files: [],
        devices: [],
        activeTab: "history",
        requestPath: "",
        isScanning: false,
      }
    );
  };

  const updateSelectedData = (updates: Partial<ReturnType<typeof getSelectedData>>) => {
    if (!selectedSessionCode) return;
    setSessionData((prev) => ({
      ...prev,
      [selectedSessionCode]: {
        ...(prev[selectedSessionCode] || {
          logs: [],
          history: [],
          commandType: "AT" as const,
          commandInput: "",
          friendConnected: false,
          agentConnected: false,
          files: [],
          activeTab: "history",
        }),
        ...updates,
      },
    }));
  };

  const fetchFiles = async (code: string) => {
    try {
      const res = await fetch(`/files/${code}`);
      const files = await res.json();
      setSessionData((prev) => ({
        ...prev,
        [code]: {
          ...(prev[code] || {
            logs: [],
            history: [],
            commandType: "AT",
            commandInput: "",
            friendConnected: false,
            agentConnected: false,
            activeTab: "history",
            requestPath: "",
            devices: [],
            isScanning: false,
          }),
          files,
        },
      }));
    } catch (e) {
      console.error("Failed to fetch files:", e);
    }
  };

  const addLog = (sessionCode: string, type: LogEntry["type"], content: string, cmdType?: "AT" | "CMD") => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

    const newLog: LogEntry = {
      id: Math.random().toString(36).substring(7),
      timestamp,
      type,
      content,
      commandType: cmdType,
    };

    setSessionData((prev) => {
      const current = prev[sessionCode] || {
        logs: [],
        history: [],
        commandType: "AT" as const,
        commandInput: "",
        friendConnected: false,
        agentConnected: false,
      };
      return {
        ...prev,
        [sessionCode]: {
          ...current,
          logs: [...current.logs, newLog],
        },
      };
    });
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = getSocket();

    socket.emit("get-sessions");

    socket.on("sessions-updated", (sessions: Session[]) => {
      setActiveSessions(sessions);

      // Initialize data for new sessions if not present
      setSessionData((prev) => {
        const newData = { ...prev };
        sessions.forEach((s) => {
          if (!newData[s.code]) {
            newData[s.code] = {
              logs: [{ id: "init", timestamp: "--:--:--", type: "system", content: `Session ${s.name} detected.` }],
              history: [],
              commandType: "AT",
              commandInput: "",
              friendConnected: !!s.routerId,
              agentConnected: !!s.agentId,
              files: [],
              devices: [],
              activeTab: "history",
              requestPath: "",
              isScanning: false,
            };
            fetchFiles(s.code);
          } else {
            // Update connection statuses
            newData[s.code].friendConnected = !!s.routerId;
            newData[s.code].agentConnected = !!s.agentId;
          }
        });
        return newData;
      });
    });

    socket.on("command-result", ({ code, output }) => {
      if (code) {
        addLog(code, "received", output);
      }
    });

    socket.on("file-uploaded", ({ code, filename }) => {
      if (code) {
        addLog(code, "system", `New file uploaded: ${filename}`);
        fetchFiles(code);
      }
    });

    socket.on("network-scan-result", ({ code, devices }) => {
      if (code) {
        setSessionData((prev) => ({
          ...prev,
          [code]: {
            ...(prev[code] || {}),
            devices,
            isScanning: false,
          },
        }));
        addLog(code, "system", `Network scan complete. Found ${devices.length} devices.`);
      }
    });

    socket.on("user-connected", ({ role, code }) => {
      if (code) {
        if (role === "router") {
          addLog(code, "system", "Friend (Router) connected.");
        } else if (role === "agent") {
          addLog(code, "system", "Agent.exe connected.");
        }
      }
    });

    socket.on("call-request", ({ code }) => {
      setIncomingCall({ code });
      // Play a sound or notification here if desired
    });

    socket.on("call-accept", ({ code }) => {
      const targetCode = code || selectedSessionCode;
      if (targetCode) {
        addLog(targetCode, "system", "Video call accepted.");
        window.open(`/admin/video?code=${targetCode}`, "AdminVideo", "width=1200,height=800");
      }
    });

    socket.on("call-decline", () => {
      setIncomingCall(null);
      if (selectedSessionCode) {
        addLog(selectedSessionCode, "system", "Video call declined.");
      }
    });

    socket.on("user-disconnected", ({ role, code }) => {
      // Note: the server needs to emit code with disconnect if possible,
      // but for now we rely on sessions-updated which handles it.
    });

    return () => {
      socket.off("sessions-updated");
      socket.off("command-result");
      socket.off("file-uploaded");
      socket.off("network-scan-result");
      socket.off("user-connected");
      socket.off("user-disconnected");
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [sessionData, selectedSessionCode]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "admin123") {
      setIsAuthenticated(true);
    } else {
      alert("Incorrect password!");
    }
  };

  const handleSendCommand = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const data = getSelectedData();
    if (!data || !selectedSessionCode || !data.commandInput.trim()) return;

    const socket = getSocket();
    socket.emit("send-command", {
      code: selectedSessionCode,
      type: data.commandType,
      command: data.commandInput,
    });

    addLog(selectedSessionCode, "sent", data.commandInput, data.commandType);

    // Add to history
    const newHistory = [...data.history];
    if (!(newHistory.length > 0 && newHistory[0].cmd === data.commandInput && newHistory[0].type === data.commandType)) {
      newHistory.unshift({ type: data.commandType, cmd: data.commandInput });
    }

    updateSelectedData({
      commandInput: "",
      history: newHistory.slice(0, 50),
    });
  };

  const handleRequestUpload = (e: React.FormEvent) => {
    e.preventDefault();
    const data = getSelectedData();
    if (!data || !selectedSessionCode || !data.requestPath.trim()) return;

    const socket = getSocket();
    socket.emit("request-upload", {
      code: selectedSessionCode,
      path: data.requestPath,
    });

    addLog(selectedSessionCode, "system", `Requested upload for: ${data.requestPath}`);
    updateSelectedData({ requestPath: "" });
  };

  const handleNetworkScan = () => {
    if (!selectedSessionCode) return;
    setSessionData((prev) => ({
      ...prev,
      [selectedSessionCode]: {
        ...(prev[selectedSessionCode] || {}),
        isScanning: true,
        devices: [],
      },
    }));
    const socket = getSocket();
    socket.emit("network-scan", { code: selectedSessionCode });
    addLog(selectedSessionCode, "system", "Network scan initiated...");
  };

  const handleAdminUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !selectedSessionCode) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);

    addLog(selectedSessionCode, "system", `Sending file to friend: ${file.name}...`);

    try {
      const res = await fetch(`/admin-upload/${selectedSessionCode}`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        addLog(selectedSessionCode, "system", `File sent successfully: ${file.name}`);
        fetchFiles(selectedSessionCode);
      } else {
        addLog(selectedSessionCode, "error", `Failed to send file: ${res.statusText}`);
      }
    } catch (err) {
      addLog(selectedSessionCode, "error", `Upload error: ${err}`);
    }
  };

  const selectSession = (code: string) => {
    setSelectedSessionCode(code);
    fetchFiles(code);
    const socket = getSocket();
    socket.emit("join-session", { code, role: "admin" });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-600/20 p-4 rounded-full border border-blue-500/30">
              <Shield className="w-10 h-10 text-blue-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">Admin Access</h1>
          <p className="text-gray-400 text-center mb-8 text-sm">Please enter the master password to continue</p>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-all"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95"
            >
              Unlock Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  const selectedData = getSelectedData();

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Sidebar - Session List */}
      <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center space-x-3 mb-6">
            <TerminalIcon className="w-6 h-6 text-terminal-green" />
            <h2 className="font-bold text-xl tracking-tight">Admin Panel</h2>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Filter sessions..."
              className="w-full bg-black border border-gray-800 rounded-lg py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold px-3 mb-2">
            Active Sessions ({activeSessions.length})
          </div>
          {activeSessions.length === 0 ? (
            <div className="px-3 py-10 text-center text-gray-600 text-sm italic">No active sessions found</div>
          ) : (
            activeSessions.map((s) => (
              <button
                key={s.code}
                onClick={() => selectSession(s.code)}
                className={`w-full text-left p-3 rounded-xl transition-all border ${
                  selectedSessionCode === s.code
                    ? "bg-blue-600/10 border-blue-500/50 shadow-lg"
                    : "border-transparent hover:bg-gray-800"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`font-bold truncate ${selectedSessionCode === s.code ? "text-blue-400" : "text-gray-200"}`}>
                    {s.name}
                  </span>
                  <span className="text-[10px] font-mono text-gray-500">#{s.code}</span>
                </div>
                <div className="flex space-x-3 mt-2">
                  <div
                    className={`w-2 h-2 rounded-full ${s.routerId ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-gray-700"}`}
                    title="Router"
                  ></div>
                  <div
                    className={`w-2 h-2 rounded-full ${s.agentId ? "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" : "bg-gray-700"}`}
                    title="Agent"
                  ></div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-4 bg-gray-950 border-t border-gray-800 flex items-center justify-between text-[10px] text-gray-500">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span>System Online</span>
          </div>
          <span>v1.2.0</span>
        </div>
      </div>

      {/* Main Terminal Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {!selectedSessionCode ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="bg-gray-900/50 p-12 rounded-3xl border border-gray-800 max-w-lg">
              <Users className="w-16 h-16 text-gray-700 mx-auto mb-6" />
              <h2 className="text-2xl font-bold mb-4">Welcome, Commander</h2>
              <p className="text-gray-400">
                Select a session from the sidebar to begin controlling the remote router. You can switch between active sessions
                at any time.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Session Header */}
            <div className="bg-gray-900 border-b border-gray-800 p-4 flex items-center justify-between shadow-md z-10">
              <div className="flex items-center space-x-6">
                <div>
                  <h3 className="font-bold text-lg text-white leading-tight">
                    {activeSessions.find((s) => s.code === selectedSessionCode)?.name || "Unknown Session"}
                  </h3>
                  <p className="text-xs font-mono text-gray-500">Session ID: {selectedSessionCode}</p>
                </div>

                <div className="h-8 w-px bg-gray-800 hidden md:block"></div>

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    {selectedData?.friendConnected ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <RefreshCcw className="w-4 h-4 text-yellow-500 animate-spin-slow" />
                    )}
                    <span className="text-xs font-medium text-gray-300">Router</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {selectedData?.agentConnected ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className="text-xs font-medium text-gray-300">Agent</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {selectedData?.friendConnected && (
                  <button
                    onClick={() => {
                      addLog(selectedSessionCode!, "system", `Starting video support request...`);
                      getSocket().emit("call-request", { code: selectedSessionCode });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-600/20"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Video Support
                  </button>
                )}

                <button
                  onClick={() => setSelectedSessionCode(null)}
                  className="text-gray-500 hover:text-white transition-colors p-2"
                >
                  X
                </button>
              </div>
            </div>

            {/* Terminal and Sidebar Split */}
            <div className="flex flex-1 overflow-hidden">
              {/* Terminal Window */}
              <div className="flex-1 flex flex-col bg-black m-4 rounded-xl border border-gray-800 shadow-2xl overflow-hidden relative">
                <div className="bg-gray-900 border-b border-gray-800 p-2 flex items-center space-x-2">
                  <div className="flex space-x-1.5 ml-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono ml-4 uppercase tracking-tighter">
                    Remote Console — {selectedSessionCode}
                  </div>
                </div>

                <div
                  ref={terminalRef}
                  className="flex-1 p-5 font-mono text-sm overflow-y-auto"
                  style={{ scrollBehavior: "smooth" }}
                >
                  {selectedData?.logs.map((log) => (
                    <div key={log.id} className="mb-1 leading-relaxed flex items-start group">
                      <span className="text-gray-600 mr-4 select-none text-xs mt-0.5 min-w-[70px]">[{log.timestamp}]</span>
                      <div className="flex-1 break-all">
                        {log.type === "system" && <span className="text-gray-500 italic opacity-80"># {log.content}</span>}
                        {log.type === "error" && (
                          <span className="text-red-500 font-semibold bg-red-500/10 px-1 rounded">{log.content}</span>
                        )}
                        {log.type === "sent" && (
                          <span className="text-blue-400">
                            <span className="text-blue-500/50 mr-2">➜</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded mr-2 uppercase font-bold ${
                                log.commandType === "AT" ? "bg-blue-600/20 text-blue-400" : "bg-purple-600/20 text-purple-400"
                              }`}
                            >
                              {log.commandType}
                            </span>
                            <span className="font-bold">{log.content}</span>
                          </span>
                        )}
                        {log.type === "received" && (
                          <span className="text-terminal-green whitespace-pre-wrap brightness-110">{log.content}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input Area */}
                <div className="bg-gray-900 p-4 border-t border-gray-800">
                  <form onSubmit={handleSendCommand} className="flex space-x-3">
                    <div className="flex bg-black rounded-xl p-1 border border-gray-800 shadow-inner">
                      <button
                        type="button"
                        onClick={() => updateSelectedData({ commandType: "AT" })}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          selectedData?.commandType === "AT"
                            ? "bg-blue-600 text-white shadow-lg"
                            : "text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        AT
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSelectedData({ commandType: "CMD" })}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                          selectedData?.commandType === "CMD"
                            ? "bg-purple-600 text-white shadow-lg"
                            : "text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        CMD
                      </button>
                    </div>

                    <input
                      type="text"
                      value={selectedData?.commandInput || ""}
                      onChange={(e) => updateSelectedData({ commandInput: e.target.value })}
                      placeholder={
                        selectedData?.commandType === "AT"
                          ? "Type AT command (e.g. AT+CLCK=?)"
                          : "Type system command (e.g. ipconfig)"
                      }
                      className="flex-1 bg-black border border-gray-800 rounded-xl px-5 text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-gray-700"
                      autoFocus
                    />

                    <button
                      type="submit"
                      disabled={!selectedData?.commandInput.trim()}
                      className="bg-terminal-green hover:bg-green-400 disabled:opacity-30 text-black px-8 rounded-xl font-black uppercase tracking-widest text-xs flex items-center space-x-2 transition-all active:scale-95"
                    >
                      <span>Execute</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              </div>

              {/* Sidebar - History & Files */}
              <div className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col hidden xl:flex">
                <div className="flex bg-black/40 border-b border-gray-800">
                  <button
                    onClick={() => updateSelectedData({ activeTab: "history" })}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                      selectedData?.activeTab === "history" ? "text-blue-400 border-b-2 border-blue-500" : "text-gray-500"
                    }`}
                  >
                    History
                  </button>
                  <button
                    onClick={() => updateSelectedData({ activeTab: "files" })}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                      selectedData?.activeTab === "files" ? "text-blue-400 border-b-2 border-blue-500" : "text-gray-500"
                    }`}
                  >
                    Files ({selectedData?.files?.length || 0})
                  </button>
                  <button
                    onClick={() => updateSelectedData({ activeTab: "network" })}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                      selectedData?.activeTab === "network" ? "text-blue-400 border-b-2 border-blue-500" : "text-gray-500"
                    }`}
                  >
                    Network
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {selectedData?.activeTab === "history" ? (
                    <>
                      <div className="flex justify-between items-center mb-2 px-1">
                        <span className="text-[10px] text-gray-600 font-bold uppercase">Recent Commands</span>
                        <button
                          onClick={() => updateSelectedData({ history: [] })}
                          className="text-[9px] text-gray-700 hover:text-red-400 transition-colors uppercase font-bold"
                        >
                          Clear
                        </button>
                      </div>
                      {selectedData?.history.length === 0 ? (
                        <div className="text-center text-gray-600 text-xs mt-10 italic">No history for this session</div>
                      ) : (
                        selectedData?.history.map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              updateSelectedData({
                                commandType: item.type,
                                commandInput: item.cmd,
                              });
                            }}
                            className="w-full group flex flex-col p-3 bg-black/40 hover:bg-gray-800 cursor-pointer rounded-xl transition-all border border-gray-800/50 hover:border-gray-700"
                          >
                            <div className="flex items-center mb-1">
                              <span
                                className={`text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-tighter ${
                                  item.type === "AT" ? "bg-blue-600/20 text-blue-500" : "bg-purple-600/20 text-purple-500"
                                }`}
                              >
                                {item.type}
                              </span>
                            </div>
                            <span className="font-mono text-xs text-gray-400 group-hover:text-white truncate w-full text-left">
                              {item.cmd}
                            </span>
                          </button>
                        ))
                      )}
                    </>
                  ) : selectedData?.activeTab === "files" ? (
                    <>
                      <div className="flex justify-between items-center mb-2 px-1">
                        <span className="text-[10px] text-gray-600 font-bold uppercase">Remote Data Request</span>
                      </div>

                      <div className="bg-black/60 p-3 rounded-xl border border-gray-800 mb-6">
                        <p className="text-[10px] text-gray-500 mb-2">Request any folder path from friend's PC:</p>
                        <form onSubmit={handleRequestUpload} className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. C:\Users\Desktop"
                            value={selectedData?.requestPath || ""}
                            onChange={(e) => updateSelectedData({ requestPath: e.target.value })}
                            className="flex-1 bg-black border border-gray-800 rounded-lg py-1.5 px-3 text-xs text-white focus:outline-none focus:border-blue-500"
                          />
                          <button
                            type="submit"
                            disabled={!selectedData?.requestPath.trim()}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white p-1.5 rounded-lg transition-all"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      </div>

                      <div className="bg-black/60 p-3 rounded-xl border border-gray-800 mb-6">
                        <p className="text-[10px] text-gray-500 mb-2">Send local file to friend's PC:</p>
                        <label className="w-full bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer">
                          <DownloadIcon className="w-3.5 h-3.5 rotate-180" />
                          Upload & Send File
                          <input type="file" className="hidden" onChange={handleAdminUpload} />
                        </label>
                      </div>

                      <div className="flex justify-between items-center mb-2 px-1">
                        <span className="text-[10px] text-gray-600 font-bold uppercase">Uploaded Archives</span>
                        <button
                          onClick={() => fetchFiles(selectedSessionCode!)}
                          className="text-[9px] text-gray-700 hover:text-blue-400 transition-colors uppercase font-bold"
                        >
                          Refresh
                        </button>
                      </div>
                      {selectedData?.files?.length === 0 ? (
                        <div className="text-center text-gray-600 text-xs mt-10 italic">No files uploaded yet</div>
                      ) : (
                        selectedData?.files?.map((filename, idx) => (
                          <div
                            key={idx}
                            className="w-full flex items-center justify-between p-3 bg-black/40 rounded-xl border border-gray-800/50"
                          >
                            <div className="flex items-center space-x-3 overflow-hidden">
                              <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                              <span className="font-mono text-xs text-gray-300 truncate" title={filename}>
                                {filename}
                              </span>
                            </div>
                            <a
                              href={`/download/${selectedSessionCode}/${filename}`}
                              download
                              className="p-2 hover:bg-blue-600/20 rounded-lg transition-colors group"
                            >
                              <DownloadIcon className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
                            </a>
                          </div>
                        ))
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-center mb-4 px-1">
                        <span className="text-[10px] text-gray-600 font-bold uppercase">Network Discovery</span>
                        <button
                          onClick={handleNetworkScan}
                          disabled={selectedData?.isScanning}
                          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[9px] font-bold py-1.5 px-3 rounded-lg transition-all"
                        >
                          {selectedData?.isScanning ? (
                            <Activity className="w-3 h-3 animate-pulse" />
                          ) : (
                            <Wifi className="w-3 h-3" />
                          )}
                          {selectedData?.isScanning ? "Scanning..." : "Start Scan"}
                        </button>
                      </div>

                      {selectedData?.devices?.length === 0 && !selectedData?.isScanning ? (
                        <div className="text-center py-10 bg-black/40 rounded-2xl border border-gray-800 border-dashed">
                          <Wifi className="w-8 h-8 text-gray-700 mx-auto mb-3" />
                          <p className="text-gray-500 text-xs">No devices discovered yet</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedData?.devices?.map((dev, idx) => (
                            <div
                              key={idx}
                              className="bg-black/60 p-4 rounded-xl border border-gray-800 group hover:border-blue-500/30 transition-all"
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <div className="text-sm font-mono font-bold text-blue-400">{dev.ip}</div>
                                  <div className="text-[10px] text-gray-600 font-mono">{dev.mac}</div>
                                </div>
                                <div className="bg-green-500/10 text-green-500 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                  Active
                                </div>
                              </div>

                              {selectedData?.friendConnected && (
                                <button
                                  onClick={() => {
                                    addLog(selectedSessionCode!, "system", `Starting video support request...`);
                                    getSocket().emit("call-request", { code: selectedSessionCode });
                                  }}
                                  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-all mb-2"
                                >
                                  <Video className="w-3.5 h-3.5" />
                                  Video Support
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  addLog(selectedSessionCode!, "system", `Opening proxied web interface for ${dev.ip}...`);
                                  const proxyUrl = `/api/proxy/${selectedSessionCode}/${dev.ip}:80/`;
                                  window.open(proxyUrl, "_blank", "width=1200,height=800");
                                }}
                                className="w-full bg-gray-800 hover:bg-blue-600 text-white text-[10px] font-bold py-2 rounded-lg flex items-center justify-center gap-2 transition-all"
                              >
                                <Globe className="w-3.5 h-3.5" />
                                Access Web UI
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      {/* Incoming Call Toast */}
      {incomingCall && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-right duration-500">
          <div className="bg-gray-900 border border-blue-500 rounded-2xl p-4 w-72 shadow-2xl flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-white">Incoming Call</h3>
              <p className="text-[10px] text-gray-400">User is requesting support (#{incomingCall.code})</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    getSocket().emit("call-decline", { code: incomingCall.code });
                    setIncomingCall(null);
                  }}
                  className="flex-1 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white py-1 px-2 rounded-lg text-[10px] font-bold transition-all"
                >
                  Decline
                </button>
                <button
                  onClick={() => {
                    getSocket().emit("call-accept", { code: incomingCall.code });
                    window.open(`/admin/video?code=${incomingCall.code}`, "AdminVideo", "width=1200,height=800");
                    setIncomingCall(null);
                  }}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1 px-2 rounded-lg text-[10px] font-bold transition-all shadow-lg shadow-green-600/20"
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white bg-[#0a0a0a] min-h-screen">Loading Admin Portal...</div>}>
      <AdminPageContent />
    </Suspense>
  );
}
