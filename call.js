const axios = require('axios');
const schedule = require('node-schedule');

// Configuration
const MERCHANT_IDS = [5, 51,16]; // Add your merchant IDs
const BASE_URL = "https://server.sahulatpay.com/transactions/tele/last-15-mins?merchantId=";
const CALLBACK_URL = "https://server.sahulatpay.com/backoffice/payin-callback";

// Track processed transactions to avoid duplicates
const processedTransactions = new Set();

const fetchTransactions = async (merchantId) => {
    const url = `${BASE_URL}${merchantId}`;
    try {
        const response = await axios.get(url);
        return response.data.transactions || [];
    } catch (error) {
        console.error(`Error fetching transactions for merchant ${merchantId}:`, error.message);
        return [];
    }
};

const sendCallback = async (merchantTransactionIds, merchantId) => {
    const payload = { transactionIds: merchantTransactionIds };
    try {
        const response = await axios.post(CALLBACK_URL, payload);
        if (response.data.success) {
            console.log(`Callback sent successfully for merchant ${merchantId}:`, merchantTransactionIds);
            return true;
        } else {
            console.log(`Callback failed for merchant ${merchantId}:`, response.data);
            return false;
        }
    } catch (error) {
        console.error(`Error sending callback for merchant ${merchantId}:`, error.message);
        return false;
    }
};

const processMerchantTransactions = async (merchantId) => {
    const transactions = await fetchTransactions(merchantId);
    const merchantTransactionIds = transactions
        .filter(txn => 
            txn.status === "completed" && 
            txn.callback_sent === null && 
            !processedTransactions.has(txn.merchant_transaction_id)
        )
        .map(txn => {
            processedTransactions.add(txn.merchant_transaction_id);
            return txn.merchant_transaction_id;
        });
    
    if (merchantTransactionIds.length > 0) {
        const success = await sendCallback(merchantTransactionIds, merchantId);
        if (success) {
            console.log(`Successfully processed ${merchantTransactionIds.length} transactions for merchant ${merchantId}`);
        }
    } else {
        console.log(`No new completed transactions requiring callback for merchant ${merchantId}`);
    }
};

const sendManualCallback = async (transactionIds, merchantId) => {
    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
        console.log('Please provide valid transaction IDs as an array');
        return false;
    }
    
    if (!MERCHANT_IDS.includes(merchantId)) {
        console.log(`Invalid merchant ID: ${merchantId}. Must be one of: ${MERCHANT_IDS}`);
        return false;
    }

    const newTransactionIds = transactionIds.filter(id => !processedTransactions.has(id));
    
    if (newTransactionIds.length === 0) {
        console.log('All provided transaction IDs have already been processed');
        return false;
    }

    const success = await sendCallback(newTransactionIds, merchantId);
    if (success) {
        newTransactionIds.forEach(id => processedTransactions.add(id));
        console.log(`Successfully sent manual callback for ${newTransactionIds.length} transactions`);
    }
    return success;
};

const processAllMerchants = async () => {
    console.log('Processing started at:', new Date().toISOString());
    for (const merchantId of MERCHANT_IDS) {
        console.log(`Processing merchant ${merchantId}`);
        await processMerchantTransactions(merchantId);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('Processing completed');
};

// Schedule every 5 minutes
schedule.scheduleJob("*/5 * * * *", processAllMerchants);

// Run immediately on start
processAllMerchants();

console.log("Callback API scheduler started...");

