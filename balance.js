const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
let axiosRetry;
try {
  axiosRetry = require('axios-retry').default || require('axios-retry');
} catch (error) {
  console.warn('axios-retry not installed or failed to load. Proceeding without retry logic.');
}

// Configure axios-retry if available
if (axiosRetry) {
  axiosRetry(axios, {
    retries: 3, // Retry up to 3 times
    retryDelay: (retryCount) => retryCount * 1000, // Exponential backoff: 1s, 2s, 3s
    retryCondition: (error) => {
      // Retry on 429 (Too Many Requests) or network errors
      return error.response?.status === 429 || !error.response;
    },
  });
}

require('dotenv').config();

// Function to format numbers with commas and 2 decimal places
function formatNumber(value) {
  if (typeof value === 'undefined' || value === null) return '0.00';
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Simple email validation
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7239638999:AAErnD18JZbw_jnEgf964Mp9y1gz25IkVH0';
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: { interval: 1000 } }); // Increased polling interval

// Store user state to manage the login flow
const userState = {};

// Message queue to handle Telegram rate limits
const messageQueue = [];
async function sendMessageWithQueue(chatId, message, options = {}) {
  messageQueue.push({ chatId, message, options });
  if (messageQueue.length === 1) {
    processQueue();
  }
}
async function processQueue() {
  if (messageQueue.length === 0) return;
  const { chatId, message, options } = messageQueue[0];
  try {
    await bot.sendMessage(chatId, message, options);
  } catch (error) {
    console.error('Failed to send message:', error.message);
  }
  messageQueue.shift();
  setTimeout(processQueue, 1000); // 1s delay to avoid rate limits
}

// API endpoints
const LOGIN_API = 'https://server.sahulatpay.com/auth/login';
const DASHBOARD_API = 'https://server.sahulatpay.com/dashboard/merchant';

// Get state key for user (chatId:userId for groups, chatId for private chats)
function getStateKey(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  return msg.chat.type === 'private' ? `${chatId}` : `${chatId}:${userId}`;
}

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const stateKey = getStateKey(msg);
  console.log(`Received /start from chatId: ${chatId}, stateKey: ${stateKey}`);
  sendMessageWithQueue(chatId, 'Welcome to the SahulatPay Bot! Please provide your email address.', {
    reply_to_message_id: msg.message_id,
  });
  userState[stateKey] = { step: 'awaiting_email', retryCount: 0 };
});

