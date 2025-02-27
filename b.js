const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// Replace with your bot token
const BOT_TOKEN = "8066612704:AAF89QTs_HLaMLRC9DfBHNcLVKqLl7jnAmc";

// Create a bot instance
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// API URLs
const CALLBACK_API_URL = "https://api.sahulatpay.com/backoffice/payin-callback";
const SETTLE_API_URL = "https://api.sahulatpay.com/backoffice/settle-transactions/tele";
const PAYOUT_API_URL = "https://api.sahulatpay.com/disbursement/tele";
const PAYOUT_CALLBACK_API_URL = "https://api.sahulatpay.com/backoffice/payout-callback";
const FAIL_API_URL = "https://api.sahulatpay.com/backoffice/fail-transactions/tele";

// Function to handle the transaction
const handleTransactionAndPayout = async (chatId, order, type = "transaction") => {
    try {
        console.log(`Starting ${type} handling for order: ${order}`);
        
        let apiUrl;
        if (type === "transaction") {
            apiUrl = `https://api.sahulatpay.com/transactions/tele?merchantTransactionId=${order}`;
        } else if (type === "payout") {
            apiUrl = `${PAYOUT_API_URL}?merchantTransactionId=${[order]}`;
        } else {
            console.error("Invalid type specified.");
            await bot.sendMessage(chatId, "Invalid transaction type.");
            return;
        }

        const response = await axios.get(apiUrl);
        console.log("API Response:", response.data);

        let transaction;
        if (type === "transaction") {
            transaction = response.data.transactions?.[0];
        } else {
            const payoutData = response.data?.data?.transactions;
            if (!payoutData || !payoutData.length) {
                console.log(`No transactions found for order: ${order}`);
                await bot.sendMessage(chatId, `Transaction (${order}) not found in back-office.`);
                return;
            }
            transaction = payoutData[0]
        }

        if (!transaction) {
            console.log(`Transaction with order ID ${order} not found.`);
            await bot.sendMessage(chatId,`Transaction   "${order}" not found in back-office.`);
            return;
        }

        console.log("Transaction Details:", JSON.stringify(transaction, null, 2));

        let status = transaction.status.trim().toLowerCase();
        let merchantTransactionId = transaction.merchant_transaction_id || transaction.merchant_custom_order_id;
        let uid = transaction.merchant?.uid || transaction.merchant?.groups?.[0]?.uid || transaction.merchant?.groups?.[0]?.merchant?.uid;

        if (status === "completed") {
            let merchantTransactionId = type === "payout" 
                ? transaction.merchant_custom_order_id 
                : transaction.merchant_transaction_id; // Corrected field name
        
            if (!merchantTransactionId) {
                console.error("Error: merchantTransactionId is undefined.");
                await bot.sendMessage(chatId, "Error: Missing transaction ID.");
                return;
            }
        
            console.log(`Transaction ${merchantTransactionId} is already completed.`);
        
            // Determine the correct callback API based on type
            const callbackUrl = type === "payout" ? PAYOUT_CALLBACK_API_URL : CALLBACK_API_URL;
        
            try {
                const callbackResponse = await axios.post(callbackUrl, { transactionIds: [merchantTransactionId] });
                console.log("Callback API Response:", callbackResponse.data);
                await bot.sendMessage(chatId, `Transaction Status ${merchantTransactionId} : Completed.`);
            } catch (error) {
                console.error("Error calling callback API:", error.response?.data || error.message);
                await bot.sendMessage(chatId, "Error updating transaction status.");
            }
        
            return;
        }   
        // Only perform status inquiry if the transaction is not completed
        if (type === "transaction" && uid) {
            let providerName = transaction.providerDetails?.name?.toLowerCase();
            let inquiryUrl, inquiryResponse;

            if (providerName === "easypaisa") {
                inquiryUrl = `https://api.sahulatpay.com/payment/inquiry-ep/${uid}?orderId=${order}`;
                inquiryResponse = await axios.get(inquiryUrl, { params: { transaction_id: merchantTransactionId } });
            } else if (providerName === "jazzcash") {
                inquiryUrl = `https://api.sahulatpay.com/payment/status-inquiry/${uid}`;
                inquiryResponse = await axios.post(inquiryUrl, { transactionId: merchantTransactionId });
            }

            if (inquiryResponse) {
                console.log("Inquiry API Response:", inquiryResponse.data);
                let inquiryStatus = inquiryResponse?.data?.data?.transactionStatus?.toLowerCase();
                let inquiryStatusCode = inquiryResponse?.data?.data?.statusCode;
                
                if (!inquiryStatus || inquiryStatus === "failed" || inquiryStatusCode === 500) {
                    await axios.post(FAIL_API_URL, { transactionIds: [merchantTransactionId] });
                    console.log(`Transaction ${merchantTransactionId} marked as failed.`);
                    await bot.sendMessage(chatId, ` ${merchantTransactionId} Status : Failed.`);
                    return;
                } else if (inquiryStatus === "completed") {
                    await axios.post(SETTLE_API_URL, { transactionId: merchantTransactionId });
                    console.log(`Transaction ${merchantTransactionId} marked as completed.`);
                    await bot.sendMessage(chatId, `Transaction Status  ${merchantTransactionId} : Completed.`);
                    return;
                }
            }
        }

        console.log(`Final Status for transaction ${merchantTransactionId}: Failed.`);
        await bot.sendMessage(chatId, ` ${merchantTransactionId} Status : Failed.`);
    } catch (error) {
        console.error("Error handling transaction:", error);
        await bot.sendMessage(chatId, `Error: ${error.message}`);
    }
};



// Handle /in command for transactions (multiple IDs supported)
bot.onText(/\/in (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const orders = match[1].trim().split(/\s+/); // Split message into multiple order IDs

    orders.forEach(order => {
        handleTransactionAndPayout(chatId, order, "transaction");
    });
});

// Handle /out command for payouts (multiple IDs supported)
bot.onText(/\/out (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const orders = match[1].trim().split(/\s+/); // Split message into multiple order IDs

    orders.forEach(order => {
        handleTransactionAndPayout(chatId, order, "payout");
    });
});

// Handle image messages with caption (multiple IDs supported)
bot.on("photo", (msg) => {
    const chatId = msg.chat.id;

    if (msg.caption) {
        const parts = msg.caption.split(/\s+/); // Split caption into words
        const command = parts[0];

        if (command === "/out" || command === "/in") {
            const type = command === "/out" ? "payout" : "transaction";
            const orders = parts.slice(1); // Extract all order IDs

            if (orders.length > 0) {
                orders.forEach(order => {
                    handleTransactionAndPayout(chatId, order.trim(), type);
                });
            } else {
                bot.sendMessage(chatId, "Please provide at least one order ID after the command.");
            }
        }
    }
});