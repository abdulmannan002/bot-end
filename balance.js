const axios = require('axios');
require('dotenv').config();

// Telegram configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7239638999:AAErnD18JZbw_jnEgf964Mp9y1gz25IkVH0';

// Merchant mappings with IDs and names
const MERCHANTS = [
    { merchant_id: 51, full_name: 'Monetix', url: 'https://server.sahulatpay.com/transactions/tele?merchantId=51' },
    { merchant_id: 5, full_name: 'Bilal3', url: 'https://server.sahulatpay.com/transactions/tele?merchantId=5' },
    { merchant_id: 16, full_name: 'WINPAY', url: 'https://server.sahulatpay.com/transactions/tele?merchantId=16' }
];

// Global offset
let lastUpdateId = 0;

// Utility function to escape MarkdownV2
function escapeMarkdown(text) {
    if (!text) return 'N/A';
    return String(text).replace(/[_*[\]()~`>#+-=|{}.!\\]/g, '\\$&');
}

// Function to find merchant by ID or name (case-insensitive)
function findMerchant(identifier) {
    const id = parseInt(identifier, 10);
    if (!isNaN(id)) {
        return MERCHANTS.find(merchant => merchant.merchant_id === id);
    }
    return MERCHANTS.find(merchant => 
        merchant.full_name.toLowerCase() === identifier.toLowerCase()
    );
}

// Function to get valid merchant identifiers
function getValidIdentifiers() {
    const ids = MERCHANTS.map(m => m.merchant_id.toString());
    const names = MERCHANTS.map(m => m.full_name);
    return [...ids, ...names].map(escapeMarkdown).join(', ');
}

// Function to fetch transactions
async function fetchTransactions(url) {
    try {
        const response = await axios.get(url);
        return response.data.transactions || [];
    } catch (error) {
        return [];
    }
}

// Function to send Telegram message
async function sendTelegramMessage(chatId, message) {
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        if (message.length > 4096) {
            message = message.substring(0, 4000) + '\n*Message truncated.*';
        }

        await axios.post(telegramUrl, {
            chat_id: chatId,
            text: message,
            parse_mode: 'MarkdownV2'
        });
    } catch (error) {
        try {
            await axios.post(telegramUrl, {
                chat_id: chatId,
                text: 'Error: Failed to send summary. Try again.'
            });
        } catch (fallbackError) {
            // Silent
        }
    }
}

// Function to check user messages
async function checkUserResponse() {
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
    try {
        const response = await axios.get(telegramUrl);
        const updates = response.data.result;

        for (let update of updates) {
            lastUpdateId = update.update_id;
            if (update.message && update.message.text) {
                const chatId = update.message.chat.id;
                const text = update.message.text.trim();

                if (text === '/start') {
                    await sendTelegramMessage(
                        chatId,
                        'Welcome\\! Use `/update <identifier>` for summaries\\.\nValid IDs or names: ' +
                        getValidIdentifiers()
                    );
                } else if (text.startsWith('/update')) {
                    const parts = text.split(' ');
                    const identifier = parts[1];
                    const merchant = findMerchant(identifier);
                    if (merchant) {
                        await handleUpdateCommand(chatId, merchant.merchant_id, merchant.url);
                    } else {
                        await sendTelegramMessage(
                            chatId,
                            `❌ Invalid identifier: ${escapeMarkdown(identifier)}\\. Valid IDs or names: ` +
                            getValidIdentifiers()
                        );
                    }
                }
            }
        }
    } catch (error) {
        // Silent
    }
}

// Function to handle update command
async function handleUpdateCommand(chatId, merchantId, url) {
    const transactions = await fetchTransactions(url);
    if (transactions.length === 0) {
        await sendTelegramMessage(
            chatId,
            `No transactions found for Merchant ID ${escapeMarkdown(merchantId.toString())}\\.`
        );
        return;
    }

    // Process transactions
    let completedCount = 0;
    let totalBalance = 0;
    let todayCollection = 0;
    const today = new Date().toLocaleDateString('en-US'); // "4/14/2025"

    transactions.forEach(txn => {
        const amount = parseFloat(txn.original_amount) || 0;
        const txnDate = new Date(txn.date_time).toLocaleDateString('en-US');

        if (txn.status === 'completed') {
            completedCount++;
            totalBalance += amount;
            if (txnDate === today) {
                todayCollection += amount;
            }
        }
    });

    const successRate = transactions.length > 0 
        ? ((completedCount / transactions.length) * 100).toFixed(2) 
        : 0;

    // Format summary
    const message = `*Summary for Merchant ID ${escapeMarkdown(merchantId.toString())}\n\n` +
                   `📊 *Total Transactions*: ${escapeMarkdown(transactions.length.toString())}\n` +
                   `✅ *Success Rate*: ${escapeMarkdown(successRate)}%\n` +
                   `💵 *Total Balance \\(Completed\\)*: ${escapeMarkdown(totalBalance.toFixed(2))}\n` +
                   `📈 *Today's Collection*: ${escapeMarkdown(todayCollection.toFixed(2))}\n`;

    await sendTelegramMessage(chatId, message);
}

// Start monitoring
async function monitorCommands() {
    while (true) {
        await checkUserResponse();
    }
}

monitorCommands().catch(() => {
    // Silent
});