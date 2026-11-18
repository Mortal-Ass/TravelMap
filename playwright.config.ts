import {defineConfig} from '@playwright/test';
const baseURL=process.env.WEB_TEST_URL??'http://127.0.0.1:5173';
export default defineConfig({testDir:'tests/e2e',use:{baseURL,channel:process.env.BROWSER_CHANNEL,launchOptions:{args:process.env.TEST_CERT_SPKI ? ["--ignore-certificate-errors-spki-list="+process.env.TEST_CERT_SPKI] : []}},webServer:{command:'npm run dev:web',url:baseURL,reuseExistingServer:true}});
