import express from "express";
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs/promises";
import multer from "multer";
import { downloadFile, processAndSendPdf, unlockPdf } from "./Helper/Help";
import { UserState } from "./types/types";

// Import server to start the application

dotenv.config();

const TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT;

if (!TOKEN || !PORT) {
  throw new Error("BOT_TOKEN and PORT are required");
}

export const bot = new TelegramBot(TOKEN, { polling: false });

const app = express();
app.use(express.json());

const userStates = new Map<number, UserState>();

if (WEBHOOK_URL) {
  const fullWebhookPath = `/bot${TOKEN}`;
  bot.setWebHook(`${WEBHOOK_URL}${fullWebhookPath}`);
  app.post(fullWebhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
  console.log(
    `🚀 Bot running via webhook. Listening for updates at ${WEBHOOK_URL}${fullWebhookPath}`
  );
} else {
  console.log("⚠️  WEBHOOK_URL not provided. Bot running in polling mode.");
}

// Enhanced welcome message with inline keyboard
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;

  if (fromId) {
    userStates.set(fromId, {
      lastPdfFilePath: null,
      lastPdfFileName: null,
      step: "waiting_pdf",
      attempts: 0,
      startTime: Date.now(),
    });
  }

  const welcomeMessage = `🎉 Welcome ${msg.from?.first_name || "there"}!

I'm your PDF Unlock Assistant. I can help you unlock password-protected PDF files quickly and securely.

📋 **How it works:**
1️⃣ Send me your PDF file
2️⃣ Provide the password when prompted
3️⃣ Get your unlocked PDF back!

🔐 **Security:** Your files are processed locally and deleted after processing.

Ready to get started? Just send me a PDF file! 📄`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "📖 Help", callback_data: "help" },
        { text: "ℹ️ About", callback_data: "about" },
      ],
    ],
  };

  bot.sendMessage(chatId, welcomeMessage, {
    reply_markup: keyboard,
    parse_mode: "Markdown" as const,
  });
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `🆘 **Help & Instructions**

**Commands:**
• /start - Start the bot
• /help - Show this help message
• /status - Check your current session
• /cancel - Cancel current operation

**How to unlock PDFs:**

**Method 1: Send PDF first**
1. Send your PDF file
2. Wait for confirmation
3. Send password in format: \`password: your_password\`

**Method 2: Include password in caption**
1. Send PDF with caption: \`password: your_password\`
2. File will be processed automatically

**Tips:**
✅ Make sure your PDF is password-protected
✅ Use the exact format for passwords
✅ Files are automatically deleted after processing
✅ Maximum file size: 20MB

Need more help? Just ask! 😊`;

  bot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" as const });
});

// Status command
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;

  if (!fromId) return;

  const state = userStates.get(fromId);

  if (!state) {
    bot.sendMessage(
      chatId,
      "📊 **Status:** No active session\n\nSend /start to begin!",
      { parse_mode: "Markdown" as const }
    );
    return;
  }

  const timeElapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const statusEmoji = {
    waiting_pdf: "⏳",
    waiting_password: "🔐",
    processing: "⚙️",
  };

  const statusText = {
    waiting_pdf: "Waiting for PDF file",
    waiting_password: "Waiting for password",
    processing: "Processing your file",
  };

  const statusMessage = `📊 **Current Status**

${statusEmoji[state.step]} **Step:** ${statusText[state.step]}
📄 **File:** ${state.lastPdfFileName || "None"}
⏱️ **Time:** ${timeElapsed}s ago
🔄 **Attempts:** ${state.attempts}

${
  state.step === "waiting_password"
    ? "💡 Send your password in format: `password: your_password`"
    : ""
}`;

  bot.sendMessage(chatId, statusMessage, { parse_mode: "Markdown" as const });
});

