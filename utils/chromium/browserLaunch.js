import puppeteer from 'puppeteer';

const getBrowserInstance = async () => {
    try {
        const browser = await puppeteer.launch({
            headless: true, // or "new" for newer Puppeteer
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-zygote',
                '--disable-gpu'
            ],
            ignoreHTTPSErrors: true,
            timeout: 60000,          // give Chrome more time to boot
            protocolTimeout: 60000
        });

        browser.on('disconnected', () => {
            console.log('Browser disconnected');
        });

        return browser;
    } catch (error) {
        console.error('Error launching browser:', error);
        throw error;
    }
};

export default getBrowserInstance;
