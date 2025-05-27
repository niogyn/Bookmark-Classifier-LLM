# AI-Powered Structured Bookmark Organizer

**Version:** 1.0

This document describes the current features of version 1.0. This Chrome extension leverages the power of the Google Gemini API to help users intelligently organize their Chrome bookmarks into a predefined, structured hierarchy with consistent naming conventions. It features a New User Experience (NUX) to guide users through initial setup.

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
  - [Core Components](#core-components)
  - [New User Experience (NUX)](#new-user-experience-nux)
  - [Retroactive Organization](#retroactive-organization)
  - [Proactive Bookmarking](#proactive-bookmarking)
  - [Options Page](#options-page)
  - [Folder Structure](#folder-structure)
  - [Bookmark Alias Format](#bookmark-alias-format)
- [Interdependencies](#interdependencies)
- [Installation and Setup](#installation-and-setup)
- [Usage](#usage)
- [File Structure](#file-structure)
- [Troubleshooting](#troubleshooting)
- [Future Enhancements (Optional)](#future-enhancements-optional)

## Features

*   **AI-Powered Categorization:** Uses the user-configured Gemini API and selected model to suggest category hints and keywords based on bookmark URL, title, and page content (for proactive bookmarking). The extension then locally maps these hints to its predefined folder structure.
*   **AI-Powered Aliasing:** Generates concise and descriptive bookmark titles (aliases) using the Gemini API, incorporating a summary of the page's content.
*   **New User Experience (NUX):** Guides first-time users through essential setup steps for their Gemini API Key and Model Selection via the Options page. Offers an optional bulk reclassification of existing bookmarks at the end of the NUX.
*   **Retroactive Organization:** Optionally, automatically processes newly created bookmarks in default locations, filing them into the structured hierarchy using AI suggestions. (Note: This feature is currently under development or temporarily disabled in the current version).
*   **Proactive Bookmarking:** Allows users to save the currently active tab directly into the structured bookmark system via the extension popup. Utilizes page content extraction from the active tab to improve suggestion accuracy for categorization and aliasing. Features AI-suggested and user-editable alias and folder placement, including the ability to create new L2 or L3 subfolders directly from the popup.
*   **Dynamic Folder Creation:** Automatically creates necessary L1, L2, or L3 folders if they don't exist, based on AI suggestions or user input. If an AI-suggested path is new, it appears as a "(Create New) ..." option in the popup.
*   **Configurable API Key & Model Selection:** Users must enter their own Google Gemini API key. They can then fetch a list of compatible Gemini models and select one for the extension to use for all AI-powered features via the options page.
*   **Bulk Reclassification:** Allows users to analyze and reorganize their existing bookmarks using AI suggestions via the Options page.
*   **Clean Empty Folders:** Provides a utility to scan and remove empty bookmark folders, accessible from the popup and the Options page.
*   **Reset to Defaults:** An option to clear all settings (API key, model selection, NUX completion status) and re-trigger the NUX for a fresh setup.
*   **Clean User Interface:** Intuitive popup and options page for ease of use.

## How It Works

This extension is a Manifest V3 Chrome extension, utilizing a service worker for background tasks and a browser action popup for user interaction. Communication between the popup and service worker is handled via `chrome.runtime.sendMessage`.

### Core Components

1.  **`manifest.json`**: Defines the extension's metadata, permissions (bookmarks, activeTab, storage, host access to Gemini API), background service worker, browser action popup, and options page.
2.  **`background.js` (Service Worker)**: Handles all background processing, primarily the retroactive organization of bookmarks and communication with the Gemini API.
3.  **`popup.html`, `popup.css`, `popup.js`**: Defines the structure, style, and logic for the browser action popup. This is where users proactively save bookmarks.
4.  **`options.html`, `options.css`, `options.js`**: Provides a user interface for configuring the extension, primarily for managing the Gemini API key and toggling features.

### New User Experience (NUX)

*   **Trigger**: On first installation, or if the `nuxCompleted` flag in `chrome.storage.sync` is `false`.
*   **Process**:
    1.  The extension automatically opens the **Options Page**.
    2.  A persistent guidance panel at the top of the Options Page walks the user through the setup:
        *   **Step 1: Enter Gemini API Key.** The user is prompted to input their Google Gemini API Key.
        *   **Step 2: Fetch Available Models.** After entering the API Key, the "Fetch Available Models" button becomes active. Clicking this retrieves a list of compatible Gemini models from the API.
        *   **Step 3: Select a Model.** The user selects their preferred Gemini model from the populated dropdown list (e.g., `gemini-1.5-flash-latest`).
        *   **Step 4: Verify and Save Configuration.** The user clicks the "Verify and Save Configuration" button. This action:
            *   Saves the API key and the selected model to `chrome.storage.sync`.
            *   Performs a test call to the Gemini API to validate the key and model.
            *   If successful, marks the NUX as complete by setting `nuxCompleted` to `true`.
    3.  Sections of the Options page (like model selection) are progressively enabled as prior steps are completed.
    4.  The NUX guidance panel disappears once the configuration is successfully verified and saved.
    5.  If setup is not complete, the extension popup will display a message prompting the user to visit the Options page.
*   **NUX Bulk Reclassification Offer**:
    *   Immediately after the initial API key and model configuration is successfully saved (NUX completion), the user is presented with a one-time offer directly within the Options page.
    *   This offer is to perform a bulk analysis and reorganization of their existing bookmarks using the newly configured AI model.
    *   Users can choose to start this process or skip it.

### Retroactive Organization

The retroactive organization feature, which automatically processed newly created bookmarks, is currently under development or temporarily disabled in this version. Future updates may re-introduce this capability.

### Proactive Bookmarking

*   **Trigger**: User clicks the extension's browser action icon (popup).
*   **Process**:
    1.  The popup (`popup.js`) fetches the current active tab's URL and title.
    2.  Crucially, it also attempts to extract the main textual content (`pageContent`) from the active tab using `chrome.scripting.executeScript`. This `pageContent` is sent to the Gemini API along with the URL and title for more relevant and context-aware suggestions.
    3.  It retrieves the cached Gemini API key and selected model by sending a message to the background script (`background.js`).
    4.  A loading indicator is displayed while it calls the Gemini API (via the background script) with the tab's URL, title, and extracted `pageContent`.
    5.  **Pre-fill Fields**: The popup fields are pre-filled with Gemini's suggestions (see "Gemini API Interaction and Local Mapping" below for details on how suggestions are generated):
        *   **Alias Field**: The AI-suggested `Concise Website Title (Context Summary)`.
        *   **Folder Field**: The AI-suggested folder path, determined by `mapKeywordsToFolderPath` in `background.js`. This field is a dynamic tree-like dropdown selector populated by scanning the user's existing bookmark folder structure.
            *   If the AI-suggested path (or a prefix of it) exists, the best existing match is pre-selected.
            *   If no suitable existing folder (exact or prefix match) is found for the AI-suggested path, it is added as a special `(Create New) Path/To/Folder` option in the dropdown and pre-selected.
    6.  **User Interaction**:
        *   The user can edit the suggested alias.
        *   The user can change the target folder by selecting a different one from the dropdown.
        *   The user can create new L2 or L3 subfolders within an *already selected existing parent folder* using the "New L2/L3 Subfolder" button (or similar, exact name might vary). This respects the 3-level depth limit.
    7.  **Action**: On clicking "Save Bookmark", the extension uses `chrome.bookmarks.create()`. If the selected folder was a `(Create New) Path/To/Folder` option, the necessary folder structure is created first by the background script.
    7.  **Error Handling**: API errors, issues with page content extraction, or other problems are displayed clearly in the popup.

### Gemini API Interaction and Local Mapping

The extension interacts with the configured Google Gemini API model (e.g., `gemini-1.5-flash-latest`) to get intelligent suggestions for bookmark categorization and aliasing.

*   **Information Sent to API**:
    *   For proactive bookmarking, the extension sends the bookmark's URL, original title, and extracted `pageContent` (main textual content from the active tab).
    *   For bulk reclassification, it sends the URL and title of existing bookmarks.
*   **Expected JSON Response from Gemini API**: The prompt sent to the Gemini API instructs it to return a JSON object with the following structure:
    *   `concise_website_title`: A brief, clear title for the bookmark.
    *   `context_summary`: A 3-5 word summary of the page's main purpose or content.
    *   `category_hints`: An array of general keywords or high-level category suggestions (e.g., "Work Tool", "Tech News", "Gaming", "Shopping").
*   **Local Mapping to Folder Structure**:
    *   The `background.js` script contains a function `mapKeywordsToFolderPath`.
    *   This function takes the `category_hints` (and potentially the title and URL for more context) received from the Gemini API.
    *   It then uses a predefined `FOLDER_STRUCTURE` constant (also in `background.js`) to map these hints to a specific L1/L2/L3 folder path within the user's bookmarks. This constant defines the hierarchical organization the extension aims to achieve.
    *   This local mapping allows for consistent organization based on AI suggestions while maintaining a user-configurable folder hierarchy.
*   **Bookmark Alias Generation**: The final bookmark alias is typically formed as: `"Concise Website Title (Context Summary)"`.

### Options Page

*   Accessible via Chrome's extension management page, by right-clicking the extension icon and selecting "Options", or when prompted by the NUX/popup if setup is incomplete.
*   **NUX Guidance Panel**: Displayed at the top if initial setup (`nuxCompleted` is `false`) is not complete, guiding the user through API key and model configuration.
*   **Gemini API Key and Model Configuration**:
    *   **API Key Input**: An input field for the user to enter their Google Gemini API Key.
    *   **Fetch Available Models Button**: Becomes active after an API key is entered. Clicking this queries the Gemini API (via `background.js`) for a list of models compatible with the `generateContent` method.
    *   **Model Selection Dropdown**: Populated with the fetched models (e.g., `gemini-1.5-flash-latest`). The user selects their desired model here.
    *   **Verify and Save Configuration Button**:
        *   Saves the entered API Key and selected model to `chrome.storage.sync`.
        *   Performs a test call to the Gemini API to ensure the key and model are valid and working.
        *   If successful, sets `nuxCompleted` to `true` in `chrome.storage.sync`, hiding the NUX panel.
        *   Displays status messages for success or failure of the verification and save process.
    *   Includes a link to Google AI Studio for users to obtain an API key and a note about potential API costs.
*   **Bulk Reclassification Feature**:
    *   **Initiate Analysis Button**: Allows users to start an analysis of their existing bookmarks. The extension will process bookmarks (up to a configurable limit, e.g., 200 at a time), sending their URL and title to the Gemini API.
    *   **Progress Display**: Shows the number of bookmarks processed and any errors encountered during analysis. Detailed logs are available in the service worker console.
    *   **Analysis Report**: Once the analysis is complete, a summary report is displayed in a text area, detailing:
        *   Bookmarks processed.
        *   Proposed changes (new alias, new folder path).
        *   Any errors during analysis.
    *   **Confirm and Apply Changes Button**: After reviewing the report, the user can click this to apply the suggested changes. The extension will then:
        *   Create new folders as needed.
        *   Update bookmark titles (aliases).
        *   Move bookmarks to their new, AI-suggested locations.
    *   **Cancel Analysis Button**: Allows the user to stop an ongoing analysis.
    *   **Clean Empty Folders after Reclassification (Optional)**: After applying changes, the user may be prompted or have an option to run the "Clean Empty Folders" utility.
*   **Clean Empty Folders Utility**:
    *   **"Clean Empty Folders" Button**: When clicked, this utility (detailed in `background.js`) scans the user's bookmark tree for any folders that contain no bookmarks and no subfolders, and removes them.
    *   A status message confirms the number of empty folders deleted. This utility can also be accessed from the popup.
*   **Advanced Settings**:
    *   A **"Reset All Settings to Default"** button, which clears all stored data (API key, selected model, `nuxCompleted` flag, etc.) from `chrome.storage.sync` and `chrome.storage.local`, effectively re-initiating the NUX flow.

### Folder Structure

The extension organizes bookmarks into a hierarchy up to three levels deep (L1, L2, L3). All folder names created or matched by the extension use Title Case, with the word "and" in lowercase (e.g., "Technology and Software"). The default folder for bookmarks that cannot be confidently categorized by the AI is `Professional Sphere/Productivity Tools`.

The predefined folder structure, as defined in `background.js`, is as follows:

*   **`Professional Sphere`** (L1)
    *   `Data & Analytics Tools` (L2)
    *   `Productivity Tools` (L2)
    *   `Technical Learning & Reference` (L2)
    *   `Work Communication & Resources` (L2)
*   **`Technology & Digital Ecosystem`** (L1)
    *   `Hardware & Peripherals` (L2)
    *   `Software & Drivers` (L2)
    *   `Tech News & Communities` (L2)
    *   `Online Utilities & Services` (L2)
    *   `3D Printing & Design` (L2)
*   **`Entertainment & Hobbies`** (L1)
    *   `Gaming Hub` (L2)
    *   `Game Services & Cheats` (L2)
    *   `Media & Streaming` (L2)
    *   `Creative & Making` (L2)
    *   `Adult Content` (L2)
*   **`Personal Life & Ventures`** (L1)
    *   `Shopping - General & Tech` (L2)
    *   `Shopping - Fashion & Replicas` (L2)
    *   `Travel & Experiences` (L2)
    *   `Home, Health & Finance` (L2)
    *   `Social & Communications (Personal)` (L2)

*Level 3 folders are not predefined in the constant but can be created by the user via the popup (e.g., under `Professional Sphere/Data & Analytics Tools`, a user might create an L3 folder named `Specific Project X`).*

### Bookmark Alias Format

The extension uses the Gemini API to generate a concise title and a brief summary for each bookmark. The final bookmark alias (title) is then formatted as:

`"Concise Website Title (Context Summary)"`

*   **`Concise Website Title`**: An improved, shorter title for the webpage, suggested by the AI.
*   **`Context Summary`**: A 3-5 word summary of the page's main purpose or content, also suggested by the AI.

*Example: `Gemini API Docs (Language Model Integration)`*

## Interdependencies

*   **Chrome Extension APIs**:
    *   `chrome.bookmarks`: For creating, reading, updating, and moving bookmarks and folders.
    *   `chrome.tabs`: To get information about the currently active tab (for proactive bookmarking).
    *   `chrome.scripting`: Used by `popup.js` to execute scripts in the active tab for extracting `pageContent`.
    *   `chrome.storage`:
        *   `chrome.storage.sync`: Used to store user-specific settings that should sync across devices if Chrome sync is enabled. This includes:
            *   Gemini API key (`geminiApiKey`).
            *   Selected Gemini model (`selectedGeminiModel`).
            *   NUX completion status (`nuxCompleted`).
        *   `chrome.storage.local`: Used for caching data that doesn't need to sync or might be larger. This includes:
            *   The list of available Gemini models fetched from the API (`availableGeminiModels`).
            *   Flags related to the NUX flow state (e.g., `nuxInProgress`, `nuxApiKeyEntered`, `nuxModelsFetched` - though specific flag names might vary in `options.js`).
    *   `chrome.action`: For the browser action popup.
    *   `chrome.runtime`: For managing the extension lifecycle (e.g., `onInstalled`), inter-component communication (message passing between popup, options page, and service worker), and opening the options page.
    *   `chrome.notifications`: Used to provide users with important feedback, such as:
        *   Successful operations (e.g., "Bulk Reclassification Complete", "Empty Folders Cleaned").
        *   Error messages or warnings (e.g., "Gemini API Key Error", "Model Not Selected", "API Key test failed").
*   **Google Gemini API**:
    *   Requires a user-provided API key.
    *   The extension makes HTTPS POST requests to the `https://generativelanguage.googleapis.com/v1beta/MODELS/SELECTED_MODEL_NAME:generateContent` endpoint (for suggestions) and `https://generativelanguage.googleapis.com/v1beta/models` (to list models).
    *   Internet connectivity is required for AI features.
*   **Web Technologies**: HTML, CSS, JavaScript (ES6+).

## Installation and Setup

1.  **Obtain a Google Gemini API Key**:
    *   Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
    *   Create a new API key if you don't have one. Copy this key.
    *   Be aware of the [Gemini API pricing](https://ai.google.dev/pricing) as usage may incur costs.

2.  **Download or Clone the Extension Files**:
    *   **Clone**: `git clone https://github.com/example-user/ai-bookmark-organizer-gemini.git` (If you are cloning the main repository. If you have forked it, replace this URL with your fork's URL.)
    *   **Download ZIP**: Download the ZIP from the GitHub repository page and extract it to a local folder.

3.  **Install in Chrome**:
    *   Open Google Chrome.
    *   Navigate to `chrome://extensions`.
    *   Enable **Developer mode** using the toggle switch in the top-right corner.
    *   Click on the **"Load unpacked"** button.
    *   Select the directory where you cloned or extracted the extension files (the folder containing `manifest.json`). The extension icon should appear in the Chrome toolbar.

4.  **Configure the Extension (NUX Flow)**:
    *   Upon first installation (or if setup hasn't been completed), the **Options Page** will open automatically. You can also open it manually by right-clicking the extension icon in the Chrome toolbar and selecting **"Options"**, or by navigating to `chrome://extensions`, finding the extension, clicking **"Details"**, and then **"Extension options"**.
    *   The Options Page features a **NUX (New User Experience) guidance panel** at the top that will walk you through the initial setup:
        1.  **Step 1: Enter API Key.** Enter your Google Gemini API Key into the designated input field.
        2.  **Step 2: Fetch Available Models.** Once the API Key is entered, click the **"Fetch Available Models"** button. This will retrieve a list of compatible Gemini models that can be used by the extension.
        3.  **Step 3: Select a Model.** Choose your preferred model (e.g., `gemini-1.5-flash-latest`) from the dropdown list that is populated with the models fetched in the previous step.
        4.  **Step 4: Verify and Save Configuration.** Click the **"Verify and Save Configuration"** button. This will:
            *   Save your API Key and selected model.
            *   Perform a test call to the Gemini API to ensure the settings are correct.
            *   If successful, the NUX panel will disappear, and the core setup is complete.
        5.  **Step 5: Optional Bulk Reclassification.** After the API key and model are successfully saved, you will be presented with an option to perform an initial **Bulk Reclassification** of your existing bookmarks. This step is optional and can be skipped if you prefer to organize bookmarks individually or at a later time.
\r\n## Usage\r\n
*   **Retroactive Organization (Automatic)**:
    *   (Note: The automatic retroactive organization feature is currently under development or temporarily disabled.)
    *   Previously, this feature would automatically process newly created bookmarks. Functionality may be restored or revised in future updates.

*   **Proactive Bookmarking (Manual via Popup)**:
    *   Navigate to the webpage you want to bookmark.
    *   Click on the "AI-Powered Structured Bookmark Organizer" icon in the Chrome toolbar.
    *   The popup will appear, displaying the current page's title and URL. The extension also attempts to extract textual content from the page to enhance AI suggestions.
    *   It will then show "Getting AI suggestions..." and populate the "Bookmark Alias" and "Target Folder" fields with suggestions from the Gemini API, mapped to your folder structure.
    *   **Review/Edit**: You can edit the suggested alias. You can also change the target folder using the dropdown.
        *   If the AI suggests a new folder path, it will appear as `(Create New) Path/To/Folder` and be pre-selected. Saving will create this path.
        *   You can also create new L2 or L3 subfolders under an *existing* selected folder using the "New L2/L3 Subfolder" button.
    *   **Save**: Click "Save Bookmark". The bookmark will be saved to the chosen location with the specified alias. If the page is already bookmarked, this button will change to "Update Bookmark".
    *   A confirmation or error message will appear in the popup.

*   **Managing Options**:
    *   Access the Options page as described in the "Installation and Setup" section.
    *   Here you can manage your Gemini API Key, select your preferred Gemini Model, and initiate a "Reset All Settings to Default".
    *   The Options page is also where you access the "Bulk Reorganizing Existing Bookmarks" feature.

*   **Bulk Reorganizing Existing Bookmarks**:
    *   This feature is accessible via the **Options page**.
    *   It allows you to organize a large collection of existing bookmarks efficiently.
    *   **Process**:
        1.  The user initiates an "Analysis" from the Options page.
        2.  The extension processes your existing bookmarks (up to a specified limit per run, e.g., 200), sending their URL and title to the Gemini API.
        3.  AI-powered suggestions for new folder paths (based on your predefined structure) and improved aliases are generated.
        4.  A detailed **report of proposed changes** is presented in the Options page for your review.
        5.  After reviewing, the user can **confirm and apply** these changes. The extension will then move bookmarks, create new folders, and update aliases as per the plan.

*   **Cleaning Empty Folders**:
    *   This utility helps maintain a tidy bookmark structure by removing unused folders.
    *   It can be accessed from the **extension popup menu** or from the **Options page**.
    *   When triggered, it scans your bookmark tree for any folders that contain no bookmarks and no subfolders.
    *   Users are prompted for **confirmation before deletion** to prevent accidental removal of folders.

## File Structure

```
. (Root Directory)
├── manifest.json         // Defines the extension
├── background.js         // Service worker for background tasks (retroactive organization, API calls)
├── popup.html            // HTML structure for the browser action popup
├── popup.css             // CSS styles for the popup
├── popup.js              // JavaScript logic for the popup (proactive bookmarking, UI)
├── options.html          // HTML structure for the options page
├── options.css           // CSS styles for the options page
├── options.js            // JavaScript logic for the options page (API key, settings)
├── icons/                  // Folder for extension icons
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── gear.png        // Icon for settings/options button
└── README.md             // This file
```

## Troubleshooting

*   **General AI Suggestion Failures (e.g., in Popup or Bulk Reclassification)**:
    *   **Check API Key**: Ensure a valid Google Gemini API key is correctly entered and saved in the extension's Options page.
    *   **Check Model Selection**: Verify that you have successfully fetched the list of available Gemini models and that a compatible model (e.g., `gemini-1.5-flash-latest`) is selected and saved in the Options page.
    *   **Check Internet Connection**: AI features require an active internet connection to communicate with the Gemini API.
    *   **Content Extraction Issues**: If suggestions seem inaccurate for a particular webpage (especially during proactive bookmarking), the extension's content extraction script might have had difficulty processing that specific page's structure or the page might restrict content scripting.
    *   **Service Worker/Popup Consoles**: For more detailed error messages, check the extension's Service Worker console (Go to `chrome://extensions`, find the extension, click "Service worker") and the popup's console (Right-click the extension icon, select "Inspect popup", then check its Console tab). Look for logs prefixed with `[BACKGROUND]` or `[POPUP]`.

*   **NUX (New User Experience) Issues**:
    *   **NUX Stuck or Not Completing**: Ensure you are following the guided steps in the Options page sequentially: 1. Enter API Key, 2. Fetch Available Models, 3. Select a Model, 4. Click "Verify and Save Configuration". Successful validation of the API key and model is required for the NUX to complete.
    *   **Error during NUX Bulk Reclassification Offer**: If the optional bulk reclassification offered at the end of NUX fails, check your API key validity and internet connection. Processing many bookmarks can also take some time.

*   **Model Fetching/Selection Problems**:
    *   **Cannot Fetch Models / No Compatible Models Found**:
        *   Verify that the entered API key is correct and has the necessary permissions enabled on your Google Cloud/AI Studio account for the Gemini API.
        *   Ensure the API key is not restricted from accessing the model listing service or specific generative models.
    *   **Selected Model Not Working As Expected**: If you encounter issues with a specific Gemini model, try selecting a different compatible model from the list in the Options page.

*   **Bulk Reclassification Issues (from Options page)**:
    *   **Analysis Fails to Start or Stalls**:
        *   Confirm your API key and selected model are correctly configured and validated in the Options page.
        *   Ensure you have a stable internet connection.
        *   For very large bookmark collections, the analysis process can be lengthy. Ensure your computer does not go to sleep during this time.
    *   **Report Shows Errors for Many Bookmarks**: This could indicate an issue with the API key's quota, its ability to handle requests, or a problem with the selected Gemini model. Check the Service Worker console for specific error messages.
    *   **Changes Don't Apply Correctly**: If proposed changes from the bulk reclassification report are not applied as expected, try re-running the analysis and application process. Also, check the Service Worker console for any specific errors during the `confirmBulkReclassify` step.

*   **Folders Not Being Created as Expected**:
    *   Check the Service Worker console for errors related to `getOrCreateFolder`. This can indicate issues with bookmark permissions or unexpected responses from the Chrome Bookmarks API.

*   **"Clean Empty Folders" Not Working**:
    *   Ensure you have confirmed the action when prompted in the popup or Options page.
    *   Check for any error messages displayed in the extension's interface or in the Service Worker/Popup consoles.

## Future Enhancements (Optional)

*   User-configurable "staging/watch" folder for retroactive organization.
*   More sophisticated queueing system for retroactive organization, allowing user review before AI processing.
*   Customizable folder structure and keyword mappings via the Options page.
*   Ability to re-organize existing bookmarks.
*   Advanced alias generation preferences.
*   Support for `chrome.notifications` permission for more visible feedback.

---

This README provides a comprehensive overview of the AI-Powered Structured Bookmark Organizer.
