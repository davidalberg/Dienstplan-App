import { defineConfig, devices } from '@playwright/test'
import path from 'path'

// Load test environment variables
require('dotenv').config({ path: path.resolve(__dirname, '.env.test') })

export default defineConfig({
    testDir: './tests',
    fullyParallel: false, // Sequential for reliable DB states
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1, // Sequential due to DB state dependencies
    reporter: [
        ['html'],
        ['list'],
        ['json', { outputFile: 'test-results/results.json' }]
    ],

    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        actionTimeout: 15000,
        navigationTimeout: 30000,
    },

    projects: [
        // Setup project for global authentication
        {
            name: 'setup',
            testMatch: /.*\.setup\.ts/,
        },
        // Employee tests (default)
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'tests/.auth/employee.json',
            },
            dependencies: ['setup'],
            testIgnore: /admin.*\.spec\.ts/,
        },
        // Admin tests need separate auth
        {
            name: 'admin',
            testMatch: /admin.*\.spec\.ts/,
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'tests/.auth/admin.json',
            },
            dependencies: ['setup'],
        },
    ],

    // Local dev server
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
})
