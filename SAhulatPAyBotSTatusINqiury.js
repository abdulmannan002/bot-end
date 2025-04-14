const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// Replace with your bot token
const BOT_TOKEN = "8066612704:AAF89QTs_HLaMLRC9DfBHNcLVKqLl7jnAmc";

// Create a bot instance
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// API URLs
const CALLBACK_API_URL = "https://server.sahulatpay.com/backoffice/payin-callback";
const SETTLE_API_URL = "https://server.sahulatpay.com/backoffice/settle-transactions/tele";
const PAYOUT_API_URL = "https://server.sahulatpay.com/disbursement/tele";
const PAYOUT_CALLBACK_API_URL = "https://server.sahulatpay.com/backoffice/payout-callback";
const FAIL_API_URL = "https://server.sahulatpay.com/backoffice/fail-transactions/tele";

// Set to track processed commands and prevent duplicates
const processedCommands = new Set();

// Retry function for API calls
const retry = async (fn, retries = 1, delay = 2000) => {
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

// Function to handle the transaction
const handleTransactionAndPayout = async (chatId, order, type = "transaction") => {
  const commandId = `${chatId}-${Date.now()}`; // Unique ID for logging
  console.log(`[${commandId}] Starting ${type} handling for order: ${order}`);

  try {
    let apiUrl = type === "transaction"
      ? `https://server.sahulatpay.com/transactions/tele?merchantTransactionId=${order}`
      : `${PAYOUT_API_URL}?merchantTransactionId=${order}`;

    const response = await retry(() => axios.get(apiUrl));
    console.log(`[${commandId}] API Response:`, response.data);

    let transaction = type === "transaction"
      ? response.data.transactions?.[0]
      : response.data?.data?.transactions?.[0];

    if (!transaction) {
      console.log(`[${commandId}] No transactions found for order: ${order}`);
      await retry(() => bot.sendMessage(chatId, `Transaction "${order}" not found in back-office.`));
      return;
    }

    console.log(`[${commandId}] Transaction Details:`, JSON.stringify(transaction, null, 2));

    let status = transaction.status.trim().toLowerCase();
    let merchantTransactionId = transaction.merchant_transaction_id || transaction.merchant_custom_order_id;
    let txn_id = transaction.transaction_id;
    let uid = transaction.merchant?.uid || transaction.merchant?.groups?.[0]?.uid || transaction.merchant?.groups?.[0]?.merchant?.uid;

    if (status === "completed") {
      const callbackUrl = type === "payout" ? PAYOUT_CALLBACK_API_URL : CALLBACK_API_URL;
      try {
        await retry(() => axios.post(callbackUrl, { transactionIds: [merchantTransactionId] }));
        console.log(`[${commandId}] Transaction ${merchantTransactionId} marked as completed. TxnID: ${txn_id}`);
        await retry(() => bot.sendMessage(chatId, `Transaction Status ${merchantTransactionId} : Completed.\n\nTxnID: ${txn_id}`));
      } catch (error) {
        console.error(`[${commandId}] Error calling callback API:`, error.response?.data || error.message);
        await retry(() => bot.sendMessage(chatId, `Error updating transaction status for ${merchantTransactionId}.`));
      }
      return;
    }

    // Status inquiry for transactions only (not payouts)
    if (type === "transaction" && uid) {
      let providerName = transaction.providerDetails?.name?.toLowerCase();
      let inquiryUrl, inquiryResponse;

      if (providerName === "easypaisa") {
        inquiryUrl = `https://server.sahulatpay.com/payment/inquiry-ep/${uid}?orderId=${order}`;
        inquiryResponse = await retry(() => axios.get(inquiryUrl, { params: { transaction_id: merchantTransactionId } }));
      } else if (providerName === "jazzcash") {
        inquiryUrl = `https://server.sahulatpay.com/payment/status-inquiry/${uid}`;
        inquiryResponse = await retry(() => axios.post(inquiryUrl, { transactionId: merchantTransactionId }));
      }

      if (inquiryResponse) {
        console.log(`[${commandId}] Inquiry API Response:`, inquiryResponse.data);
        let inquiryStatus = inquiryResponse?.data?.data?.transactionStatus?.toLowerCase();
        let inquiryStatusCode = inquiryResponse?.data?.data?.statusCode;

        if (!inquiryStatus || inquiryStatus === "failed" || inquiryStatusCode === 500) {
          await retry(() => axios.post(FAIL_API_URL, { transactionIds: [merchantTransactionId] }));
          console.log(`[${commandId}] Transaction ${merchantTransactionId} marked as failed.`);
          await retry(() => bot.sendMessage(chatId, `${merchantTransactionId} Status: Failed.`));
          return;
        } else if (inquiryStatus === "completed") {
          await retry(() => axios.post(SETTLE_API_URL, { transactionId: merchantTransactionId }));
          console.log(`[${commandId}] Transaction ${merchantTransactionId} marked as completed.`);
          await retry(() => bot.sendMessage(chatId, `Transaction Status ${merchantTransactionId} : Completed.`));
          return;
        }
      }
    }

    // Default case: transaction failed
    console.log(`[${commandId}] Final Status for transaction ${merchantTransactionId}: Failed.`);
    await retry(() => bot.sendMessage(chatId, `${merchantTransactionId} Status: Failed.`));
  } catch (error) {
    console.error(`[${commandId}] Error handling transaction:`, error.message);
    await retry(() => bot.sendMessage(chatId, `Error: ${error.message}`));
  }
};

// Handle /in command for transactions
bot.onText(/\/in (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const orders = match[1].trim().split(/\s+/);
  const commandKey = `${chatId}-${msg.message_id}`;

  if (processedCommands.has(commandKey)) {
    console.log(`Duplicate /in command skipped: ${commandKey}`);
    return;
  }
  processedCommands.add(commandKey);
  setTimeout(() => processedCommands.delete(commandKey), 10000); // Clear after 10s

  for (const order of orders) {
    await handleTransactionAndPayout(chatId, order, "transaction");
    await delay(1000);
  }
});

// Handle /out command for payouts
bot.onText(/\/out (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const orders = match[1].trim().split(/\s+/);
  const commandKey = `${chatId}-${msg.message_id}`;

  if (processedCommands.has(commandKey)) {
    console.log(`Duplicate /out command skipped: ${commandKey}`);
    return;
  }
  processedCommands.add(commandKey);
  setTimeout(() => processedCommands.delete(commandKey), 10000);

  for (const order of orders) {
    await handleTransactionAndPayout(chatId, order, "payout");
    await delay(1000);
  }
});

// Handle image messages with caption
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  if (!msg.caption) return;

  const parts = msg.caption.split(/\s+/);
  const command = parts[0];
  const orders = parts.slice(1);
  const commandKey = `${chatId}-${msg.message_id}`;

  if (processedCommands.has(commandKey)) {
    console.log(`Duplicate photo command skipped: ${commandKey}`);
    return;
  }
  processedCommands.add(commandKey);
  setTimeout(() => processedCommands.delete(commandKey), 10000);

  if (orders.length === 0) {
    await retry(() => bot.sendMessage(chatId, "Please provide at least one order ID after the command."));
    return;
  }

  const type = command === "/out" ? "payout" : command === "/in" ? "transaction" : null;
  if (!type) return;

  for (const order of orders) {
    await handleTransactionAndPayout(chatId, order.trim(), type);
    await delay(1000);
  }
});

// Handle file (document) messages with caption
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  if (!msg.caption) return;

  const parts = msg.caption.split(/\s+/);
  const command = parts[0];
  const orders = parts.slice(1);
  const commandKey = `${chatId}-${msg.message_id}`;

  if (processedCommands.has(commandKey)) {
    console.log(`Duplicate document command skipped: ${commandKey}`);
    return;
  }
  processedCommands.add(commandKey);
  setTimeout(() => processedCommands.delete(commandKey), 10000);

  if (orders.length === 0) {
    await retry();
    return;
  }

  const type = command === "/out" ? "payout" : command === "/in" ? "transaction" : null;
  if (!type) return;

  for (const order of orders) {
    await handleTransactionAndPayout(chatId, order.trim(), type);
    await delay(1000);
  }
});

// Handle uncaught exceptions and rejections to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});