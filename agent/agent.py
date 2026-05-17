import socketio
import tkinter as tk
from tkinter import scrolledtext, messagebox
import subprocess
import threading
import webbrowser
import shutil
import requests
import sys
import os
import time
import random
import string
import socket
import base64
import urllib3

# Disable insecure request warnings for proxying to local routers
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Create a Socket.IO client
sio = socketio.Client()

DEFAULT_SERVER_URL = "https://router-unlock-396094248264.europe-west1.run.app" 
SESSION_CODE = "".join(random.choices(string.digits, k=6))
SESSION_NAME = socket.gethostname() 

class AgentGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Router Remote Tool - Agent (Hands-Free)")
        self.root.geometry("500x600")
        self.root.configure(bg="#0a0a0a")
        
        self.current_server_url = DEFAULT_SERVER_URL
        self.is_connecting = False

        # Status Bar
        self.status_frame = tk.Frame(self.root, bg="#0a0a0a")
        self.status_frame.pack(pady=15, fill=tk.X, padx=20)
        
        self.status_indicator = tk.Canvas(self.status_frame, width=15, height=15, bg="#0a0a0a", highlightthickness=0)
        self.status_indicator.pack(side=tk.LEFT)
        self.status_circle = self.status_indicator.create_oval(2, 2, 13, 13, fill="red")
        
        self.status_label = tk.Label(self.status_frame, text="OFFLINE", fg="white", bg="#0a0a0a", font=("Helvetica", 10, "bold"))
        self.status_label.pack(side=tk.LEFT, padx=10)

        # Settings Toggle
        self.settings_btn = tk.Button(self.status_frame, text="⚙ Settings", command=self.toggle_settings, 
                                     bg="#222", fg="gray", font=("Helvetica", 8), bd=0, padx=10)
        self.settings_btn.pack(side=tk.RIGHT)

        # Settings Panel (Hidden by default)
        self.settings_panel = tk.Frame(self.root, bg="#111", bd=1, relief=tk.SUNKEN)
        self.url_var = tk.StringVar(value=self.current_server_url)
        
        tk.Label(self.settings_panel, text="SERVER CONNECTION URL:", fg="gray", bg="#111", font=("Helvetica", 7, "bold")).pack(pady=(10,0))
        self.url_entry = tk.Entry(self.settings_panel, textvariable=self.url_var, bg="black", fg="white", insertbackground="white", font=("Consolas", 9), bd=0)
        self.url_entry.pack(pady=5, padx=20, fill=tk.X)
        
        self.apply_btn = tk.Button(self.settings_panel, text="Apply & Reconnect", command=self.apply_settings, 
                                  bg="#2563eb", fg="white", font=("Helvetica", 8, "bold"), bd=0, pady=5)
        self.apply_btn.pack(pady=10, padx=20, fill=tk.X)

        # Info Panel
        self.info_frame = tk.Frame(self.root, bg="#111", bd=1, relief=tk.RIDGE)
        self.info_frame.pack(pady=10, fill=tk.X, padx=20, ipady=10)
        
        tk.Label(self.info_frame, text="SESSION INFORMATION", fg="gray", bg="#111", font=("Helvetica", 8, "bold")).pack(pady=(5,0))
        
        self.code_label = tk.Label(self.info_frame, text=f"CODE: {SESSION_CODE}", fg="#00ff00", bg="#111", font=("Consolas", 18, "bold"))
        self.code_label.pack()
        
        self.name_label = tk.Label(self.info_frame, text=f"PC NAME: {SESSION_NAME}", fg="white", bg="#111", font=("Helvetica", 10))
        self.name_label.pack()

        # Data Transfer Status
        self.file_frame = tk.Frame(self.root, bg="#0a0a0a")
        self.file_frame.pack(pady=10, fill=tk.X, padx=20)
        self.upload_progress = tk.Label(self.file_frame, text="System Ready - Waiting for Admin", fg="#2563eb", bg="#0a0a0a", font=("Helvetica", 9, "italic"))
        self.upload_progress.pack()

        # Activity Log
        tk.Label(self.root, text="ACTIVITY LOG:", fg="gray", bg="#0a0a0a", font=("Helvetica", 8, "bold")).pack(anchor=tk.W, padx=20, pady=(10,0))
        self.log_area = scrolledtext.ScrolledText(self.root, bg="black", fg="#00ff00", font=("Consolas", 10), height=15)
        self.log_area.pack(padx=20, pady=5, fill=tk.BOTH, expand=True)
        self.log_area.config(state=tk.DISABLED)

        # Ensure received files directory exists
        self.received_dir = os.path.join(os.getcwd(), "received_files")
        if not os.path.exists(self.received_dir):
            os.makedirs(self.received_dir)

        # Start process automatically
        self.setup_socket_events()
        self.root.after(1000, self.auto_start)

    def toggle_settings(self):
        if self.settings_panel.winfo_viewable():
            self.settings_panel.pack_forget()
        else:
            self.settings_panel.pack(after=self.status_frame, fill=tk.X, padx=20, pady=5)

    def apply_settings(self):
        new_url = self.url_var.get().strip()
        if not new_url:
            messagebox.showerror("Error", "URL cannot be empty")
            return
        
        self.current_server_url = new_url
        self.log(f"Updating Server URL to: {new_url}")
        
        if sio.connected:
            sio.disconnect()
        
        self.settings_panel.pack_forget()
        threading.Thread(target=self.connect_socket, daemon=True).start()

    def log(self, message):
        self.log_area.config(state=tk.NORMAL)
        self.log_area.insert(tk.END, f"> {message}\n")
        self.log_area.see(tk.END)
        self.log_area.config(state=tk.DISABLED)

    def set_status(self, connected):
        color = "#00ff00" if connected else "red"
        text = "ONLINE" if connected else "OFFLINE"
        self.status_indicator.itemconfig(self.status_circle, fill=color)
        self.status_label.config(text=text)

    def update_admin_status(self, connected):
        if connected:
            self.upload_progress.config(text="✅ Admin Connected", fg="#00ff00")
            self.log("Admin has joined the session.")
        else:
            self.upload_progress.config(text="System Ready - Waiting for Admin", fg="#2563eb")
            self.log("Admin has disconnected.")

    def setup_socket_events(self):
        @sio.event
        def connect():
            self.root.after(0, self.set_status, True)
            self.root.after(0, self.log, "Connected to server")
            sio.emit('agent-create-session', {'code': SESSION_CODE, 'name': SESSION_NAME})

        @sio.event
        def disconnect():
            self.root.after(0, self.set_status, False)
            self.root.after(0, self.log, "Disconnected from server")

        @sio.on('session-status')
        def on_session_status(data):
            if data.get('adminConnected'):
                self.root.after(0, self.update_admin_status, True)

        @sio.on('user-connected')
        def on_user_connected(data):
            if data.get('role') == 'admin':
                self.root.after(0, self.update_admin_status, True)

        @sio.on('user-disconnected')
        def on_user_disconnected(data):
            if data.get('role') == 'admin':
                self.root.after(0, self.update_admin_status, False)

        @sio.on('execute-command')
        def on_execute_command(data):
            command = data.get('command')
            self.root.after(0, self.handle_command, command)

        @sio.on('request-upload')
        def on_request_upload(data):
            path = data.get('path')
            if path:
                self.root.after(0, self.log, f"Remote upload request for: {path}")
                threading.Thread(target=self.upload_path, args=(path,), daemon=True).start()

        @sio.on('download-file')
        def on_download_file(data):
            url = data.get('url')
            filename = data.get('filename')
            if url and filename:
                self.root.after(0, self.log, f"Receiving file from Admin: {filename}")
                threading.Thread(target=self.download_from_url, args=(url, filename), daemon=True).start()

        @sio.on('network-scan')
        def on_network_scan(data):
            self.root.after(0, self.log, "Starting local network scan...")
            threading.Thread(target=self.scan_network, daemon=True).start()

        @sio.on('proxy-request')
        def on_proxy_request(data):
            request_id = data.get('requestId')
            target = data.get('target')
            method = data.get('method', 'GET')
            threading.Thread(target=self.perform_proxy, args=(request_id, target, method), daemon=True).start()

    def auto_start(self):
        self.log("Initializing hands-free mode...")
        # Note: We don't open browser here because URL might change
        threading.Thread(target=self.connect_socket, daemon=True).start()

    def connect_socket(self):
        try:
            if not sio.connected:
                self.log(f"Attempting to connect to {self.current_server_url}...")
                sio.connect(self.current_server_url)
                # Once connected, open the router page
                webbrowser.open(f"{self.current_server_url}/router?code={SESSION_CODE}")
        except Exception as e:
            self.root.after(0, self.log, f"Connection failed. Please check 'Settings' if needed.")
            time.sleep(5)
            # Re-try automatically unless user is editing
            if not self.settings_panel.winfo_viewable():
                self.connect_socket()

    def scan_network(self):
        try:
            result = subprocess.run("arp -a", shell=True, capture_output=True, text=True)
            devices = []
            for line in result.stdout.split('\n'):
                if 'dynamic' in line.lower() or 'static' in line.lower():
                    parts = line.split()
                    if len(parts) >= 2:
                        devices.append({'ip': parts[0], 'mac': parts[1]})
            
            self.log(f"Scan complete. Found {len(devices)} devices.")
            sio.emit('network-scan-result', {'code': SESSION_CODE, 'devices': devices})
        except Exception as e:
            self.root.after(0, self.log, f"Scan error: {str(e)}")

    def handle_command(self, command):
        self.log(f"Executing remote CMD: {command}")
        threading.Thread(target=self.execute_system_command, args=(command,), daemon=True).start()

    def upload_path(self, target_path):
        try:
            if not os.path.exists(target_path):
                self.root.after(0, self.log, f"❌ Path does not exist: {target_path}")
                return

            is_file = os.path.isfile(target_path)
            if is_file:
                filename = os.path.basename(target_path)
                final_path = target_path
            else:
                folder_name = os.path.basename(target_path.rstrip('/\\')) or "folder"
                zip_base = f"upload_{SESSION_CODE}_{int(time.time())}"
                final_path = shutil.make_archive(zip_base, 'zip', target_path)
                filename = os.path.basename(final_path)

            with open(final_path, 'rb') as f:
                response = requests.post(f"{self.current_server_url}/upload/{SESSION_CODE}", files={'file': f}, timeout=900)
            
            if not is_file: os.remove(final_path)
            if response.status_code == 200:
                self.root.after(0, self.log, f"✅ Upload successful: {filename}")
        except Exception as e:
            self.root.after(0, self.log, f"❌ Upload error: {str(e)}")

    def download_from_url(self, url, filename):
        try:
            save_path = os.path.join(self.received_dir, filename)
            response = requests.get(url, stream=True, timeout=300)
            if response.status_code == 200:
                with open(save_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192): f.write(chunk)
                self.root.after(0, self.log, f"✅ File received: {save_path}")
                os.startfile(self.received_dir)
        except Exception as e:
            self.root.after(0, self.log, f"❌ Download error: {str(e)}")

    def perform_proxy(self, request_id, target, method):
        self.root.after(0, self.log, f"Proxying {method} request to: {target}")
        attempts = 0
        while attempts < 3:
            try:
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
                res = requests.request(method, target, timeout=15, verify=False, headers=headers)
                content_b64 = base64.b64encode(res.content).decode('utf-8')
                sio.emit('proxy-response', {'requestId': request_id, 'status': res.status_code, 'headers': dict(res.headers), 'content': content_b64})
                return
            except Exception as e:
                attempts += 1
                time.sleep(0.5)
        sio.emit('proxy-response', {'requestId': request_id, 'error': "Failed after 3 retries"})

    def execute_system_command(self, command):
        try:
            result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30)
            output = result.stdout + (f"\n[Errors]:\n{result.stderr}" if result.stderr else "")
            sio.emit('command-result', {'code': SESSION_CODE, 'output': output or "Command executed"})
        except Exception as e:
            sio.emit('command-result', {'code': SESSION_CODE, 'output': f'Error: {str(e)}'})

def main():
    root = tk.Tk()
    app = AgentGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()