// Cancel command
bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;

  if (!fromId) return;

  const state = userStates.get(fromId);

  if (state?.lastPdfFilePath) {
    try {
      await fs.unlink(state.lastPdfFilePath);
    } catch (e) {
      console.error("Error cleaning up file:", e);
    }
  }

  userStates.delete(fromId);
  bot.sendMessage(
    chatId,
    "❌ **Operation cancelled**\n\nYour session has been reset. Send /start to begin again!",
    { parse_mode: "Markdown" as const }
  );
});

// Enhanced callback query handler
bot.on("callback_query", (query) => {
  const chatId = query.message?.chat.id;
  const data = query.data;

  if (!chatId || !data) return;

  bot.answerCallbackQuery(query.id);

  switch (data) {
    case "help":
      bot.sendMessage(
        chatId,
        `🆘 **Quick Help**

**Steps to unlock PDF:**
1. Send your PDF file 📄
2. Send password: \`password: your_password\` 🔐
3. Get unlocked file! ✅

**Alternative:** Include password in PDF caption when sending.

Type /help for detailed instructions.`,
        { parse_mode: "Markdown" as const }
      );
      break;

    case "about":
      bot.sendMessage(
        chatId,
        `ℹ️ **About PDF Unlock Bot**

🔐 **Purpose:** Unlock password-protected PDF files
🛡️ **Security:** Files processed locally & deleted after use
⚡ **Speed:** Fast processing with real-time feedback
🎯 **Accuracy:** Detailed error messages & status updates

Made with ❤️ for secure PDF processing.`,
        { parse_mode: "Markdown" as const }
      );
      break;

    case "cancel":
      // Handle cancel from inline keyboard
      const fromId = query.from?.id;
      if (fromId) {
        const state = userStates.get(fromId);
        if (state?.lastPdfFilePath) {
          fs.unlink(state.lastPdfFilePath).catch((e) =>
            console.error("Error cleaning up file:", e)
          );
        }
        userStates.delete(fromId);
        bot.sendMessage(
          chatId,
          "❌ **Operation cancelled**\n\nYour session has been reset. Send /start to begin again!",
          { parse_mode: "Markdown" as const }
        );
      }
      break;

    case "start":
      // Handle start from inline keyboard
      bot.sendMessage(
        chatId,
        "🚀 **Starting new session...**\n\nPlease send me a PDF file to unlock!",
        { parse_mode: "Markdown" as const }
      );
      break;
  }
});

