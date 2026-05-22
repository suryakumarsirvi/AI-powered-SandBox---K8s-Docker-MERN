import pty from 'node-pty';
import { WebSocket } from 'ws';

export class TerminalManager {
    private activeTerminals = new Map<string, pty.IPty>();

    constructor(private workspaceDir: string) {}

    /**
     * Spawns a new terminal process and maps it to a unique terminal ID.
     */
    public spawn(
        terminalId: string, 
        ws: WebSocket, 
        cols: number = 80, 
        rows: number = 24
    ): pty.IPty {
        // Kill existing terminal if it shares the ID
        this.kill(terminalId);

        // Spawn shell (using bash if available, falling back to sh)
        const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
        
        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-color',
            cols,
            rows,
            cwd: this.workspaceDir,
            env: process.env as Record<string, string>
        });

        // Listen for output from PTY process and stream it to the WebSocket client
        ptyProcess.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    action: 'term:output',
                    payload: {
                        terminalId,
                        data
                    }
                }));
            }
        });

        // Handle process exit cleanly
        ptyProcess.onExit(({ exitCode, signal }) => {
            this.activeTerminals.delete(terminalId);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    action: 'term:exit',
                    payload: {
                        terminalId,
                        exitCode,
                        signal
                    }
                }));
            }
        });

        this.activeTerminals.set(terminalId, ptyProcess);
        return ptyProcess;
    }

    /**
     * Writes data directly to the specified terminal's input stream.
     */
    public write(terminalId: string, data: string): void {
        const ptyProcess = this.activeTerminals.get(terminalId);
        if (ptyProcess) {
            ptyProcess.write(data);
        }
    }

    /**
     * Resizes the columns and rows of the specified terminal dynamically.
     */
    public resize(terminalId: string, cols: number, rows: number): void {
        const ptyProcess = this.activeTerminals.get(terminalId);
        if (ptyProcess) {
            try {
                ptyProcess.resize(cols, rows);
            } catch (err) {
                console.error(`Failed to resize terminal ${terminalId}:`, err);
            }
        }
    }

    /**
     * Terminate the specific terminal process and clean up map reference.
     */
    public kill(terminalId: string): void {
        const ptyProcess = this.activeTerminals.get(terminalId);
        if (ptyProcess) {
            try {
                ptyProcess.kill();
            } catch (err) {
                console.error(`Error killing terminal ${terminalId}:`, err);
            }
            this.activeTerminals.delete(terminalId);
        }
    }

    /**
     * Terminate all active terminals (e.g., when the agent is shutting down).
     */
    public killAll(): void {
        for (const terminalId of this.activeTerminals.keys()) {
            this.kill(terminalId);
        }
    }
}
