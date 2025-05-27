// background.js

// Updated folder structure and naming conventions - This will be used by local mapping logic
const FOLDER_STRUCTURE = {
  "Professional Sphere": {
    "Data & Analytics Tools": {},
    "Productivity Tools": {},
    "Technical Learning & Reference": {},
    "Work Communication & Resources": {}
  },
  "Technology & Digital Ecosystem": {
    "Hardware & Peripherals": {},
    "Software & Drivers": {},
    "Tech News & Communities": {},
    "Online Utilities & Services": {},
    "3D Printing & Design": {}
  },
  "Entertainment & Hobbies": {
    "Gaming Hub": {},
    "Game Services & Cheats": {},
    "Media & Streaming": {},
    "Creative & Making": {},
    "Adult Content": {}
  },
  "Personal Life & Ventures": {
    "Shopping - General & Tech": {},
    "Shopping - Fashion & Replicas": {},
    "Travel & Experiences": {},
    "Home, Health & Finance": {},
    "Social & Communications (Personal)": {}
  }
};

const DEFAULT_FOLDER_PATH = "Professional Sphere/Productivity Tools"; // Updated default path
// const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// --- Cached Configuration ---
let cachedApiKey = null;
let cachedSelectedModel = null;
let cachedNuxCompleted = null;
let cachedAvailableModels = null; // Cache for available models

async function initializeAndCacheConfig() {
  const result = await new Promise((resolve) => {
    chrome.storage.sync.get(['geminiApiKey', 'selectedGeminiModel', 'nuxCompleted'], (data) => {
      resolve(data);
    });
  });
  cachedApiKey = result.geminiApiKey || null;
  cachedSelectedModel = result.selectedGeminiModel || null;
  cachedNuxCompleted = result.nuxCompleted || false;
  console.log("[BACKGROUND initializeAndCacheConfig] Values read from sync storage:", 
    { apiKey: result.geminiApiKey, model: result.selectedGeminiModel, nuxCompleted: result.nuxCompleted }
  );
  // Also load cached models from local storage on startup
  const localData = await new Promise(resolve => chrome.storage.local.get(['availableGeminiModels'], resolve));
  cachedAvailableModels = localData.availableGeminiModels || null;
  console.log("[BACKGROUND] Initial configuration cached:", { cachedApiKeyIsSet: !!cachedApiKey, cachedSelectedModel, cachedNuxCompleted, cachedModelsCount: cachedAvailableModels?.length });
}

// Call initialization when the service worker starts
initializeAndCacheConfig();

// Listen for changes in storage to keep the cache updated
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    let configChanged = false;
    if (changes.geminiApiKey) {
      cachedApiKey = changes.geminiApiKey.newValue || null;
      configChanged = true;
      console.log("[BACKGROUND] Cached API key updated.");
    }
    if (changes.selectedGeminiModel) {
      cachedSelectedModel = changes.selectedGeminiModel.newValue || null;
      configChanged = true;
      console.log("[BACKGROUND] Cached selected model updated.");
    }
    if (changes.nuxCompleted) {
      cachedNuxCompleted = changes.nuxCompleted.newValue || false;
      configChanged = true;
      console.log("[BACKGROUND] Cached NUX completed status updated.");
    }
    if (configChanged) {
        console.log("[BACKGROUND] Updated cached config:", { cachedApiKeyIsSet: !!cachedApiKey, cachedSelectedModel, cachedNuxCompleted });
    }
  }
});

// --- Helper Functions (some modified, some new) ---

async function getApiKey() { // This function is still used by getGeminiSuggestions directly
  // Return the cached API key immediately if available
  return cachedApiKey;
}

async function getSelectedModel() { // This function is still used by getGeminiSuggestions directly
  // Return the cached selected model immediately if available
  return cachedSelectedModel;
}

async function getOrCreateFolder(path, apiKeyForLogging) {
  const pathSegments = path.split('/').filter(segment => segment.trim() !== '');

  if (pathSegments.length === 0) {
    console.error("[BACKGROUND getOrCreateFolder] Path is empty after splitting and filtering. Original path was:", path);
    // Callers (popup.js, onCreated listener) should handle null return with their own fallbacks.
    return null; 
  }

  let currentParentId = '1'; // Start with "Bookmarks Bar" (ID '1') as the effective parent for the first segment.

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i];
    // For each segment, search within the currentParentId context.
    // For the first segment, currentParentId is '1' (Bookmarks Bar).
    // For subsequent segments, currentParentId is the ID of the previously found/created folder.
    const children = await chrome.bookmarks.getChildren(currentParentId);
    let foundFolder = children.find(bookmark => 
        !bookmark.url &&
        bookmark.title && 
        bookmark.title.toLowerCase() === segment.toLowerCase()
    );

    if (foundFolder) {
      currentParentId = foundFolder.id; // This becomes the parent for the next segment if one exists
    } else {
      try {
        const newFolder = await chrome.bookmarks.create({
          parentId: currentParentId, // Create under Bookmarks Bar (for L1) or under the previous segment's folder (for L2/L3)
          title: toTitleCase(segment)
        });
        currentParentId = newFolder.id; // This new folder is now the parent for the next segment
        console.log(`[BACKGROUND] Created folder: "${segment}" (ID: ${currentParentId}) under parent ID ${newFolder.parentId}`);
      } catch (e) {
        console.error(`[BACKGROUND] Error creating folder "${segment}" under parentId "${currentParentId}":`, e);
        // If folder creation fails, stop processing this path and return null.
        // The caller should handle this (e.g., by moving to a default fallback folder).
        return null; 
      }
    }
  }
  return currentParentId; // Return the ID of the final folder in the path
}

