import path from "path";
import { bot } from "../index";
import fs from "fs/promises";
import { decrypt } from "node-qpdf2";

export async function downloadFile(
  fileId: string,
  fileName: string
): Promise<string> {
  const fileLink = await bot.getFileLink(fileId);
  const response = await fetch(fileLink);

  if (!response.ok) {
    throw new Error("Failed to download file");
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // temp directory
  const tempDir = path.join(__dirname, "..", "uploads");

  await fs.mkdir(tempDir, { recursive: true });

  const pdfPath = path.join(tempDir, `${fileName}.pdf`);
  await fs.writeFile(pdfPath, buffer);
  return pdfPath;
}

export async function unlockPdf(
  inputPdfPath: string,
  outputPdfPath: string,
  password: string
): Promise<boolean> {
  try {
    console.log(
      `Attempting to decrypt PDF '${inputPdfPath}' with provided password...`
    );
    const options = {
      input: inputPdfPath,
      output: outputPdfPath,
      password,
    };
    await decrypt(options);
    console.log(
      `PDF '${inputPdfPath}' successfully decrypted with password to '${outputPdfPath}'.`
    );
    return true;
  } catch (error: any) {
    console.error(`Error processing PDF '${inputPdfPath}' with qpdf:`, error);
    if (
      error.message.includes("Password required") ||
      error.message.includes("password supplied is incorrect")
    ) {
      console.warn(
        "The PDF is likely encrypted with a user password, and either no password was supplied or the supplied password was incorrect."
      );
    } else if (error.message.includes("Unable to open")) {
      console.warn(
        "qpdf could not open the input PDF file. It might be corrupted or not a valid PDF."
      );
    }
    return false; // Indicate failure
  }
}

export async function processAndSendPdf(
  chatId: number,
  userId: number,
  inputPath: string,
  originalFileName: string,
  password: string
): Promise<boolean> {
  // Create a unique output file path
  const outputFileName = `unlocked_${originalFileName}`;
  const outputPath = path.join(__dirname, "..", "temp", outputFileName);

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true }); // Ensure temp directory exists

    const unlockedSuccessfully = await unlockPdf(
      inputPath,
      outputPath,
      password
    );

    if (unlockedSuccessfully) {
      await bot.sendMessage(
        chatId,
        "PDF unlocked successfully! Sending the unlocked file..."
      );
      await bot.sendDocument(
        chatId,
        outputPath,
        {},
        { filename: outputFileName }
      );
      await bot.sendMessage(chatId, "Unlocked PDF sent!");
    } else {
      await bot.sendMessage(
        chatId,
        "Failed to unlock PDF. The password might be incorrect, or the PDF file is corrupted/unsupported."
      );
    }
    return unlockedSuccessfully;
  } catch (error) {
    console.error("Error during PDF processing or sending:", error);
    await bot.sendMessage(
      chatId,
      "An unexpected error occurred during PDF processing."
    );
    return false;
  } finally {
    // Clean up temporary files regardless of success or failure
    try {
      await fs.unlink(inputPath);
      await fs.unlink(outputPath).catch(() => {}); // Catch error if output file wasn't created
      console.log("Cleaned up temporary files.");
    } catch (cleanupError) {
      console.error("Error cleaning up temporary files:", cleanupError);
    }
  }
}
