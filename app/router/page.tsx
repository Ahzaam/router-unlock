"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Server, User, Cpu, Usb, AlertTriangle, Check, X, Video, Phone, PhoneOff } from "lucide-react";
import { getSocket } from "@/lib/socket";

type LogEntry = {
  id: string;
  timestamp: string;
  content: string;
};

function RouterPageContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [serverConnected, setServerConnected] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [serialConnected, setSerialConnected] = useState(false);

  const [incomingCall, setIncomingCall] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [adminConnected, setAdminConnected] = useState(false);

  const [portName, setPortName] = useState<string>("");
  const portRef = useRef<any>(null); // Web Serial Port fwe

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  const addLog = (content: string) => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    setLogs((prev) => [...prev, { id: Math.random().toString(36).substring(7), timestamp, content }]);
  };

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  useEffect(() => {
    if (!code) return;

    const socket = getSocket();
    setServerConnected(socket.connected);

    socket.on("connect", () => setServerConnected(true));
    socket.on("disconnect", () => setServerConnected(false));

    socket.emit("join-session", { code, role: "router" });
    addLog(`Joined session ${code}`);

    socket.on("user-connected", ({ role }) => {
      if (role === "admin") {
        setAdminConnected(true);
        addLog("Admin connected");
      }
    });

    socket.on("user-disconnected", ({ role }) => {
      if (role === "admin") {
        setAdminConnected(false);
        addLog("Admin disconnected");
      } else if (role === "agent") {
        setAgentConnected(false);
        addLog("Agent disconnected");
      }
    });

    socket.on("agent-connected", () => {
      setAgentConnected(true);
      addLog("Agent connected");
    });

    socket.on("session-status", (status) => {
      setAdminConnected(status.adminConnected);
      setAgentConnected(status.agentConnected);
      addLog(
        `Status synced: Admin ${status.adminConnected ? "Online" : "Offline"}, Agent ${status.agentConnected ? "Online" : "Offline"}`,
      );
    });

    socket.on("call-request", () => {
      setIncomingCall(true);
      addLog("Incoming video support request...");
    });

    socket.on("call-decline", () => {
      setIncomingCall(false);
      setIsCallActive(false);
      addLog("Call ended/declined.");
    });

    socket.on("call-accept", () => {
      setIncomingCall(false);
      setIsCallActive(true);
    });

    // Handle AT command via Web Serial if allowed
    socket.on("serial-command", async ({ command }) => {
      if (!portRef.current) {
        addLog("Error: Serial port not connected");
        socket.emit("command-result", { code, output: "Error: Router not connected to serial port on friend's PC" });
        return;
      }

      try {
        addLog(`Sending to serial: ${command}`);
        const encoder = new TextEncoderStream();
        const outputDone = encoder.readable.pipeTo(portRef.current.writable);
        const writer = encoder.writable.getWriter();
        await writer.write(command + "\r\n");
        writer.releaseLock();

        // Read response
        const decoder = new TextDecoderStream();
        const inputDone = portRef.current.readable.pipeTo(decoder.writable);
        const reader = decoder.readable.getReader();

        let response = "";
        try {
          while (true) {
            // Add a small timeout so we don't hang forever waiting for \r\n
            const { value, done } = await Promise.race([
              reader.read(),
              new Promise<any>((resolve) => setTimeout(() => resolve({ done: true, value: null }), 1000)),
            ]);

            if (done) break;
            if (value) {
              response += value;
              // Very basic heuristic for when to stop reading AT command response
              if (response.includes("OK\r\n") || response.includes("ERROR\r\n")) {
                break;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        addLog(`Received from serial: ${response.trim()}`);
        socket.emit("command-result", { code, output: response || "OK (No output)" });
      } catch (err: any) {
        addLog(`Serial error: ${err.message}`);
        socket.emit("command-result", { code, output: `Serial Error: ${err.message}` });
      }
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("user-connected");
      socket.off("user-disconnected");
      socket.off("agent-connected");

      socket.off("serial-command");
    };
  }, [code]);

  const connectSerial = async () => {
    try {
      // @ts-ignore
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;
      setSerialConnected(true);

      const info = port.getInfo();
      setPortName(`USB Device (${info.usbVendorId?.toString(16)}:${info.usbProductId?.toString(16)})`);
      addLog("Serial port connected successfully");
    } catch (err: any) {
      addLog(`Failed to connect serial: ${err.message}`);
    }
  };

  if (!code) {
    return <div className="p-8 text-white">Invalid session code.</div>;
  }

  return (
    <div className="relative h-screen bg-[#0a0a0a] text-white overflow-hidden">
      {/* Fullscreen Video Background */}
      {isCallActive && (
        <div className="absolute inset-0 z-0">
          <iframe
            src={`https://jitsi.riot.im/RouterUnlock_Secure_Session_${code}#userInfo.displayName="Client User"&config.prejoinPageEnabled=false&config.prejoinConfig.enabled=false&config.requireDisplayName=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&config.p2p.enabled=true&config.disableDeepLinking=true&interfaceConfig.ALPHAVIEW_EXIT_TIMEOUT=0`}
            allow="camera; microphone; display-capture; autoplay; clipboard-write; encrypted-media"
            className="w-full h-full border-none"
          />
        </div>
      )}

      {/* UI Layer - No blur here to keep items interactive */}
      <div className="relative z-10 flex flex-col h-full pointer-events-none">
        {/* Top Status Bar - Pointer events enabled for buttons */}
        <div
          className={`p-4 flex flex-wrap gap-4 items-center justify-between border-b transition-all pointer-events-auto ${isCallActive ? "bg-black/60 backdrop-blur-xl border-white/10" : "bg-gray-900 border-gray-800"}`}
        >
          <div className="flex items-center space-x-2 bg-black/60 px-3 py-1.5 rounded-md border border-white/5">
            <span className="text-gray-400 text-sm font-bold uppercase tracking-tighter">Session:</span>
            <span className="font-mono text-white tracking-widest">{code}</span>
          </div>

          <div className="flex flex-wrap gap-6 items-center">
            <div className="flex items-center space-x-2">
              <Server className={`w-4 h-4 ${serverConnected ? "text-green-500" : "text-red-500"}`} />
              <span className="text-[10px] font-black uppercase text-gray-400">Server</span>
            </div>
            <div className="flex items-center space-x-2">
              <User className={`w-4 h-4 ${adminConnected ? "text-green-500" : "text-gray-500"}`} />
              <span className="text-[10px] font-black uppercase text-gray-400">Admin</span>
            </div>
            <div className="flex items-center space-x-2">
              <Cpu className={`w-4 h-4 ${agentConnected ? "text-green-500" : "text-gray-500"}`} />
              <span className="text-[10px] font-black uppercase text-gray-400">Agent</span>
            </div>
            <div className="flex items-center space-x-2">
              <Usb className={`w-4 h-4 ${serialConnected ? "text-green-500" : "text-red-500"}`} />
              <span className="text-[10px] font-black uppercase text-gray-400">Serial</span>
            </div>

            {adminConnected && (
              <button
                onClick={() => {
                  addLog("Requesting video call with Admin...");
                  getSocket().emit("call-request", { code });
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-600/20"
              >
                <Video className="w-4 h-4" />
                Call Admin
              </button>
            )}

            {isCallActive && (
              <button
                onClick={() => setIsCallActive(false)}
                className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-black px-4 py-2 rounded-lg uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-red-600/20"
              >
                <X className="w-4 h-4" />
                End Call
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col w-full mx-auto p-4 md:p-8 space-y-6 overflow-hidden relative">
          
          {/* Main Connection Area (Only visible when no call) */}
          {!isCallActive && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden pointer-events-auto">
              <div className="absolute inset-0 bg-gradient-to-b from-blue-900/10 to-transparent"></div>
              <div className="relative z-10 w-full max-w-md">
                {!serialConnected ? (
                  <div className="space-y-6">
                    <div className="bg-blue-900/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto border border-blue-500/30">
                      <Usb className="w-12 h-12 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold mb-2 tracking-tight">Connect Router</h2>
                      <p className="text-gray-400 text-sm leading-relaxed">
                        Connect your 4G/5G router via USB and allow browser access to the COM port.
                      </p>
                    </div>
                    <button
                      onClick={connectSerial}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition-all active:scale-95"
                    >
                      Connect Serial Port
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-green-900/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto border border-green-500/30">
                      <Check className="w-12 h-12 text-green-400" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold mb-2 tracking-tight">Router Connected</h2>
                      <p className="text-gray-400 text-sm mb-1">Listening for commands from Admin...</p>
                      <p className="text-xs font-mono text-green-400 bg-green-900/20 py-1.5 px-3 rounded-md inline-block border border-green-500/20">
                        {portName || "COM Port Ready"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Local Logs - Twitch chat style overlay */}
          <div className={`flex flex-col transition-all duration-700 overflow-hidden pointer-events-auto ${
            isCallActive 
              ? 'absolute right-6 bottom-24 w-80 bg-black/20 backdrop-blur-sm rounded-2xl h-96' 
              : 'bg-black border border-gray-800 rounded-xl flex-1 min-h-[300px]'
          }`}>
            {!isCallActive && (
              <div className="p-3 border-b bg-gray-900 border-gray-800 flex justify-between items-center">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Activity Log</h3>
              </div>
            )}
            <div className={`flex-1 p-4 font-mono text-[11px] overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-gray-800 ${isCallActive ? 'mask-gradient-top' : ''}`}>
              {logs.map((log) => (
                <div key={log.id} className={`flex gap-3 ${isCallActive ? 'drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,1)]' : 'text-gray-300'}`}>
                  <span className={`${isCallActive ? 'text-blue-400 font-bold' : 'text-gray-600'} shrink-0`}>[{log.timestamp}]</span>
                  <span className={`break-all ${isCallActive ? 'text-white font-semibold' : 'opacity-80'}`}>{log.content}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Incoming Call Toast */}
      {incomingCall && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-right duration-500 pointer-events-auto">
          <div className="bg-gray-900 border border-blue-500 rounded-2xl p-4 w-72 shadow-[0_0_50px_rgba(37,99,235,0.2)] flex items-center gap-4 backdrop-blur-xl">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-blue-600/50">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-black text-white uppercase tracking-tight">Incoming Call</h3>
              <p className="text-[10px] text-gray-400">Admin is requesting support</p>
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={() => {
                    setIncomingCall(false);
                    getSocket().emit("call-decline", { code });
                  }}
                  className="flex-1 bg-white/5 hover:bg-red-600/20 text-gray-500 hover:text-red-500 py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 hover:border-red-500/20"
                >
                  Decline
                </button>
                <button 
                  onClick={() => {
                    setIncomingCall(false);
                    setIsCallActive(true);
                    getSocket().emit("call-accept", { code });
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/30"
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

export default function RouterPage() {
  return (
    <Suspense fallback={<div className="p-8 text-white bg-[#0a0a0a] min-h-screen">Loading Router Portal...</div>}>
      <RouterPageContent />
    </Suspense>
  );
}
