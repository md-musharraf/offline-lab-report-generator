/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Frontend database abstraction layer.
 * All queries are routed via IPC to the main process's Prisma client.
 */

export const db = new Proxy(
  {},
  {
    get: (_, model) => {
      return new Proxy(
        {},
        {
          get: (_, action: string) => {
            return async (args?: unknown) => {
              if (typeof window === 'undefined') {
                throw new Error('Database can only be accessed from the client (renderer) process via IPC.');
              }

              const result = await window.electron.ipcRenderer.invoke('db:query', {
                model,
                action,
                args,
              }) as any;

              if (!result.success) {
                throw new Error(result.error);
              }

              return result.data;
            };
          },
        }
      );
    },
  }
) as any;
