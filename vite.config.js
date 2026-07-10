import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'

const excelCheckPlugin = () => ({
  name: 'excel-check-plugin',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === '/api/excel-running') {
        res.setHeader('Content-Type', 'application/json');
        
        if (process.platform === 'win32') {
          exec('tasklist /FI "IMAGENAME eq excel.exe"', (err, stdout) => {
            if (err) {
              res.end(JSON.stringify({ excelRunning: false, error: err.message }));
              return;
            }
            const isRunning = stdout.toLowerCase().includes('excel.exe');
            res.end(JSON.stringify({ excelRunning: isRunning }));
          });
        } else {
          res.end(JSON.stringify({ excelRunning: false }));
        }
        return;
      }
      next();
    });
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), excelCheckPlugin()],
  base: './',
})
