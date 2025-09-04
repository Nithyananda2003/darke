import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { search } from './controllers/darke/search.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Test route
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body>
                <h2>Darke County Scraper Test</h2>
                <form action="/test" method="POST">
                    <label>Account Number: <input type="text" name="account" placeholder="e.g., 12-34-567890" required></label><br><br>
                    <input type="hidden" name="fetch_type" value="html">
                    <button type="submit">Test Scraper</button>
                </form>
                <br>
                <form action="/test-api" method="POST">
                    <label>Account Number: <input type="text" name="account" placeholder="e.g., 12-34-567890" required></label><br><br>
                    <input type="hidden" name="fetch_type" value="api">
                    <button type="submit">Test API</button>
                </form>
            </body>
        </html>
    `);
});

// Test routes
app.post('/test', search);
app.post('/test-api', search);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});