import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import { env } from 'process';

const baseFolder =
    env.APPDATA !== undefined && env.APPDATA !== ''
        ? `${env.APPDATA}/ASP.NET/https`
        : `${env.HOME}/.aspnet/https`;

const certificateName = "my_media.client";
const certFilePath = path.join(baseFolder, `${certificateName}.pem`);
const keyFilePath = path.join(baseFolder, `${certificateName}.key`);

if (!fs.existsSync(baseFolder)) {
    fs.mkdirSync(baseFolder, { recursive: true });
}

if (!fs.existsSync(certFilePath) || !fs.existsSync(keyFilePath)) {
    if (0 !== child_process.spawnSync('dotnet', [
        'dev-certs',
        'https',
        '--export-path',
        certFilePath,
        '--format',
        'Pem',
        '--no-password',
    ], { stdio: 'inherit', }).status) {
        throw new Error("Could not create certificate.");
    }
}

const devPort = parseInt(env.DEV_SERVER_PORT || '53464');
const apiTarget = 'http://localhost:5017';

export default defineConfig(({ command }) => ({
    plugins: [plugin()],
    define: {
        'process.env.REACT_APP_API_URL': JSON.stringify(
            env.VITE_API_URL || (command === 'serve' ? `https://localhost:${devPort}` : apiTarget)
        )
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    server: {
        proxy: {
            '/api': {
                target: apiTarget,
                changeOrigin: true,
                secure: false
            },
            '/hubs': {
                target: apiTarget,
                changeOrigin: true,
                secure: false,
                ws: true
            },
            '/uploads': {
                target: apiTarget,
                changeOrigin: true,
                secure: false
            }
        },
        port: devPort,
        https: {
            key: fs.readFileSync(keyFilePath),
            cert: fs.readFileSync(certFilePath),
        }
    }
}))
