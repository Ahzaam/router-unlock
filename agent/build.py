import os
import subprocess
import sys
import time

def kill_running_agent():
    print("Checking for running instances of RouterAgent.exe...")
    if sys.platform == "win32":
        try:
            subprocess.run(["taskkill", "/F", "/IM", "RouterAgent.exe", "/T"], 
                           capture_output=True, check=False)
            time.sleep(1) # Give it a second to release the file
        except Exception:
            pass

def build():
    print("Building Agent...")
    
    # Kill existing process first
    kill_running_agent();
    
    # Ensure pyinstaller is installed
    try:
        import PyInstaller
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
        
    # Install requirements
    print("Installing requirements...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
    
    # Run pyinstaller
    print("Running PyInstaller...")
    subprocess.check_call([
        sys.executable, "-m", "PyInstaller", 
        "--onefile", 
        "--windowed", 
        "--name=RouterAgent", 
        "agent.py"
    ])
    
    print("Build complete! Check the 'dist' folder for RouterAgent.exe")

if __name__ == "__main__":
    build()
