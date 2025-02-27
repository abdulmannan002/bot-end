const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input"); // npm install input
const axios = require("axios"); // npm install axios

const apiId = 17197921;
const apiHash = "372655eca8aa7af41e2e92a0d9b7f333";
const stringSession = new StringSession(""); // Save session after first login

const chatId = "-1002309396691"; // Replace with your chat ID
const apiUrl = "https://api.sahulatpay.com/transactions/tele?status=failed&response_message=Transaction";

let sentMessages = new Set(); // Stores already sent messages
let client; // Global client instance

// ✅ Function to fetch failed transactions for today up to the current time
const fetchMerchantTransactionIds = async () => {
    try {
        const response = await axios.get(apiUrl);
        if (!response.data || typeof response.data !== "object") return [];

        let transactions = response.data.transactions || response.data;
        if (!Array.isArray(transactions)) return [];

        const now = new Date(); // Current date & time

        return transactions
            .filter(tx => {
                const txDate = new Date(tx.date_time);
                return (
                    txDate.toISOString().split("T")[0] === now.toISOString().split("T")[0] && // Must be today's date
                    txDate <= now // Must be before or at the current time
                );
            })
            .map(tx => tx.merchant_transaction_id)
            .filter(id => id && !sentMessages.has(id)); // Only keep new IDs
    } catch (error) {
        console.error("Error fetching transactions:", error);
        return [];
    }
};

// ✅ Function to send messages with delay
const sendMessagesWithDelay = async (messages) => {
    for (let message of messages) {
        try {
            console.log(`Sending: /in ${message}`);
            await client.sendMessage(chatId, { message: `/in ${message}` });

            sentMessages.add(message); // Mark as sent
        } catch (err) {
            console.error(`Failed to send: ${message}`, err);
        }

        await new Promise(resolve => setTimeout(resolve, 5000)); // Delay 5 sec
    }
};

// ✅ Function to process transactions and send messages
const processTransactions = async () => {
    const newMessages = await fetchMerchantTransactionIds();
    if (newMessages.length > 0) {
        // ✅ Mark messages as sent BEFORE sending to avoid duplicates
        newMessages.forEach(msg => sentMessages.add(msg));

        await sendMessagesWithDelay(newMessages);
    }
};

// ✅ Main function to start Telegram bot
(async () => {
    client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text("Enter your phone number: "),
        password: async () => await input.text("Enter your 2FA password (if enabled): "),
        phoneCode: async () => await input.text("Enter the Telegram code you received: "),
        onError: (err) => console.log(err),
    });

    console.log("Logged in as:", await client.getMe());
    console.log("Session:", client.session.save()); // Save session for future use

    // ✅ Run the process every 10 seconds
    setInterval(processTransactions, 10000);
})();
