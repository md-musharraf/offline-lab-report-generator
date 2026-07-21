interface Window {
  electron: {
    ipcRenderer: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, listener: (...args: unknown[]) => void) => () => void;
      once: (channel: string, listener: (...args: unknown[]) => void) => void;
    };
  };
}
