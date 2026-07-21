const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function registerIpcHandlers(ipcMain) {
  ipcMain.handle('db:query', async (event, { model, action, args }) => {
    try {
      if (!prisma[model] || typeof prisma[model][action] !== 'function') {
        throw new Error(`Invalid Prisma query: ${model}.${action}`);
      }
      const result = await prisma[model][action](args);
      return { success: true, data: result };
    } catch (error) {
      console.error(`Prisma IPC Error (${model}.${action}):`, error);
      return { success: false, error: error.message };
    }
  });

  // Future IPC handlers (barcode, printing, PDF generation, serial port reading)
}

module.exports = { registerIpcHandlers };