// Enhanced document handler
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  const document = msg.document;
  const fromId = msg.from?.id;

  if (!fromId) {
    console.warn(`Received message without 'from' user ID in chat ${chatId}.`);
    bot.sendMessage(
      chatId,
      "❌ Could not identify your user ID. Please restart the bot with /start"
    );
    return;
  }

  // Validate PDF file
  if (
    !document?.file_id ||
    !document?.file_name ||
    !document?.mime_type?.startsWith("application/pdf")
  ) {
    bot.sendMessage(
      chatId,
      "❌ **Invalid file type**\n\n📄 Please send a valid PDF file only.\n\n💡 **Tip:** Make sure your file has a .pdf extension!",
      { parse_mode: "Markdown" as const }
    );
    return;
  }

  // Check file size (Telegram limit is 20MB for bots)
  if (document.file_size && document.file_size > 20 * 1024 * 1024) {
    bot.sendMessage(
      chatId,
      "❌ **File too large**\n\n📏 Maximum file size: 20MB\n📄 Your file: " +
        (document.file_size / (1024 * 1024)).toFixed(1) +
        "MB\n\n💡 **Tip:** Try compressing your PDF first!",
      { parse_mode: "Markdown" as const }
    );
    return;
  }

  const fileId = document.file_id;
  const fileName = document.file_name;
  const fileSize = document.file_size
    ? `(${(document.file_size / 1024).toFixed(1)}KB)`
    : "";

  try {
    // Send processing message with loading animation
    const loadingMsg = await bot.sendMessage(
      chatId,
      `📥 **Downloading PDF**\n\n📄 **File:** ${fileName} ${fileSize}\n⏳ **Status:** Downloading...`,
      { parse_mode: "Markdown" as const }
    );

    const downloadFilePath = await downloadFile(fileId, fileName);

    // Update user state
    userStates.set(fromId, {
      lastPdfFileId: fileId,
      lastPdfFilePath: downloadFilePath,
      lastPdfFileName: fileName,
      step: "waiting_password",
      attempts: 0,
      startTime: Date.now(),
    });

    // Update loading message
    await bot.editMessageText(
      `✅ **Download Complete**\n\n📄 **File:** ${fileName} ${fileSize}\n✅ **Status:** Ready for password`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "Markdown" as const,
      }
    );

    // Check if password is in caption
    if (msg.caption) {
      const passwordMatch = msg.caption.match(/password:\s*(.+)/i);
      if (passwordMatch?.[1]) {
        const password = passwordMatch[1].trim();
        await bot.sendMessage(
          chatId,
          "🔐 **Password found in caption**\n\n⚙️ Processing your PDF...",
          { parse_mode: "Markdown" as const }
        );

        userStates.set(fromId, {
          ...userStates.get(fromId)!,
          step: "processing",
        });

        const processed = await processAndSendPdf(
          chatId,
          fromId,
          downloadFilePath,
          fileName,
          password
        );

        if (processed) {
          userStates.delete(fromId);
          await bot.sendMessage(
            chatId,
            "🎉 **Success!** Your PDF has been unlocked and sent above.",
            { parse_mode: "Markdown" as const }
          );
        }
        return;
      }
    }

    // Send password request with inline keyboard
    const keyboard = {
      inline_keyboard: [
        [
          { text: "❓ Help with Password", callback_data: "help" },
          { text: "❌ Cancel", callback_data: "cancel" },
        ],
      ],
    };

    await bot.sendMessage(
      chatId,
      `🔐 **Password Required**\n\n📄 **File:** ${fileName}\n💡 **Next Step:** Send the password in this format:\n\n\`password: your_secret_password\`\n\n🔒 **Example:** \`password: mypassword123\``,
      {
        parse_mode: "Markdown" as const,
        reply_markup: keyboard,
      }
    );
  } catch (error) {
    console.error("Error downloading file:", error);

    await bot.sendMessage(
      chatId,
      "❌ **Download Failed**\n\n🔧 An error occurred while downloading your file.\n\n💡 **Try:**\n• Check your internet connection\n• Resend the file\n• Contact support if issue persists",
      { parse_mode: "Markdown" as const }
    );

    // Clean up on error
    const state = userStates.get(fromId);
    if (state?.lastPdfFilePath) {
      try {
        await fs.unlink(state.lastPdfFilePath);
      } catch (e) {
        console.error("Error cleaning up partial download:", e);
      }
    }
    userStates.delete(fromId);
  }
});

