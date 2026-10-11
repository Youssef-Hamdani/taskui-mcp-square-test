import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'test/ui',use:{baseURL:'http://127.0.0.1:3100'},webServer:{command:'PORT=3100 node server.mjs',url:'http://127.0.0.1:3100/health',reuseExistingServer:false},reporter:'list'});
