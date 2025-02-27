const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

// Replace with your bot token
const BOT_TOKEN = "8066612704:AAF89QTs_HLaMLRC9DfBHNcLVKqLl7jnAmc";

// Create a bot instance
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// API URLs
const CALLBACK_API_URL = "https://api.sahulatpay.com/backoffice/payin-callback";
const SETTLE_API_URL = "https://api.sahulatpay.com/backoffice/settle-transactions/tele";

// Function to handle the transaction
const handleTransaction = async (chatId, order) => {
  try {
    const API_URL_PAYIN = `https://api.sahulatpay.com/transactions?merchantTransactionId=${order}`;
    bot.sendMessage(chatId, `Checking transaction details for order: ${order}...`);

    const response = await axios.get(API_URL_PAYIN);
    const transaction = response.data.transactions[0];

    if (!transaction) {
      bot.sendMessage(chatId, "This transaction is not in our back office.");
      return;
    }

    const {
      status,
      providerDetails,
      settled_amount,
      merchant,
      merchant_transaction_id,
    } = transaction;

    if (!merchant) {
      bot.sendMessage(chatId, "Merchant information not found in the transaction data.");
      return;
    }

    // Extract UID
    let uid = merchant.uid;
    if (!uid && merchant.groups && merchant.groups.length > 0) {
      uid = merchant.groups[0]?.uid || merchant.groups[0]?.merchant?.uid;
    }

    if (!uid) {
      bot.sendMessage(chatId, "Merchant UID not found in the transaction data.");
      return;
    }

    // Construct dynamic URLs
    const JAZZCASH_STATUS_INQUIRY_URL = `https://api.sahulatpay.com/payment/status-inquiry/${uid}`;
    const EASYPAY_STATUS_INQUIRY_URL = `https://api.sahulatpay.com/payment/inquiry-ep/${uid}?orderId=${order}`;

    // Handle transaction status
    if (status === "completed") {
      bot.sendMessage(chatId, `Transaction completed. Initiating callback for ${merchant_transaction_id}...`);
      await axios.post(CALLBACK_API_URL, { transactionIds: [merchant_transaction_id] });
      bot.sendMessage(chatId, "Callback initiated successfully!");
    } else {
      if (!providerDetails || !providerDetails.name) {
        bot.sendMessage(chatId, "Provider name is not available in provider details.");
        return;
      }

      const providerName = providerDetails.name.toLowerCase();
      let inquiryResponse;

      if (providerName === "easypaisa") {
        bot.sendMessage(chatId, `Performing status inquiry with EasyPaisa at ${EASYPAY_STATUS_INQUIRY_URL}...`);
        inquiryResponse = await axios.get(EASYPAY_STATUS_INQUIRY_URL, {
          params: { transaction_id: merchant_transaction_id },
        });
      } else if (providerName === "jazzcash") {
        bot.sendMessage(chatId, `Performing status inquiry with JazzCash at ${JAZZCASH_STATUS_INQUIRY_URL}...`);
        inquiryResponse = await axios.post(JAZZCASH_STATUS_INQUIRY_URL, {
          transactionId: merchant_transaction_id,
        });
      } else {
        bot.sendMessage(chatId, `Unknown provider: ${providerName}`);
        return;
      }

      if (inquiryResponse.data.data.transactionStatus === "completed") {
        bot.sendMessage(chatId, "Status inquiry completed. Initiating settlement...");
        await axios.post(SETTLE_API_URL, { transactionId: merchant_transaction_id });
        bot.sendMessage(chatId, "Settlement completed successfully!");
      } else {
        bot.sendMessage(chatId, `Transaction still pending or failed. Full response:\n${JSON.stringify(inquiryResponse.data, null, 2)}`);
      }
    }
  } catch (error) {
    bot.sendMessage(chatId, `Error occurred: ${error.message}`);
    if (error.response) {
      bot.sendMessage(chatId, `API Response Error:\n${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
};

// Start the bot
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === "/start") {
    bot.sendMessage(
      chatId,
      "Welcome! Send an order ID directly to check the transaction status."
    );
  } else if (/^\d+[a-zA-Z0-9]+$/.test(text)) {
    // Regex pattern to check the format of the order ID
    bot.sendMessage(chatId, `Received order ID: ${text}`);
    handleTransaction(chatId, text);
  } else {
    bot.sendMessage(chatId, "Invalid input. Please provide a valid order ID.");
  }
});
