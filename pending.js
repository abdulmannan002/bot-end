const axios = require("axios");
const { log } = require("console");

// API URLs for transactions
const CALLBACK_API_URL = "https://server.sahulatpay.com/backoffice/payin-callback";
const SETTLE_API_URL = "https://server.sahulatpay.com/backoffice/settle-transactions/tele";
const FAIL_API_URL = "https://server.sahulatpay.com/backoffice/fail-transactions/tele";
const FETCH_API_URL = "https://api.sahulatpay.com/transactions/tele/last-15-3-mins?status=pending";
const uidMap = {
  // THINK TECH CONSULTANCY
  87: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  88: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  89: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  90: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  91: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  92: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  93: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  94: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  96: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  97: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  98: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  99: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  100: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  101: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  103: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  104: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  105: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  106: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  107: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  108: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  109: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  110: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  111: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  112: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  113: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  114: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  115: "3c0ba58b-5a69-4376-b40d-4d497d561ba2",
  // DEVINERA TECHNOLOGIES
  119: "a0eb8ba1-8962-4766-8acb-945fce7dc0c3",
  // SASTA TECH SOLUTIONS
  126: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  127: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  128: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  129: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  130: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  131: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  132: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  133: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  134: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  135: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  136: "6d612b47-6405-4237-9b0c-7d639eb960ee",
  // NEXTERA SPHERE
  137: "cc961e51-8c0e-44d4-9c25-56e39e992b88",
  138: "cc961e51-8c0e-44d4-9c25-56e39e992b88",
  139: "cc961e51-8c0e-44d4-9c25-56e39e992b88",
  140: "cc961e51-8c0e-44d4-9c25-56e39e992b88",
  // JazzCash Merchant IDs
  7: "6d612b47-6405-4237-9b0c-7d639eb960ee", // SASTA TECH SOLUTIONS
  11: "a0eb8ba1-8962-4766-8acb-945fce7dc0c3", // DEVINERA TECHNOLOGIES
  32: "3c0ba58b-5a69-4376-b40d-4d497d561ba2", // THINK TECH CONSULTANCY
  27: "cc961e51-8c0e-44d4-9c25-56e39e992b88", // NEXTERA SPHERE
  14: "3c0ba58b-5a69-4376-b40d-4d497d561ba2" // THINK TECH CONSULTANCY
};
// List for transactions
let transaction = [];

// Set to track processed orders and prevent duplicates
const processedOrders = new Set();

