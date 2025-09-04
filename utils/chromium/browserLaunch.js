import puppeteer from 'puppeteer-core';
import { executablePath } from 'puppeteer'; // works in puppeteer v21+

const getBrowserInstance = async () => {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: executablePath(), // system Chrome on Render
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    return browser;
};

export default getBrowserInstance;