// Enhanced text handler for passwords
bot.on("text", async (msg) => {
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  const text = msg.text;

  if (!fromId || !text || text.startsWith("/")) {
    return; // Ignore commands and empty texts
  }

  const state = userStates.get(fromId);

  if (!state?.lastPdfFilePath) {
    const keyboard = {
      inline_keyboard: [
        [{ text: "🚀 Start New Session", callback_data: "start" }],
      ],
    };

    await bot.sendMessage(
      chatId,
      "📄 **No PDF file found**\n\n💡 Please send me a PDF file first, then provide the password.\n\nUse /start to begin!",
      {
        parse_mode: "Markdown" as const,
        reply_markup: keyboard,
      }
    );
    return;
  }

  // Check if the message is a password
  const passwordMatch = text.match(/password:\s*(.+)/i);
  if (passwordMatch?.[1]) {
    const password = passwordMatch[1].trim();

    if (password.length === 0) {
      await bot.sendMessage(
        chatId,
        "❌ **Empty Password**\n\n🔐 Please provide a valid password:\n\n`password: your_actual_password`",
        { parse_mode: "Markdown" as const }
      );
      return;
    }

    // Update state and send processing message
    userStates.set(fromId, {
      ...state,
      step: "processing",
      attempts: state.attempts + 1,
    });

    const processingMsg = await bot.sendMessage(
      chatId,
      `🔐 **Processing PDF**\n\n📄 **File:** ${
        state.lastPdfFileName
      }\n🔑 **Password:** ${"*".repeat(
        password.length
      )}\n⚙️ **Status:** Unlocking...`,
      { parse_mode: "Markdown" as const }
    );

    try {
      const processed = await processAndSendPdf(
        chatId,
        fromId,
        state.lastPdfFilePath,
        state.lastPdfFileName || "",
        password
      );

      if (processed) {
        userStates.delete(fromId);
        await bot.editMessageText(
          `✅ **Success!**\n\n📄 **File:** ${state.lastPdfFileName}\n✅ **Status:** Unlocked and sent!\n\n🎉 Your PDF is ready above!`,
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown" as const,
          }
        );
      } else {
        // Reset to waiting for password
        userStates.set(fromId, { ...state, step: "waiting_password" });

        const keyboard = {
          inline_keyboard: [
            [
              { text: "🔄 Try Again", callback_data: "help" },
              { text: "❌ Cancel", callback_data: "cancel" },
            ],
          ],
        };

        await bot.editMessageText(
          `❌ **Unlock Failed**\n\n📄 **File:** ${state.lastPdfFileName}\n🔐 **Attempt:** ${state.attempts}\n\n💡 **Possible issues:**\n• Incorrect password\n• File is corrupted\n• Unsupported encryption\n\n🔄 **Try again with correct password:**\n\`password: your_password\``,
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "Markdown" as const,
            reply_markup: keyboard,
          }
        );
      }
    } catch (error) {
      console.error("Error processing PDF:", error);

      await bot.editMessageText(
        `❌ **Processing Error**\n\n📄 **File:** ${state.lastPdfFileName}\n🔧 **Error:** Technical issue occurred\n\n💡 **Try:**\n• Send the file again\n• Check if file is corrupted\n• Contact support if issue persists`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
          parse_mode: "Markdown" as const,
        }
      );

      userStates.delete(fromId);
    }
  } else {
    // Invalid password format
    await bot.sendMessage(
      chatId,
      `❌ **Invalid Password Format**\n\n🔐 **Correct format:**\n\`password: your_password\`\n\n📝 **Examples:**\n\`password: abc123\`\n\`password: my secret password\`\n\n💡 **Your message:** "${text}"`,
      { parse_mode: "Markdown" as const }
    );
  }
});

// Enhanced error handling with proper typing
bot.on("polling_error", (error: Error & { code?: string }) => {
  console.error(
    `🔴 Polling error: ${error.code || "UNKNOWN"} - ${error.message}`
  );
});

bot.on("webhook_error", (error: Error & { code?: string }) => {
  console.error(
    `🔴 Webhook error: ${error.code || "UNKNOWN"} - ${error.message}`
  );
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("🛑 Shutting down gracefully...");

  // Clean up any remaining files
  for (const [userId, state] of userStates.entries()) {
    if (state.lastPdfFilePath) {
      try {
        await fs.unlink(state.lastPdfFilePath);
        console.log(`🧹 Cleaned up file for user ${userId}`);
      } catch (e) {
        console.error(`❌ Error cleaning up file for user ${userId}:`, e);
      }
    }
  }

  process.exit(0);
});

// Enhanced startup logging
app.listen(PORT, () => {
  console.log(`🚀 Express server listening on port ${PORT}`);
  console.log(`🤖 Bot Token: ${TOKEN ? "✅ Loaded" : "❌ Not Loaded"}`);
  console.log(`🌐 Webhook URL: ${WEBHOOK_URL ? "✅ Loaded" : "❌ Not Loaded"}`);
  console.log(
    `🕐 Local time: ${new Date().toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
    })} (Sydney, AEST)`
  );
  console.log(`📋 Bot ready to process PDF files!`);
});