function toTitleCase(str) {
  if (!str) return "";
  return str.replace(/\w\S*/g, (txt) => {
    if (txt.toLowerCase() === 'and') return 'and';
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

// --- Gemini API Interaction ---
async function getGeminiSuggestions(title, url, apiKey, pageContent = '') { // Added pageContent parameter
  console.log("[BACKGROUND] Attempting to get Gemini suggestions.");
  if (!apiKey) {
    console.error("[BACKGROUND] Gemini API key not found internally.");
    return null;
  }
  console.log("[BACKGROUND] API Key retrieved for Gemini call.");

  const selectedModel = await getSelectedModel();
  if (!selectedModel) {
    console.error("[BACKGROUND] Gemini model not selected. Please select one in options.");
    showNotification("Model Not Selected", "A Gemini model needs to be selected in the extension options.");
    return null;
  }
  console.log(`[BACKGROUND] Using model: ${selectedModel}`);

  let contentForPrompt = "";
  if (pageContent && pageContent.trim() !== '') {
    // Truncate pageContent again here just in case, and prepare for prompt
    const maxLength = 3800; // Max length for page content in prompt, leaving room for other text
    contentForPrompt = pageContent.trim();
    if (contentForPrompt.length > maxLength) {
        contentForPrompt = contentForPrompt.substring(0, maxLength) + "...";
    }
    contentForPrompt = `\n\nKey content from the page (up to ${maxLength} chars):\n${contentForPrompt}`;
    console.log("[BACKGROUND] Page content will be included in the prompt.");
  } else {
    console.log("[BACKGROUND] No page content provided or content is empty, proceeding without it.");
  }

  // Simplified prompt: Ask for general categorization hints and a good title/summary.
  // The detailed mapping to FOLDER_STRUCTURE will happen in JavaScript.
  const prompt = `You are a content summarizer and categorizer.
Given URL: ${url}, Title: ${title}${contentForPrompt}

Please provide:
1. A concise, improved title for this bookmark.
2. A 3-5 word summary of the page's main purpose or content.
3. A few general keywords or a very high-level category suggestion (e.g., "Work Tool", "Tech News", "Gaming", "Shopping", "Personal Finance", "Adult").

Return ONLY JSON in the following format:
{
  "concise_website_title": "A brief, clear title",
  "context_summary": "A 3-5 word summary",
  "category_hints": ["keyword1", "keyword2", "high-level category"]
}

Example for a GitHub project about a data visualization tool:
{
  "concise_website_title": "Data Visualization Toolkit",
  "context_summary": "JS library for charts",
  "category_hints": ["data visualization", "javascript library", "work tool", "programming"]
}
Example for a news article about a new CPU:
{
  "concise_website_title": "New X-Processor CPU Review",
  "context_summary": "CPU benchmark and specs",
  "category_hints": ["hardware", "cpu", "tech news"]
}
If the content is clearly adult in nature, ensure "Adult Content" is one of the category_hints.
`;

  // console.log("[BACKGROUND] Prompt for Gemini:", prompt);

  try {
    const endpoint = `${GEMINI_API_BASE_URL}/${selectedModel}:generateContent?key=${apiKey}`;
    console.log(`[BACKGROUND] Calling Gemini endpoint: ${endpoint}`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    console.log(`[BACKGROUND] Gemini API response status: ${response.status}`);

    if (!response.ok) {
      const errorBodyText = await response.text(); // Read as text first for better error display
      console.error("[BACKGROUND] Gemini API request failed. Status:", response.status, "Body:", errorBodyText);
      let errorDetail = 'Unknown API error';
      try {
        const errorBodyJSON = JSON.parse(errorBodyText);
        errorDetail = errorBodyJSON.error?.message || errorBodyText;
      } catch (e) {
        errorDetail = errorBodyText; // Use raw text if not JSON
      }
      throw new Error(`API Error: ${response.status} - ${errorDetail}`);
    }

    const data = await response.json();
    console.log("[BACKGROUND] Gemini API raw response data:", JSON.stringify(data, null, 2));

    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
      let jsonResponseText = data.candidates[0].content.parts[0].text;
      console.log("[BACKGROUND] Extracted raw text from Gemini:", jsonResponseText);

      // Strip Markdown code fences if present
      const markdownJsonMatch = jsonResponseText.match(/```json\n([\s\S]*?)\n```/);
      if (markdownJsonMatch && markdownJsonMatch[1]) {
        jsonResponseText = markdownJsonMatch[1];
        console.log("[BACKGROUND] Stripped Markdown, using content:", jsonResponseText);
      } else {
        // Fallback for cases where it might just be ``` (without json) or other variations
        const markdownSimpleMatch = jsonResponseText.match(/```([\s\S]*?)```/);
        if (markdownSimpleMatch && markdownSimpleMatch[1]) {
            jsonResponseText = markdownSimpleMatch[1];
            console.log("[BACKGROUND] Stripped simple Markdown, using content:", jsonResponseText);
        }
      }
      // Trim any leading/trailing whitespace that might remain after stripping
      jsonResponseText = jsonResponseText.trim();

      console.log("[BACKGROUND] Attempting to parse JSON:", jsonResponseText);
      try {
        const parsedSuggestions = JSON.parse(jsonResponseText);
        console.log("[BACKGROUND] Successfully parsed suggestions object from LLM:", JSON.stringify(parsedSuggestions));

        // Validate the new expected fields from the simplified prompt
        const llmTitle = parsedSuggestions.concise_website_title;
        const llmSummary = parsedSuggestions.context_summary;
        const llmCategoryHints = parsedSuggestions.category_hints;

        if (llmTitle && typeof llmTitle === 'string' && llmTitle.trim() !== '' &&
            llmSummary && typeof llmSummary === 'string' && llmSummary.trim() !== '' &&
            Array.isArray(llmCategoryHints) && llmCategoryHints.length > 0 && llmCategoryHints.every(h => typeof h === 'string')) {
            
            // Perform local mapping to the detailed FOLDER_STRUCTURE
            const mappedPath = mapKeywordsToFolderPath(llmCategoryHints, llmTitle, url); // Implement this function

            console.log(`[BACKGROUND] LLM hints: ${llmCategoryHints.join(', ')}. Mapped path: ${mappedPath}`);

            return {
                suggested_folder_path: mappedPath,
                concise_website_title: llmTitle,
                context_summary: llmSummary
                // No longer expecting the LLM to return the full path directly
            };
        } else {
            console.error("[BACKGROUND] Detailed validation FAILED (simplified prompt). LLM response missing key fields or wrong type.");
            throw new Error("LLM response (simplified prompt) missing key fields or wrong type after validation.");
        }
      } catch (e) { // Catches JSON.parse error or the throw from validation
        console.error("[BACKGROUND] Error during parsing or detailed validation of Gemini response:", e.message);
        throw e; // Re-throw to be caught by the outer catch which returns null
      }
    } else {
      console.error("[BACKGROUND] Unexpected Gemini API response structure (no valid candidates/parts):", data);
      throw new Error("Malformed response from API (no candidates).");
    }
  } catch (error) {
    console.error("[BACKGROUND] Error in getGeminiSuggestions function:", error.message);
    if (error.message && (error.message.includes("API key not valid") || error.message.includes("API_KEY_INVALID"))) {
        showNotification("Gemini API Key Error", "Your Gemini API key is invalid or missing. Please check it in the extension options.");
    }
    return null; // Indicate failure
  }
}

// --- Chrome Extension Event Listeners & Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[BACKGROUND] Received message:", request);
  if (request.action === "getApiKey") {
    // Ensure cache is loaded if it hasn't been yet (e.g. very fast first message)
    if (cachedApiKey === null && !cachedNuxCompleted) { // Check nuxCompleted as a proxy for initial load attempt
        initializeAndCacheConfig().then(() => sendResponse({ apiKey: cachedApiKey }));
        return true; // Indicates asynchronous response
    }
    sendResponse({ apiKey: cachedApiKey });
  } else if (request.action === "getSelectedModel") {
    if (cachedSelectedModel === null && !cachedNuxCompleted) {
        initializeAndCacheConfig().then(() => sendResponse({ selectedModel: cachedSelectedModel }));
        return true; // Indicates asynchronous response
    }
    sendResponse({ selectedModel: cachedSelectedModel });
  } else if (request.action === "getPopupData") {
    // If critical config isn't fully loaded, or NUX isn't marked complete in cache,
    // try to re-initialize to pick up latest from storage.
    // This is especially for nuxCompleted, which might have just changed from false to true.
    if (cachedApiKey === null || cachedSelectedModel === null || cachedNuxCompleted === false) {
        initializeAndCacheConfig().then(() => {
            console.log("[BACKGROUND getPopupData] Sending re-initialized config to popup:", { apiKeySet: !!cachedApiKey, modelSet: !!cachedSelectedModel, nuxCompleted: cachedNuxCompleted });
            sendResponse({
                apiKey: cachedApiKey,
                selectedModel: cachedSelectedModel,
                nuxCompleted: cachedNuxCompleted
            });
        });
        return true; // Indicates asynchronous response
    }
    // If all critical items are cached and NUX is already marked true in cache, send current cache.
    console.log("[BACKGROUND getPopupData] Sending cached config to popup:", { apiKeySet: !!cachedApiKey, modelSet: !!cachedSelectedModel, nuxCompleted: cachedNuxCompleted });
    sendResponse({
        apiKey: cachedApiKey,
        selectedModel: cachedSelectedModel,
        nuxCompleted: cachedNuxCompleted
    });
  } else if (request.action === "getGeminiSuggestions") {
    // This action remains largely the same but will use the direct getApiKey/getSelectedModel for its own needs
    // which read directly from storage, ensuring it always uses the absolute latest if there was any sync delay.
    // For the API key passed from popup, it will use what popup had (which should be from cache).
    // It's a bit of a mix, but ensures robustness for the API call itself.
    getGeminiSuggestions(request.title, request.url, request.apiKey, request.pageContent) // Added request.pageContent
      .then(suggestions => sendResponse(suggestions))
      .catch(error => {
        console.error("[BACKGROUND getGeminiSuggestions CATCH BLOCK] Error:", error.message, error.stack);
        sendResponse({ error: error.message });
      });
    return true; // Indicates asynchronous response
  } else if (request.action === "getOrCreateFolder") {
    // Pass the API key from the request for logging purposes if needed, or use cached one.
    // The original function signature was getOrCreateFolder(path, apiKeyForLogging)
    getOrCreateFolder(request.path, cachedApiKey) 
      .then(folderId => {
        if (folderId) {
          sendResponse({ id: folderId, fullPath: request.path });
        } else {
          // If folderId is null, it means creation failed or path was invalid.
          // The original getOrCreateFolder logs the error. Send back an error to popup.
          sendResponse({ error: `Failed to get or create folder: ${request.path}. Check background logs.` });
        }
      })
      .catch(error => {
        console.error(`[BACKGROUND getOrCreateFolder CATCH BLOCK] Path: '${request.path}', Error:`, error.message, error.stack);
        sendResponse({ error: error.message });
      });
    return true;
  } else if (request.action === "toTitleCase") {
    sendResponse({ titleCasedText: toTitleCase(request.text) });
  } else if (request.action === "validateApiKey") {
    // This is a new action that options.js might use, or popup for re-validation
    validateApiKey(request.apiKey, request.modelToTestWith)
      .then(validationResult => sendResponse(validationResult))
      .catch(error => sendResponse({ error: error.message, success: false }));
    return true;
  } else if (request.action === "getBookmarkDetails") {
    handleGetBookmarkDetails(request.url, sendResponse);
    return true; // Indicates asynchronous response
  } else if (request.action === "fetchAvailableModels") {
    handleFetchAvailableModels(request.apiKey, sendResponse);
    return true; // Indicates asynchronous response
  } else if (request.action === "startBulkReclassifyAnalysis") {
    handleStartBulkReclassifyAnalysis(sendResponse);
    return true;
  } else if (request.action === "confirmBulkReclassify") {
    handleConfirmBulkReclassify(sendResponse);
    return true;
  } else if (request.action === "cancelBulkReclassification") {
    console.log("[BACKGROUND] Received request to cancel bulk reclassification.");
    isBulkReclassificationCancelled = true;
    sendResponse({ message: "Cancellation request received. Processing will stop shortly." });
    return false; // Synchronous response for this simple flag set
  } else if (request.action === "cleanEmptyFolders") {
    handleCleanEmptyFolders(sendResponse);
    return true; // Indicates asynchronous response
  } else if (request.action === "analyzeL2Folder") { // New action for L3 analysis
    if (!request.l2FolderId || !request.l2Path) {
      sendResponse({ error: "L2 Folder ID and Path are required for L3 analysis." });
      return false;
    }
    analyzeL2FolderForL3Suggestions(request.l2FolderId, request.l2Path)
      .then(suggestions => sendResponse({ suggestions }))
      .catch(error => {
        console.error("[BACKGROUND analyzeL2Folder CATCH BLOCK] Error:", error.message, error.stack);
        sendResponse({ error: error.message, suggestions: [] });
      });
    return true;
  } else if (request.action === "applyL3Suggestion") { // New action to apply an L3 suggestion
    if (!request.l2ParentId || !request.l2ParentPath || !request.newL3FolderName || !request.bookmarkIdsToMove) {
      sendResponse({ error: "Missing parameters for applying L3 suggestion." });
      return false;
    }
    handleApplyL3Suggestion(request.l2ParentId, request.l2ParentPath, request.newL3FolderName, request.bookmarkIdsToMove)
      .then(result => sendResponse(result))
      .catch(error => {
        console.error("[BACKGROUND applyL3Suggestion CATCH BLOCK] Error:", error.message, error.stack);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  // Add other actions if needed
  return false; // For synchronous responses or if no response is sent.
});

// To store the plan between analysis and confirmation
let bulkReclassificationPlan = null;
let isBulkReclassificationCancelled = false; // Flag to handle cancellation

async function handleStartBulkReclassifyAnalysis(sendResponse) {
  if (!cachedApiKey || !cachedSelectedModel) {
    sendResponse({ error: "API Key or Model not configured. Please set them in options." });
    return;
  }

  console.log("[BACKGROUND] Starting bulk reclassification analysis...");
  bulkReclassificationPlan = []; // Reset any previous plan
  isBulkReclassificationCancelled = false; // Reset cancellation flag
  let report = "Bulk Reclassification Analysis Report:\n=======================================\n";
  let bookmarksProcessed = 0;
  const maxBookmarksToProcess = 200; // Safety limit to prevent excessive API calls in one go
  let totalBookmarksToAnalyze = 0;
  let apiErrors = 0;

  try {
    const allBookmarks = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
    const bookmarkItems = [];

    function flattenBookmarks(node) {
      if (node.url) { // It's a bookmark
        // Exclude bookmarks in already well-structured folders if desired (more complex logic)
        // For now, process all bookmarks that are not in an obvious system folder or very deep.
        // This simple filter avoids processing bookmarks from the root or special folders directly.
        if (node.parentId && node.parentId !== '0' && node.parentId !== '1' && node.parentId !== '2') {
            bookmarkItems.push(node);
        }
      } else if (node.children) { // It's a folder
        node.children.forEach(flattenBookmarks);
      }
    }

    allBookmarks.forEach(flattenBookmarks);
    console.log(`[BACKGROUND] Found ${bookmarkItems.length} total bookmark items to potentially reclassify.`);

    // Determine the actual number of bookmarks that will be analyzed based on the limit
    totalBookmarksToAnalyze = Math.min(bookmarkItems.length, maxBookmarksToProcess);

    // Send initial progress
    chrome.runtime.sendMessage({
        action: "bulkReclassifyProgress",
        processed: 0,
        total: totalBookmarksToAnalyze,
        log: `Found ${bookmarkItems.length} bookmarks. Analyzing up to ${totalBookmarksToAnalyze}.`,
        logType: "info"
    });

    report += `Found ${bookmarkItems.length} bookmark items. Analyzing up to ${totalBookmarksToAnalyze}...\n\n`;

    for (const bookmark of bookmarkItems) {
      if (isBulkReclassificationCancelled) {
        report += "\n\nAnalysis was CANCELLED by the user.\n";
        chrome.runtime.sendMessage({
            action: "bulkReclassifyProgress",
            log: "Bulk reclassification process was cancelled by the user.",
            logType: "error",
            statusUpdate: "Reclassification analysis cancelled.",
            statusType: "error"
        });
        break; // Exit the loop
      }

      if (bookmarksProcessed >= maxBookmarksToProcess) {
        report += `\nAnalysis limit of ${maxBookmarksToProcess} bookmarks reached. Process more in a subsequent run if needed.\n`;
        break;
      }
      if (!bookmark.url || bookmark.url.startsWith('chrome://') || bookmark.url.startsWith('javascript:')) {
        continue; // Skip internal or scriptlet bookmarks
      }

      // Send progress update before processing this bookmark
      // It's sent before because getGeminiSuggestions is async and might take time
      chrome.runtime.sendMessage({
          action: "bulkReclassifyProgress",
          processed: bookmarksProcessed, // Current count before this one
          total: totalBookmarksToAnalyze,
          log: `Analyzing: "${bookmark.title}" (URL: ${bookmark.url ? bookmark.url.substring(0, 70) + '...': 'N/A'})`,
          logType: "normal"
      });

      try {
        const suggestions = await getGeminiSuggestions(bookmark.title, bookmark.url, cachedApiKey);
        bookmarksProcessed++; // Increment after successful or attempted suggestion

        if (suggestions && suggestions.suggested_folder_path && suggestions.concise_website_title) {
          const newAlias = `${suggestions.concise_website_title} (${suggestions.context_summary || 'N/A'})`;
          const currentPath = await getBookmarkPath(bookmark.parentId);
          
          // Only add to plan if there's a meaningful change
          if (currentPath.toLowerCase() !== suggestions.suggested_folder_path.toLowerCase() || bookmark.title !== newAlias) {
            bulkReclassificationPlan.push({
              id: bookmark.id,
              oldTitle: bookmark.title,
              oldPath: currentPath,
              newTitle: newAlias,
              newPath: suggestions.suggested_folder_path,
              parentId: bookmark.parentId // Keep original parentId for path comparison if needed
            });
            report += `---------------------------------------\n`;
            report += `Bookmark: "${bookmark.title}" (ID: ${bookmark.id})\n`;
            report += `  Current Path: ${currentPath || 'Unknown'}\n`;
            report += `  Suggested New Path: ${suggestions.suggested_folder_path}\n`;
            report += `  Suggested New Alias: ${newAlias}\n`;
          } else {
            // report += `Bookmark "${bookmark.title}" - No change suggested.\n`;
          }
        } else {
          report += `---------------------------------------\n`;
          report += `Bookmark: "${bookmark.title}" (ID: ${bookmark.id})\n`;
          report += `  Current Path: ${await getBookmarkPath(bookmark.parentId) || 'Unknown'}\n`;
          report += `  Failed to get suggestions or suggestions incomplete.\n`;
          if(suggestions && suggestions.error) report += `  Error: ${suggestions.error}\n`;
          chrome.runtime.sendMessage({ action: "bulkReclassifyProgress", log: `Failed to get suggestions for "${bookmark.title}".`, logType: "error" });
        }
      } catch (suggestionError) {
        bookmarksProcessed++; // Also increment if there was an error processing this specific bookmark
        apiErrors++;
        console.error(`[BACKGROUND] Error getting suggestion for bookmark ${bookmark.id}:`, suggestionError);
        report += `---------------------------------------\n`;
        report += `Bookmark: "${bookmark.title}" (ID: ${bookmark.id}) - Error during analysis: ${suggestionError.message}\n`;
        chrome.runtime.sendMessage({ action: "bulkReclassifyProgress", log: `Error analyzing "${bookmark.title}": ${suggestionError.message}`, logType: "error" });
      }
       // Simple delay to avoid hitting API rate limits too hard - adjust as needed
      if (bookmarksProcessed % 5 === 0) { // e.g., pause every 5 bookmarks
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second pause
      }
    }

    if (isBulkReclassificationCancelled) {
        console.log("[BACKGROUND] Bulk reclassification analysis was cancelled.");
        // sendResponse is tricky here as it might have already been called by the progress update
        // The options page should handle the UI based on cancellation messages.
        // We might not need to send a final report if cancelled, or a very brief one.
        sendResponse({ report: report + "\nAnalysis Cancelled.", wasCancelled: true });
        return;
    }

    if (bulkReclassificationPlan.length === 0 && apiErrors === 0) {
      report += "\nNo changes suggested for the analyzed bookmarks or no bookmarks found meeting criteria.";
    } else if (bulkReclassificationPlan.length === 0 && apiErrors > 0) {
        report += `\nNo changes suggested, but ${apiErrors} errors occurred during analysis. Check console.`;
    } else {
        report += `\nTotal changes proposed: ${bulkReclassificationPlan.length}\n`;
    }
    if (apiErrors > 0) {
        report += `Encountered ${apiErrors} errors during API calls. Some bookmarks may not have been analyzed correctly.\n`;
    }

    report += "=======================================\nEnd of Report.";
    console.log("[BACKGROUND] Bulk reclassification analysis complete.");
    // Send final progress update that might also include the report summary
    chrome.runtime.sendMessage({
        action: "bulkReclassifyProgress",
        processed: bookmarksProcessed,
        total: totalBookmarksToAnalyze,
        log: `Analysis finished. ${bulkReclassificationPlan.length} changes proposed. ${apiErrors} errors. Report generated.`,
        logType: "info",
        statusUpdate: "Analysis complete. Report generated.", // Optional: update main status too
        statusType: "success"
    });
    sendResponse({ report: report, totalBookmarks: totalBookmarksToAnalyze /* send total for final bar update */ });

  } catch (error) {
    console.error("[BACKGROUND] Error during bulk reclassification analysis:", error);
    sendResponse({ error: `Failed to perform analysis: ${error.message}` });
  }
}

async function getBookmarkPath(bookmarkId) {
  if (!bookmarkId || bookmarkId === '0') return "";
  let pathArray = [];
  let currentParentId = bookmarkId;
  try {
    // First, check if the ID itself is a folder, to get its own path
    // This loop is for getting the path OF a folder, or the path TO a bookmark (by passing its parentId)
    while (currentParentId && currentParentId !== '0') {
        const parentNodes = await chrome.bookmarks.get(currentParentId);
        if (parentNodes && parentNodes.length > 0) {
            const parentNode = parentNodes[0];
            if (parentNode.id === '1' || parentNode.id === '2') { // Skip Bookmarks Bar/Other Bookmarks from path string
                 // but continue to get their children if they are the starting point
                 if (pathArray.length === 0 && parentNode.id === bookmarkId) { // If we started with BB/OB itself
                    // pathArray.unshift(parentNode.title); // Optionally add "Bookmarks Bar" or "Other Bookmarks"
                 }
            } else if (parentNode.title) {
                pathArray.unshift(parentNode.title);
            }
            if (parentNode.id === currentParentId && parentNode.parentId === '0') break; // Reached true root for this node
            currentParentId = parentNode.parentId;
            if (!currentParentId) break; // Explicitly break if parentId is null/undefined
        } else {
            break;
        }
    }
  } catch (e) {
    console.error(`Error getting path for bookmarkId ${bookmarkId}:`, e);
    return "Error/UnknownPath";
  }
  return pathArray.join('/');
}


async function handleConfirmBulkReclassify(sendResponse) {
  if (!bulkReclassificationPlan || bulkReclassificationPlan.length === 0) {
    sendResponse({ error: "No reclassification plan found or plan is empty. Please run analysis first." });
    return;
  }

  console.log("[BACKGROUND] Confirming and applying bulk reclassification...");
  let changesApplied = 0;
  let errorsApplying = 0;
  let foldersDeleted = 0; // To count deleted empty folders

  for (const item of bulkReclassificationPlan) {
    try {
      // 1. Get or create the new target folder
      const targetFolderId = await getOrCreateFolder(item.newPath, cachedApiKey);
      if (!targetFolderId) {
        console.error(`[BACKGROUND] Failed to get/create target folder "${item.newPath}" for bookmark ID ${item.id}. Skipping.`);
        errorsApplying++;
        continue;
      }

      // 2. Update title and move bookmark if necessary
      let updated = false;
      if (item.newTitle !== item.oldTitle) {
        await chrome.bookmarks.update(item.id, { title: item.newTitle });
        updated = true;
      }
      // Check if parentId needs to change
      const currentBookmark = (await chrome.bookmarks.get(item.id))[0];
      if (currentBookmark.parentId !== targetFolderId) {
        await chrome.bookmarks.move(item.id, { parentId: targetFolderId });
        updated = true;
      }
      
      if(updated) changesApplied++;

    } catch (error) {
      console.error(`[BACKGROUND] Error applying change for bookmark ID ${item.id} (Old title: "${item.oldTitle}"):`, error);
      errorsApplying++;
    }
  }

  bulkReclassificationPlan = null; // Clear the plan after execution

  // Empty folder cleanup is now initiated by options.js after this step, if confirmed by user.
  // So, this function will only report on the reclassification itself.
  const resultMessage = `Bulk reclassification applied. Changes: ${changesApplied}. Errors: ${errorsApplying}.`;
  console.log(`[BACKGROUND] ${resultMessage}`);
  sendResponse({ message: resultMessage, reclassificationDone: true }); // Indicate main task is done
}

async function handleCleanEmptyFolders(sendResponse) {
    console.log("[BACKGROUND] Received request to clean empty folders.");
    try {
        const deletedCount = await deleteEmptyBookmarkFolders();
        const message = `Empty folder cleanup complete. Deleted ${deletedCount} folder(s).`;
        console.log(`[BACKGROUND] ${message}`);
        showNotification("Cleanup Complete", message); // Optional: notify user
        sendResponse({ message: message });
    } catch (error) {
        console.error("[BACKGROUND] Error during manual empty folder cleanup:", error);
        sendResponse({ error: `Failed to clean empty folders: ${error.message}` });
    }
}

async function deleteEmptyBookmarkFolders() {
  let deletedCount = 0;
  // IDs '1' (Bookmarks Bar), '2' (Other Bookmarks), '3' (Mobile Bookmarks) are roots we scan under, but don't delete themselves.
  const rootsToScanChildrenOf = ['1', '2', '3'];

  async function recursivelyProcessAndDeleteEmpty(folderId) {
    if (rootsToScanChildrenOf.includes(folderId)) {
      // This is a root like "Bookmarks Bar". We don't delete it,
      // but we process its children.
      const children = await chrome.bookmarks.getChildren(folderId);
      for (const child of children) {
        if (!child.url) { // If it's a folder
          await recursivelyProcessAndDeleteEmpty(child.id);
        }
      }
      return; // Finished processing children of this root
    }

    // For any other folder, first process its children
    let children;
    try {
        children = await chrome.bookmarks.getChildren(folderId);
    } catch (e) {
        // Folder might have been deleted by a concurrent call (e.g. child of a deleted parent)
        console.warn(`[BACKGROUND] Error fetching children for folder ${folderId} (may already be deleted):`, e.message);
        return; // Cannot process further
    }

    for (const child of children) {
      if (!child.url) { // It's a sub-folder
        await recursivelyProcessAndDeleteEmpty(child.id);
      }
    }

    // After sub-folders are processed, re-check if the current folder is empty
    let currentFolderChildren;
    try {
        currentFolderChildren = await chrome.bookmarks.getChildren(folderId);
    } catch (e) {
        console.warn(`[BACKGROUND] Error re-fetching children for folder ${folderId} (may already be deleted):`, e.message);
        return; // Cannot process further
    }

    if (currentFolderChildren.length === 0) {
      try {
        const folderNode = (await chrome.bookmarks.get(folderId))[0];
        console.log(`[BACKGROUND] Deleting empty folder: "${folderNode.title}" (ID: ${folderId})`);
        await chrome.bookmarks.remove(folderId);
        deletedCount++;
      } catch (e) {
        console.error(`[BACKGROUND] Failed to delete empty folder ID ${folderId}:`, e);
      }
    }
  }

  // Start scanning from the children of the main roots
  for (const rootId of rootsToScanChildrenOf) {
    try {
      const l1Folders = await chrome.bookmarks.getChildren(rootId);
      for (const l1Folder of l1Folders) {
        if (!l1Folder.url) { // If this L1 item is a folder
          await recursivelyProcessAndDeleteEmpty(l1Folder.id);
        }
      }
    } catch (e) {
      // This root (e.g. Mobile bookmarks) might not exist, which is fine.
      console.warn(`[BACKGROUND] Could not get children of root ${rootId}, it might not exist.`);
    }
  }
  return deletedCount;
}

// --- L3 Dynamic Folder Logic ---

const L3_ANALYSIS_MIN_BOOKMARKS_IN_L2 = 8; // Minimum bookmarks in L2 to consider L3 analysis
const L3_SUGGESTION_MIN_CLUSTER_SIZE = 3;  // Minimum bookmarks in a cluster to suggest an L3

async function analyzeL2FolderForL3Suggestions(l2FolderId, l2Path) {
  console.log(`[BACKGROUND analyzeL2FolderForL3Suggestions] Analyzing L2 folder: ${l2Path} (ID: ${l2FolderId})`);
  let l2Children;
  try {
    l2Children = await chrome.bookmarks.getChildren(l2FolderId);
  } catch (e) {
    console.error(`[BACKGROUND] Error fetching children for L2 folder ${l2FolderId}:`, e);
    return { error: `Could not read L2 folder contents: ${e.message}` };
  }

  const bookmarkItems = l2Children.filter(bm => bm.url && !bm.url.startsWith('chrome:') && !bm.url.startsWith('javascript:'));

  if (bookmarkItems.length < L3_ANALYSIS_MIN_BOOKMARKS_IN_L2) {
    console.log(`[BACKGROUND] L2 folder ${l2Path} has ${bookmarkItems.length} bookmarks, less than threshold ${L3_ANALYSIS_MIN_BOOKMARKS_IN_L2}. Skipping L3 analysis.`);
    return []; // Not enough bookmarks
  }

  let suggestions = [];
  let remainingBookmarks = [...bookmarkItems]; // Copy for processing

  // 1. Domain-Based Grouping
  const domainGroups = {};
  for (const bm of remainingBookmarks) {
    try {
      const url = new URL(bm.url);
      // Normalize domain: remove 'www.' and take the primary part (e.g., google.com from mail.google.com)
      let domain = url.hostname.replace(/^www\\./, '');
      const parts = domain.split('.');
      if (parts.length > 2) { // Handle subdomains like 'docs.google.com' -> 'google.com' for broader grouping
          // This heuristic might need adjustment based on common patterns.
          // For now, let's try to group by the main site.
          const commonSLDs = ['co', 'com', 'org', 'net', 'gov', 'edu']; // common second-level domains
          if (commonSLDs.includes(parts[parts.length - 2])) {
              domain = parts.slice(-3).join('.'); // e.g. something.co.uk
          } else {
              domain = parts.slice(-2).join('.'); // e.g. google.com
          }
      }

      if (!domainGroups[domain]) domainGroups[domain] = [];
      domainGroups[domain].push(bm);
    } catch (e) {
      console.warn(`[BACKGROUND] Invalid URL for domain grouping: ${bm.url}`, e.message);
    }
  }

  const processedIds = new Set();
  for (const domain in domainGroups) {
    if (domainGroups[domain].length >= L3_SUGGESTION_MIN_CLUSTER_SIZE) {
      const bookmarkIdsToMove = domainGroups[domain].map(bm => bm.id);
      // Simple naming: "YouTube Links" from "youtube.com"
      const L3Name = toTitleCase(domain.split('.')[0]) + " Links"; 
      
      suggestions.push({
        l2ParentId: l2FolderId,
        l2ParentPath: l2Path,
        proposedL3Name: L3Name,
        reason: `Multiple links from domain: ${domain}`,
        criteria: domain,
        bookmarkIdsToMove: bookmarkIdsToMove,
        bookmarks: domainGroups[domain].map(bm => ({id: bm.id, title: bm.title, url: bm.url})) // for display
      });
      bookmarkIdsToMove.forEach(id => processedIds.add(id));
    }
  }
  // Update remainingBookmarks for keyword analysis
  remainingBookmarks = remainingBookmarks.filter(bm => !processedIds.has(bm.id));


  // 2. Keyword-Based Grouping (Simplified: on remaining bookmarks)
  if (remainingBookmarks.length >= L3_SUGGESTION_MIN_CLUSTER_SIZE * 1.5) { // Only if enough items left
    const keywordMap = new Map(); // keyword -> { count, bookmarkObjs: [{id, title, url}] }
    const stopWords = new Set([
      "a", "an", "the", "is", "are", "to", "of", "for", "on", "in", "and", "or", "how", "what", "why",
      "com", "org", "net", "www", "http", "https", "html", "pdf", "docs", "guide", "tutorial", "news",
      "article", "video", "page", "link", "website", "official", "home", "index", "main", "content",
      "resource", "reference", "learn", "about", "with", "from", "into", "using", "based", "best", "top"
      // Add more common/generic words
    ]);

    remainingBookmarks.forEach(bm => {
      const titleWords = bm.title.toLowerCase().match(/[a-z0-9]+/g) || [];
      const uniqueTitleWords = new Set();
      titleWords.forEach(word => {
        if (word.length > 3 && !stopWords.has(word) && !processedIds.has(bm.id)) {
          uniqueTitleWords.add(word);
        }
      });

      uniqueTitleWords.forEach(keyword => {
        if (!keywordMap.has(keyword)) keywordMap.set(keyword, { count: 0, bookmarkObjs: [] });
        const entry = keywordMap.get(keyword);
        entry.count++;
        entry.bookmarkObjs.push({id: bm.id, title: bm.title, url: bm.url});
      });
    });

    const sortedKeywords = Array.from(keywordMap.entries())
                                .filter(([kw, data]) => data.count >= L3_SUGGESTION_MIN_CLUSTER_SIZE)
                                .sort((a, b) => b[1].count - a[1].count);
    
    // Take top N keywords or those meeting a certain distinctiveness
    for (const [keyword, data] of sortedKeywords.slice(0, 3)) { // Limit to top 3 keyword suggestions for now
        const bookmarkIdsToMove = data.bookmarkObjs.map(bm => bm.id);
        // Ensure these bookmarks haven't been claimed by a previous keyword suggestion in this loop
        const newBookmarkIds = bookmarkIdsToMove.filter(id => !processedIds.has(id));

        if (newBookmarkIds.length >= L3_SUGGESTION_MIN_CLUSTER_SIZE) {
            const L3Name = `About "${toTitleCase(keyword)}"`;
            suggestions.push({
                l2ParentId: l2FolderId,
                l2ParentPath: l2Path,
                proposedL3Name: L3Name,
                reason: `Common keyword in titles: "${keyword}"`,
                criteria: keyword,
                bookmarkIdsToMove: newBookmarkIds,
                bookmarks: data.bookmarkObjs.filter(bm => newBookmarkIds.includes(bm.id))
            });
            newBookmarkIds.forEach(id => processedIds.add(id));
        }
    }
  }
  
  console.log(`[BACKGROUND analyzeL2FolderForL3Suggestions] Found ${suggestions.length} L3 suggestions for ${l2Path}.`);
  return suggestions;
}

async function handleApplyL3Suggestion(l2ParentId, l2ParentPath, newL3FolderName, bookmarkIdsToMove) {
  console.log(`[BACKGROUND handleApplyL3Suggestion] Applying L3 suggestion: Create "${newL3FolderName}" in "${l2ParentPath}" and move ${bookmarkIdsToMove.length} bookmarks.`);
  if (!l2ParentId || !l2ParentPath || !newL3FolderName || !bookmarkIdsToMove || bookmarkIdsToMove.length === 0) {
    return { success: false, error: "Invalid parameters for applying L3 suggestion." };
  }

  const fullL3Path = `${l2ParentPath}/${toTitleCase(newL3FolderName)}`;
  try {
    const l3FolderId = await getOrCreateFolder(fullL3Path, cachedApiKey); // Use cachedApiKey for logging if needed
    if (!l3FolderId) {
      throw new Error(`Failed to create or find L3 folder: ${fullL3Path}`);
    }

    let movedCount = 0;
    for (const bookmarkId of bookmarkIdsToMove) {
      try {
        await chrome.bookmarks.move(bookmarkId, { parentId: l3FolderId });
        movedCount++;
      } catch (moveError) {
        console.error(`[BACKGROUND] Error moving bookmark ID ${bookmarkId} to L3 folder ${l3FolderId}:`, moveError);
        // Continue trying to move other bookmarks
      }
    }
    const message = `Successfully created L3 folder "${toTitleCase(newL3FolderName)}" and moved ${movedCount}/${bookmarkIdsToMove.length} bookmarks.`;
    console.log(`[BACKGROUND] ${message}`);
    showNotification("L3 Folder Created", message);
    return { success: true, message: message, l3FolderId: l3FolderId, l3FolderPath: fullL3Path };

  } catch (error) {
    console.error("[BACKGROUND] Error in handleApplyL3Suggestion:", error);
    return { success: false, error: error.message };
  }
}


async function handleFetchAvailableModels(apiKey, sendResponse) {
  if (!apiKey) {
    sendResponse({ error: "API Key is required to fetch models.", models: null });
    return;
  }
  try {
    const response = await fetch(`${GEMINI_API_BASE_URL}/models?key=${apiKey}`);
    const data = await response.json(); // Try to parse JSON for error details too

    if (!response.ok) {
      const errorMessage = data.error?.message || `Failed to fetch models: ${response.status}`;
      console.error("[BACKGROUND handleFetchAvailableModels] Error:", errorMessage, data);
      sendResponse({ error: errorMessage, models: null });
      return;
    }

    const compatibleModels = data.models.filter(model => 
        model.supportedGenerationMethods && model.supportedGenerationMethods.includes('generateContent')
    );

    if (compatibleModels.length > 0) {
      cachedAvailableModels = compatibleModels; // Update in-memory cache
      await new Promise(resolve => chrome.storage.local.set({ availableGeminiModels: compatibleModels }, resolve)); // Update local storage cache
      sendResponse({ models: compatibleModels, error: null });
    } else {
      sendResponse({ models: [], error: "No compatible models found for generateContent." });
    }
  } catch (error) {
    console.error("[BACKGROUND handleFetchAvailableModels CATCH BLOCK] Error:", error);
    sendResponse({ error: `Network or other error: ${error.message}`, models: null });
  }
}

async function handleGetBookmarkDetails(url, sendResponse) {
  if (!url) {
    sendResponse({ error: "URL is required to get bookmark details." });
    return;
  }
  try {
    const searchResults = await chrome.bookmarks.search({ url: url });
    if (searchResults && searchResults.length > 0) {
      const bookmark = searchResults[0];
      let fullPath = "";
      if (bookmark.parentId) {
        let pathArray = [];
        let currentParentId = bookmark.parentId;
        while (currentParentId && currentParentId !== '0') { // Stop if no parent or root is reached
          const parentNodes = await chrome.bookmarks.get(currentParentId);
          if (parentNodes && parentNodes.length > 0) {
            const parentNode = parentNodes[0];
            // Prepend title, handle special cases for root folders if necessary
            if (parentNode.id === '1') { // Bookmarks Bar - often not included or named explicitly in user paths
              // pathArray.unshift("Bookmarks Bar"); // Or decide to omit/handle differently
            } else if (parentNode.id === '2') { // Other Bookmarks
              // pathArray.unshift("Other Bookmarks");
            } else if (parentNode.title) {
              pathArray.unshift(parentNode.title);
            }
            currentParentId = parentNode.parentId;
          } else {
            break; // Parent not found, stop path construction
          }
        }
        fullPath = pathArray.join('/');
      }
      sendResponse({ ...bookmark, fullPath: fullPath });
    } else {
      sendResponse(null); // No bookmark found
    }
  } catch (error) {
    console.error("[BACKGROUND handleGetBookmarkDetails CATCH BLOCK] Error:", error.message, error.stack);
    sendResponse({ error: `Error searching for bookmark: ${error.message}` });
  }
}

// Function to validate API key (can be called from options or popup)
async function validateApiKey(apiKeyToTest, modelToTestWith) {
  if (!apiKeyToTest || !modelToTestWith) {
    return { success: false, message: "API Key and Model are required for validation." };
  }
  try {
    const endpoint = `${GEMINI_API_BASE_URL}/${modelToTestWith}:generateContent?key=${apiKeyToTest}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Test: Say Hi" }] }] })
    });
    const data = await response.json(); // Attempt to parse JSON regardless of response.ok for error details
    if (response.ok && data.candidates && data.candidates.length > 0) {
      return { success: true, message: "API Key test successful!" };
    } else {
      const errorMessage = data.error?.message || `API Error: ${response.status}`;
      console.error("[BACKGROUND validateApiKey] Test failed:", response.status, data.error);
      return { success: false, message: `Test failed: ${errorMessage}` };
    }
  } catch (error) {
    console.error("[BACKGROUND validateApiKey CATCH BLOCK] Error:", error);
    return { success: false, message: `Network or other error: ${error.message}` };
  }
}

// --- Automatic Bookmark Processing (Example - if you had such a feature) ---
// chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
//   console.log("[BACKGROUND] New bookmark created:", bookmark);
//   if (!cachedApiKey || !cachedSelectedModel) {
//     console.log("[BACKGROUND] API key or model not set, skipping auto-processing.");
//     return;
//   }
//   if (bookmark.url && !bookmark.url.startsWith('chrome://')) {
//     // Check if auto-processing is enabled (you'd need a setting for this)
//     // const { autoProcessEnabled } = await chrome.storage.sync.get('autoProcessEnabled');
//     // if (autoProcessEnabled) { ... }\n
//     // Example: Get suggestions and move it (be careful with this, can be intrusive)
//     // const suggestions = await getGeminiSuggestions(bookmark.title, bookmark.url, cachedApiKey);
//     // if (suggestions && suggestions.suggested_folder_path) {
//     //   const folderId = await getOrCreateFolder(suggestions.suggested_folder_path, cachedApiKey);
//     //   if (folderId && folderId !== bookmark.parentId) {
//     //     await chrome.bookmarks.move(bookmark.id, { parentId: folderId });
//     //     console.log(`[BACKGROUND] Auto-moved bookmark "${bookmark.title}" to "${suggestions.suggested_folder_path}"`);
//     //     showNotification("Bookmark Auto-Organized", `"${bookmark.title}" moved to ${suggestions.suggested_folder_path}`);
//     //   }
//     // }
//   }
// });


// --- Utility: Show Notification ---
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png', // Ensure you have this icon
    title: title,
    message: message,
    priority: 0
  });
}

// Placeholder for the new mapping function - this will need detailed implementation
function mapKeywordsToFolderPath(keywords, title, url) {
  console.log(`[BACKGROUND mapKeywordsToFolderPath] Mapping keywords: ${keywords.join(", ")}, title: ${title}`);
  // Convert all keywords to lowercase for easier matching
  const lowerKeywords = keywords.map(k => k.toLowerCase());

  // Rule for Adult Content (highest priority)
  if (lowerKeywords.some(k => k.includes('adult content') || k.includes('adult'))) {
    return "Entertainment & Hobbies/Adult Content";
  }

  // Simple keyword-based mapping to L1/L2. This needs to be expanded significantly.
  // Professional Sphere
  if (lowerKeywords.some(k => k.includes('data') || k.includes('analytic'))) return "Professional Sphere/Data & Analytics Tools";
  if (lowerKeywords.some(k => k.includes('productivity') || k.includes('tool') || k.includes('work'))) return "Professional Sphere/Productivity Tools";
  if (lowerKeywords.some(k => k.includes('learn') || k.includes('reference') || k.includes('tutorial') || k.includes('doc'))) return "Professional Sphere/Technical Learning & Reference";
  if (lowerKeywords.some(k => k.includes('communication') || k.includes('work resource'))) return "Professional Sphere/Work Communication & Resources";

  // Technology & Digital Ecosystem
  if (lowerKeywords.some(k => k.includes('hardware') || k.includes('peripheral'))) return "Technology & Digital Ecosystem/Hardware & Peripherals";
  if (lowerKeywords.some(k => k.includes('software') || k.includes('driver'))) return "Technology & Digital Ecosystem/Software & Drivers";
  if (lowerKeywords.some(k => k.includes('tech news') || k.includes('community'))) return "Technology & Digital Ecosystem/Tech News & Communities";
  if (lowerKeywords.some(k => k.includes('online utilit') || k.includes('service'))) return "Technology & Digital Ecosystem/Online Utilities & Services";
  if (lowerKeywords.some(k => k.includes('3d print') || k.includes('design'))) return "Technology & Digital Ecosystem/3D Printing & Design";
  
  // Entertainment & Hobbies
  if (lowerKeywords.some(k => k.includes('game') || k.includes('gaming'))) return "Entertainment & Hobbies/Gaming Hub";
  if (lowerKeywords.some(k => k.includes('cheat') || k.includes('game service'))) return "Entertainment & Hobbies/Game Services & Cheats";
  if (lowerKeywords.some(k => k.includes('media') || k.includes('stream') || k.includes('movie') || k.includes('tv'))) return "Entertainment & Hobbies/Media & Streaming";
  if (lowerKeywords.some(k => k.includes('creative') || k.includes('making') || k.includes('hobby'))) return "Entertainment & Hobbies/Creative & Making";

  // Personal Life & Ventures
  if (lowerKeywords.some(k => k.includes('shop'))) {
    if (lowerKeywords.some(k => k.includes('fashion' || k.includes('replica')))) return "Personal Life & Ventures/Shopping - Fashion & Replicas";
    return "Personal Life & Ventures/Shopping - General & Tech";
  }
  if (lowerKeywords.some(k => k.includes('travel') || k.includes('experience'))) return "Personal Life & Ventures/Travel & Experiences";
  if (lowerKeywords.some(k => k.includes('home') || k.includes('health') || k.includes('finance'))) return "Personal Life & Ventures/Home, Health & Finance";
  if (lowerKeywords.some(k => k.includes('social') || k.includes('personal communication'))) return "Personal Life & Ventures/Social & Communications (Personal)";

  // Fallback if no specific L2 match from keywords
  // Try to match L1 based on broader keywords
  if (lowerKeywords.some(k => k.includes('work') || k.includes('professional') || k.includes('career') || k.includes('business'))) return "Professional Sphere/Productivity Tools"; // Default L2 for Professional
  if (lowerKeywords.some(k => k.includes('tech') || k.includes('digital') || k.includes('computer'))) return "Technology & Digital Ecosystem/Online Utilities & Services"; // Default L2 for Tech
  if (lowerKeywords.some(k => k.includes('entertainment') || k.includes('fun') || k.includes('leisure'))) return "Entertainment & Hobbies/Media & Streaming"; // Default L2 for Entertainment
  if (lowerKeywords.some(k => k.includes('personal') || k.includes('life'))) return "Personal Life & Ventures/Home, Health & Finance"; // Default L2 for Personal

  console.log(`[BACKGROUND mapKeywordsToFolderPath] No specific mapping found for keywords: ${keywords.join(", ")}. Using default.`);
  return DEFAULT_FOLDER_PATH; // Default path if no rules match
}