// Handle /check command (e.g., /check bilal@gmail.com)
bot.onText(/\/check (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const stateKey = getStateKey(msg);
  const email = match[1].trim();
  console.log(`Received /check ${email} from chatId: ${chatId}, stateKey: ${stateKey}`);

  if (!isValidEmail(email)) {
    sendMessageWithQueue(chatId, 'Please provide a valid email address (e.g., /check bilal@gmail.com).', {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  sendMessageWithQueue(chatId, `Email received: ${email}. Please provide your password.`, {
    reply_to_message_id: msg.message_id,
  });
  userState[stateKey] = { step: 'awaiting_password', email, retryCount: 0 };
});

// Handle user messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const stateKey = getStateKey(msg);

  console.log(`Received message from chatId: ${chatId}, stateKey: ${stateKey}, text: ${text || 'non-text'}, fullMsg:`, JSON.stringify(msg, null, 2));

  // Ignore non-text messages (e.g., stickers, photos)
  if (!text) {
    sendMessageWithQueue(chatId, 'Please send a text message.', {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  // Ignore commands (handled by bot.onText)
  if (text.startsWith('/')) {
    console.log(`Ignoring command: ${text}`);
    return;
  }

  const state = userState[stateKey];

  if (!state) {
    sendMessageWithQueue(chatId, 'Please use /start or /check <email> to begin.', {
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  if (state.step === 'awaiting_email') {
    if (!isValidEmail(text)) {
      sendMessageWithQueue(chatId, 'Please provide a valid email address.', {
        reply_to_message_id: msg.message_id,
      });
      return;
    }
    userState[stateKey].email = text;
    userState[stateKey].step = 'awaiting_password';
    sendMessageWithQueue(chatId, 'Thank you! Now please provide your password.', {
      reply_to_message_id: msg.message_id,
    });
  } else if (state.step === 'awaiting_password') {
    const password = text;
    userState[stateKey].password = null; // Clear password immediately
    userState[stateKey].step = 'authenticated';

    console.log(`Processing password for stateKey: ${stateKey}, email: ${state.email}`);

    // Send loading message
    sendMessageWithQueue(chatId, 'Logging in and fetching dashboard data, please wait...', {
      reply_to_message_id: msg.message_id,
    });

    // Attempt login with timeout
    try {
      console.log('Attempting login with email:', state.email);
      const loginResponse = await Promise.race([
        axios.post(LOGIN_API, {
          email: state.email,
          password,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Login API timeout')), 10000)), // 10s timeout
      ]);
      console.log('Login Response:', JSON.stringify(loginResponse.data, null, 2));

      if (loginResponse.data.success) {
        const token = loginResponse.data.data.token;
        const username = loginResponse.data.data.username || state.email; // Fallback to email
        console.log('Token received:', token);

        // Fetch dashboard data with timeout
        try {
          console.log('Fetching dashboard data with token:', token);
          const headers = {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0)',
            Cookie: `token=${token}`,
          };
          const dashboardResponse = await Promise.race([
            axios.get(DASHBOARD_API, { headers }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Dashboard API timeout')), 10000)), // 10s timeout
          ]);
          console.log('Dashboard Response:', JSON.stringify(dashboardResponse.data, null, 2));
          console.log('Dashboard Response Headers:', JSON.stringify(dashboardResponse.headers, null, 2));

          if (dashboardResponse.data.success) {
            const data = dashboardResponse.data.data;
            const message = `
*📊 SahulatPay Dashboard* ${username}  
━━━━━━━━━━━━━━━━━━━━━  
*💰 Available Balance*: ${formatNumber(data.availableBalance)}  
*📈 Success Rate*: ${formatNumber(data.transactionSuccessRate)}%  
*💸 Disbursement Amount*: ${formatNumber(data.disbursementAmount)}  
*🏦 Disbursement Balance*: ${formatNumber(data.disbursementBalance)}  
*📥 Total Income*: ${formatNumber(data.totalIncome)}  
*🕒 Today Income*: ${formatNumber(data.todayIncome)}  
━━━━━━━━━━━━━━━━━━━━━  
_Powered by SahulatPay_
            `;
            sendMessageWithQueue(chatId, message, {
              parse_mode: 'Markdown',
              reply_to_message_id: msg.message_id,
            });
          } else {
            console.log('Dashboard API failed with message:', dashboardResponse.data.message);
            sendMessageWithQueue(chatId, `Failed to fetch dashboard data: ${dashboardResponse.data.message || 'Unknown error'}`, {
              reply_to_message_id: msg.message_id,
            });
          }
        } catch (error) {
          console.error('Dashboard API error:', {
            message: error.message,
            response: error.response
              ? {
                  status: error.response.status,
                  data: error.response.data,
                  headers: error.response.headers,
                }
              : null,
            request: error.request ? 'No response received' : null,
          });
          let errorMessage = 'Error fetching dashboard data. ';
          if (error.response) {
            errorMessage += `Status: ${error.response.status}, Message: ${error.response.data.message || 'No details provided'}`;
          } else if (error.request) {
            errorMessage += 'No response from the server. Please check the API endpoint or network.';
          } else {
            errorMessage += `Error: ${error.message}`;
          }
          sendMessageWithQueue(chatId, errorMessage, {
            reply_to_message_id: msg.message_id,
          });
        }
      } else {
        console.log('Login failed with message:', loginResponse.data.message);
        state.retryCount = (state.retryCount || 0) + 1;
        if (state.retryCount < 3) {
          userState[stateKey].step = 'awaiting_password';
          sendMessageWithQueue(chatId, `Login failed: ${loginResponse.data.message || 'Invalid credentials'}. Please provide your password again (${3 - state.retryCount} attempts remaining).`, {
            reply_to_message_id: msg.message_id,
          });
          return; // Exit without resetting state
        } else {
          sendMessageWithQueue(chatId, `Login failed: ${loginResponse.data.message || 'Invalid credentials'}. Maximum retries reached. Please use /start or /check <email> to try again.`, {
            reply_to_message_id: msg.message_id,
          });
        }
      }
    } catch (error) {
      console.error('Login API error:', {
        message: error.message,
        response: error.response
          ? {
              status: error.response.status,
              data: error.response.data,
            }
          : null,
        request: error.request ? 'No response received' : null,
      });
      let errorMessage = 'Error during login. ';
      if (error.response) {
        errorMessage += `Status: ${error.response.status}, Message: ${error.response.data.message || 'No details provided'}`;
      } else if (error.request) {
        errorMessage += 'No response from the server. Please check the API endpoint or network.';
      } else {
        errorMessage += `Error: ${error.message}`;
      }
      state.retryCount = (state.retryCount || 0) + 1;
      if (state.retryCount < 3) {
        userState[stateKey].step = 'awaiting_password';
        sendMessageWithQueue(chatId, `${errorMessage} Please provide your password again (${3 - state.retryCount} attempts remaining).`, {
          reply_to_message_id: msg.message_id,
        });
        return; // Exit without resetting state
      } else {
        sendMessageWithQueue(chatId, `${errorMessage} Maximum retries reached. Please use /start or /check <email> to try again.`, {
          reply_to_message_id: msg.message_id,
        });
      }
    } finally {
      // Reset state only if max retries reached or login succeeded
      if (!userState[stateKey] || userState[stateKey].retryCount >= 3 || userState[stateKey].step !== 'awaiting_password') {
        console.log('Resetting user state for stateKey:', stateKey);
        delete userState[stateKey];
      }
    }
  }
});

// Handle errors
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

console.log('Bot is running...');