// Retry function for API calls
const retry = async (fn, retries = 1, delay = 20) => {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === retries - 1) throw lastError;
      console.log(`Retry ${i + 1}/${retries} after error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// Delay function to avoid rate limiting
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to log messages
const logMessage = (message) => {
  console.log(`[LOG]: ${message}`);
};

// Fetch transactions
const fetchTransactions = async () => {
  try {
    const response = await retry(() => axios.get(FETCH_API_URL, { timeout: 10000 }));
    if (!response.data || typeof response.data !== "object") return;

    let transactions = response.data.transactions || response.data;
    if (!Array.isArray(transactions)) return;

    let newTransactions = transactions
      .filter((tx) => !transaction.includes(tx.merchant_transaction_id) && !processedOrders.has(tx.merchant_transaction_id))
      .map((tx) => tx.merchant_transaction_id);

    transaction = [...transaction, ...newTransactions];
    console.log(`Fetched: ${newTransactions.length}, Total in transaction list: ${transaction.length}`);
  } catch (error) {
    console.error("Error fetching transactions:", error.message);
  }
};

// Function to handle the transaction
const handleTransaction = async (order) => {
  try {
    if (processedOrders.has(order)) {
      return;
    }
    processedOrders.add(order);
    setTimeout(() => processedOrders.delete(order), 30000); // Clear after 30s

    const apiUrl = `https://server.sahulatpay.com/transactions/tele?merchantTransactionId=${order}`;
    const response = await retry(() => axios.get(apiUrl));
    //console.log(`[${commandId}] API Response:`, response.data);

    let transaction = response.data.transactions?.[0];
    if (!transaction) {
      logMessage(`Transaction "${order}" not found in back-office.`);
      return;
    }

    //console.log(`[${commandId}] Transaction Details:`, JSON.stringify(transaction, null, 2));
    let providerName = transaction.providerDetails?.name?.toLowerCase();
    let inquiryUrl, inquiryResponse;
    let status = transaction.status.trim().toLowerCase();
    let merchantTransactionId = transaction.merchant_transaction_id || transaction.merchant_custom_order_id;
    let txn_id = transaction.transaction_id;
    //let uid = transaction.merchant?.uid || transaction.merchant?.groups?.[0]?.uid || transaction.merchant?.groups?.[0]?.merchant?.uid;

    if (status === "completed") {
      try {
        await retry(() => axios.post(CALLBACK_API_URL, { transactionIds: [merchantTransactionId] }));
        //console.log(`[${commandId}] Transaction ${merchantTransactionId} marked as completed. TxnID: ${txn_id}`);
        logMessage(`Transaction Status ${merchantTransactionId} : Completed.\n\nTxnID: ${txn_id}`);
      } catch (error) {
        logMessage(`Error updating transaction status for ${merchantTransactionId}.`);
      }
      return;
    }

    // Status inquiry for transactions
   if (providerName === "easypaisa") {
           let easyPaisaMerchantId = transaction.providerDetails?.id;
           logMessage(`Retrieved easyPaisaMerchantId: ${easyPaisaMerchantId}`);
   
           let mappedId = uidMap[easyPaisaMerchantId];
           logMessage(`Mapped ID for easyPaisaMerchantId ${easyPaisaMerchantId}: ${mappedId}`);
   
           if (mappedId) {
             logMessage(`Performing Easypaisa inquiry with UUID: ${mappedId}`);
             inquiryUid = mappedId;
             inquiryUrl = `https://server.sahulatpay.com/payment/inquiry-ep/${mappedId}?orderId=${order}`;
             inquiryResponse = await axios.get(inquiryUrl, { params: { transaction_id: merchantTransactionId } });
           } else {
             let uid = transaction.merchant?.uid || transaction.merchant?.groups?.[0]?.uid || transaction.merchant?.groups?.[0]?.merchant?.uid;
             if (uid) {
               logMessage(`Performing Easypaisa inquiry with fallback UID: ${uid}`);
               inquiryUid = uid;
               inquiryUrl = `https://server.sahulatpay.com/payment/inquiry-ep/${uid}?orderId=${order}`;
               inquiryResponse = await axios.get(inquiryUrl, { params: { transaction_id: merchantTransactionId } });
             } else {
                logMessage(`No UID found for transaction ${merchantTransactionId}`);
              return {
              order,
              status: "error",
              message: `No merchant mapping found for transaction ${merchantTransactionId}.`,
              apiStatus: status,
              inquiryUid: "N/A"
            };
          }
        }
      } else if (providerName === "jazzcash") {
        let jazzCashMerchantId = transaction.providerDetails?.id;
        let mappedId = uidMap[jazzCashMerchantId];

        logMessage(`Retrieved jazzCashMerchantId: ${jazzCashMerchantId}`);
        logMessage(`Mapped ID for jazzCashMerchantId ${jazzCashMerchantId}: ${mappedId}`);

        if (mappedId) {
          logMessage(`Performing JazzCash inquiry with UUID: ${mappedId}`);
          inquiryUid = mappedId;
          inquiryUrl = `https://server.sahulatpay.com/payment/simple-status-inquiry/${mappedId}?transactionId=${order}`;
          inquiryResponse = await axios.get(inquiryUrl, { params: { transaction_id: merchantTransactionId } });
        } else {
          let uid = transaction.merchant?.uid || transaction.merchant?.groups?.[0]?.uid || transaction.merchant?.groups?.[0]?.merchant?.uid;
          if (uid) {
            logMessage(`Performing JazzCash inquiry with fallback UID: ${uid}`);
            inquiryUid = uid;
            inquiryUrl = `https://server.sahulatpay.com/payment/status-inquiry/${uid}`;
            inquiryResponse = await axios.post(inquiryUrl, { transactionId: merchantTransactionId });
          } else {
            logMessager(`No UID found for transaction ${merchantTransactionId}`);
            return {
              order,
              status: "error",
              message: `No merchant mapping found for transaction ${merchantTransactionId}.`,
              apiStatus: status,
              inquiryUid: "N/A"
            };
          }
        }
      }
      if (inquiryResponse) {
        //console.log(`[${commandId}] Inquiry API Response:`, inquiryResponse.data);
        let inquiryStatus = inquiryResponse?.data?.data?.transactionStatus?.toLowerCase();
        let inquiryStatusCode = inquiryResponse?.data?.statusCode;
        let inquiryrrUid = inquiryResponse?.data;
        logMessage(`Inquiry Response for ${merchantTransactionId}: ${JSON.stringify(inquiryrrUid, null, 2)}`);
        logMessage(`Inquiry Status for ${merchantTransactionId}: ${inquiryStatus}(Code: ${inquiryStatusCode})`);
        if (!inquiryStatus || inquiryStatus === "failed" || inquiryStatusCode === 500) {
          await retry(() => axios.post(FAIL_API_URL, { transactionIds: [merchantTransactionId] }));
          //console.log(`[${commandId}] Transaction ${merchantTransactionId} marked as failed.`);
          logMessage(`${merchantTransactionId} Status: Failed.`);
          return;
        } else if (inquiryStatus === "completed") {
          await retry(() => axios.post(SETTLE_API_URL, { transactionId: merchantTransactionId }));
          //console.log(`[${commandId}] Transaction ${merchantTransactionId} marked as completed.`);
          logMessage(`Transaction Status ${merchantTransactionId} : Completed.`);
          return;
        }
        else if (inquiryStatus === "pending") {
         await retry(() => axios.post(FAIL_API_URL, { transactionIds: [merchantTransactionId] }));
          //console.log(`[${commandId}] Transaction ${merchantTransactionId} marked as failed.`);
          logMessage(`${merchantTransactionId} Status: Failed.`);
          return;
        } else {
          logMessage(`Unknown status for transaction ${merchantTransactionId}: ${inquiryStatus}`);
          return;
        }
      }
    } catch (error) {
    console.error(`Error handling transaction ${order}:`, error.message);
    logMessage(`Error handling transaction ${order}: ${error.message}`);
    return {
      order,
      status: "error",
      message: `Error handling transaction ${order}: ${error.message}`,
      apiStatus: "unknown",
      inquiryUid: "N/A"
    };
  }
}; 
// Function to process transaction list
const processTransactionList = async () => {
  console.log("Processing transaction list:", transaction);
  while (transaction.length > 0) {
    const order = transaction[0]; // Peek at the first order
    transaction.shift(); // Remove it immediately to prevent reprocessing
    await handleTransaction(order);
    await delay(10); // Delay between transactions
  }
};

// Main loop to fetch and process every 10 minutes
const main = async () => {
  while (true) {
    console.log("Starting fetch cycle...");
    await fetchTransactions();
    await processTransactionList();
    console.log("Waiting 10 minutes for next fetch...");
    await delay(600000); // Wait 10 minutes (600,000 ms)
  }
};

// Run the script
main().catch((error) => {
  console.error("Error in main loop:", error);
});

// Handle uncaught exceptions and rejections to prevent crashes
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});