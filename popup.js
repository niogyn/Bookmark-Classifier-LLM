// popup.js

document.addEventListener('DOMContentLoaded', async () => {
    const pageTitleText = document.getElementById('pageTitleText');
    const pageUrlText = document.getElementById('pageUrlText');
    const suggestedAliasInput = document.getElementById('suggestedAlias');
    const folderSelect = document.getElementById('folderSelect');
    const createNewFolderBtn = document.getElementById('createNewFolderBtn');
    const newFolderInputContainer = document.getElementById('newFolderInputContainer');
    const newFolderNameInput = document.getElementById('newFolderName');
    const confirmNewFolderBtn = document.getElementById('confirmNewFolderBtn');
    const cancelNewFolderBtn = document.getElementById('cancelNewFolderBtn');
    const saveBookmarkBtn = document.getElementById('saveBookmarkBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const statusMessage = document.getElementById('statusMessage');
    const reanalyzeBtn = document.getElementById('reanalyzeBtn');
    const openOptionsPageBtn = document.getElementById('openOptionsPage'); // Standard footer options button
    const cleanEmptyFoldersBtn = document.getElementById('cleanEmptyFoldersBtn'); 
    const mainPopupForm = document.getElementById('mainPopupForm'); // New wrapper for main content

    let currentTab = null;
    let existingBookmark = null; // Added to store existing bookmark info
    let cachedConfig = null; // To store data from getPopupData

    async function sendMessageToBackground(message) {
        console.log("[POPUP] Sending message to background:", message);
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("[POPUP] Error sending message:", chrome.runtime.lastError.message, "Original message:", message);
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.error) {
                    console.error("[POPUP] Background script returned an error:", response.error, "Original message:", message);
                    reject(new Error(response.error));
                } else {
                    console.log("[POPUP] Received response from background:", response);
                    resolve(response);
                }
            });
        });
    }

    async function getPopupInitialData() {
        try {
            console.log("[POPUP] Requesting initial data from background.");
            const data = await sendMessageToBackground({ action: "getPopupData" });
            console.log("[POPUP getPopupInitialData] Data received from background:", JSON.stringify(data));

            // Ensure cachedConfig is always an object with expected keys, even if values are null/false
            if (data && typeof data.nuxCompleted === 'boolean') { // Check for at least nuxCompleted
                cachedConfig = {
                    apiKey: (typeof data.apiKey === 'string' && data.apiKey) ? data.apiKey : null,
                    selectedModel: (typeof data.selectedModel === 'string' && data.selectedModel) ? data.selectedModel : null,
                    nuxCompleted: data.nuxCompleted
                };
                console.log("[POPUP] Initial data processed and cached:", cachedConfig);
                return cachedConfig;
            }
            if (data && data.error) {
                throw new Error(`Background error on getPopupData: ${data.error}`);
            }
            
            console.warn("[POPUP] Unexpected response for getPopupData or data missing. Falling back to storage.");
            const storageData = await new Promise(resolve => 
                chrome.storage.sync.get(['geminiApiKey', 'selectedGeminiModel', 'nuxCompleted'], resolve)
            );
            cachedConfig = {
                apiKey: storageData.geminiApiKey || null,
                selectedModel: storageData.selectedGeminiModel || null,
                nuxCompleted: !!storageData.nuxCompleted
            };
            console.log("[POPUP] Fallback data from storage cached:", cachedConfig);
            return cachedConfig;
        } catch (error) {
            console.error("[POPUP] Error getting initial data:", error.message);
            showStatus(`Error contacting background: ${error.message}. Please try again.`, true);
            // Critical error, attempt to load from storage as a last resort & ensure defined structure
            const storageData = await new Promise(resolve => 
                chrome.storage.sync.get(['geminiApiKey', 'selectedGeminiModel', 'nuxCompleted'], resolve)
            );
            cachedConfig = {
                apiKey: storageData.geminiApiKey || null,
                selectedModel: storageData.selectedGeminiModel || null,
                nuxCompleted: !!storageData.nuxCompleted
            };
            console.log("[POPUP] Critical error fallback data from storage cached:", cachedConfig);
            return cachedConfig; 
        }
    }

    async function getSuggestionsFromBackground(title, url, pageContent = '') { // Added pageContent parameter
        showLoadingSuggestions(true);
        if (!cachedConfig || !cachedConfig.apiKey) {
            showStatus("API Key not available. Please configure in options.", true);
            showLoadingSuggestions(false);
            saveBookmarkBtn.disabled = true;
            return;
        }
        try {
            const suggestions = await sendMessageToBackground({
                action: "getGeminiSuggestions",
                title: title,
                url: url,
                pageContent: pageContent, // Pass page content to background
                apiKey: cachedConfig.apiKey // Use cached API key
            });
            
            console.log("[POPUP] Raw suggestions object received in getSuggestionsFromBackground:", JSON.stringify(suggestions, null, 2));

            let suggestionsValid = false;
            if (suggestions) {
                const path = suggestions.suggested_folder_path;
                const conciseTitle = suggestions.concise_website_title;
                const summary = suggestions.context_summary;

                if (path && typeof path === 'string' && path.trim() !== '' &&
                    conciseTitle && typeof conciseTitle === 'string' && conciseTitle.trim() !== '' &&
                    summary && typeof summary === 'string' && summary.trim() !== '') {
                    suggestionsValid = true;
                } else {
                    console.log("[POPUP] Detailed validation of suggestions FAILED in popup.");
                }
            }

            if (suggestionsValid) {
                console.log("[POPUP] Suggestions deemed VALID by popup. Updating fields.");
                const newAlias = `${suggestions.concise_website_title} (${suggestions.context_summary})`;
                suggestedAliasInput.value = newAlias;
                await populateFolderSelector(suggestions.suggested_folder_path, true);
                showStatus("AI suggestions loaded!", false, true);
                saveBookmarkBtn.disabled = false;
            } else {
                console.log("[POPUP] Suggestions deemed INVALID or incomplete. Using fallback.");
                showStatus("AI suggestions failed. Using fallback.", true, false);
                if (currentTab) {
                    suggestedAliasInput.value = generateFallbackAlias(currentTab.title, currentTab.url);
                } else {
                    suggestedAliasInput.value = generateFallbackAlias("Page", "");
                }
                await populateFolderSelector(getDefaultFolderPathFallback());
                saveBookmarkBtn.disabled = false;
            }
        } catch (error) {
            console.error("[POPUP getSuggestionsFromBackground CATCH BLOCK] Error:", error.message, error.stack);
            showStatus(`Error fetching AI suggestions: ${error.message}`, true);
            if (currentTab) {
                suggestedAliasInput.value = generateFallbackAlias(currentTab.title, currentTab.url);
            } else {
                suggestedAliasInput.value = generateFallbackAlias("Page", "");
            }
            await populateFolderSelector(getDefaultFolderPathFallback());
            saveBookmarkBtn.disabled = false;
        } finally {
            showLoadingSuggestions(false);
        }
    }
    
    async function getOrCreateFolderFromBackground(path) { // apiKey is implicitly handled by background using its cache or passed if necessary
        try {
            const responseFromBackground = await sendMessageToBackground({
                action: "getOrCreateFolder",
                path: path
                // apiKey: cachedConfig.apiKey // Not strictly needed if background uses its own cache primarily
            });

            // Check if the response is a direct ID (number or string representing a number)
            if (typeof responseFromBackground === 'number' || 
                (typeof responseFromBackground === 'string' && !isNaN(parseInt(responseFromBackground)))) {
                console.log(`[POPUP] Background script returned direct ID for folder ('${path}'): ${responseFromBackground}`);
                return { id: responseFromBackground.toString(), fullPath: path }; // Convert ID to string for consistency
            } 
            // Existing check for object response with an id property
            else if (responseFromBackground && responseFromBackground.id) {
                return { id: responseFromBackground.id, fullPath: responseFromBackground.fullPath || path };
            } 
            // Existing check for object response with an error property
            else if (responseFromBackground && responseFromBackground.error) {
                console.error(`[POPUP] Background script reported error for folder creation ('${path}'): ${responseFromBackground.error}`);
                throw new Error(responseFromBackground.error);
            } 
            // Fallback for other unexpected responses
            else {
                console.error(`[POPUP] Unexpected response from background script for folder action ('${path}'):`, responseFromBackground);
                throw new Error("Background script returned an unexpected response for folder creation.");
            }
        } catch (error) { // Catches rejections from sendMessageToBackground OR errors thrown above
            const errorMessage = error.message || "Unknown error during folder operation.";
            console.error(`[POPUP getOrCreateFolderFromBackground CATCH BLOCK] Path: '${path}', Error: ${errorMessage}`);
            throw new Error(`Folder operation for "${path}" failed: ${errorMessage}`);
        }
    }

    async function toTitleCaseFromBackground(text) {
        try {
            const response = await sendMessageToBackground({ action: "toTitleCase", text: text });
            return response.titleCasedText; // Assuming background sends { titleCasedText: '...' }
        } catch (error) {
            console.warn("toTitleCaseFromBackground via message failed, using fallback:", error.message);
            return text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        }
    }

    async function checkNuxAndInitialize() {
        const isApiKeyMissing = !cachedConfig || !cachedConfig.apiKey || cachedConfig.apiKey.trim() === '';
        const isModelMissing = !cachedConfig || !cachedConfig.selectedModel || cachedConfig.selectedModel.trim() === '';
        const isNuxNotCompleted = !cachedConfig || !cachedConfig.nuxCompleted;

        // Update the standard footer options button based on NUX state
        if (openOptionsPageBtn) {
            if (isNuxNotCompleted) {
                openOptionsPageBtn.innerHTML = '<img src="icons/gear.png" alt="Settings"> Continue Setup'; // Change text
                openOptionsPageBtn.title = "Continue Setup";
            } else {
                openOptionsPageBtn.innerHTML = '<img src="icons/gear.png" alt="Settings">'; // Restore icon only
                openOptionsPageBtn.title = "Open Settings";
            }
        }

        if (isApiKeyMissing || isModelMissing || isNuxNotCompleted) {
            let message = "Extension setup needed. Please complete it in the Options page.";
            if (isApiKeyMissing) {
                message = "API Key not set. Please set it in Options.";
            } else if (isModelMissing) {
                message = "Gemini Model not selected. Please set it in Options.";
            } else { // NUX not marked complete, but key/model might be there
                message = "Setup not fully marked as complete. Please visit Options to finalize.";
            }
            
            // Hide main form content and footer options button
            if (mainPopupForm) mainPopupForm.style.display = 'none';
            if (openOptionsPageBtn && openOptionsPageBtn.parentElement.classList.contains('footer-buttons')) {
                 openOptionsPageBtn.parentElement.style.display = 'none'; // Hide the whole footer button group
            }
            if (cleanEmptyFoldersBtn && cleanEmptyFoldersBtn.parentElement.classList.contains('footer-buttons')){
                cleanEmptyFoldersBtn.parentElement.style.display = 'none';
            }

            statusMessage.innerHTML = ''; // Clear previous messages
            const messageP = document.createElement('p');
            messageP.textContent = message;
            statusMessage.appendChild(messageP);

            const optionsButton = document.createElement('button');
            optionsButton.textContent = "Continue Setup"; // MODIFIED TEXT
            optionsButton.id = "nuxOpenOptionsBtnPopup"; 
            optionsButton.classList.add("btn-primary-nux"); 
            optionsButton.onclick = (e) => { 
                e.preventDefault(); 
                chrome.runtime.openOptionsPage(); 
                window.close(); 
            };
            statusMessage.appendChild(optionsButton);
            statusMessage.className = 'status error'; 
            statusMessage.style.textAlign = 'center';
            statusMessage.style.display = 'block'; // Ensure status message area is visible
            statusMessage.style.opacity = '1'; // Ensure opacity is 1 for NUX messages

            return false; // Indicate setup is not complete
        }

        // If NUX is complete, ensure main form and footer options are visible
        if (mainPopupForm) mainPopupForm.style.display = 'block'; // Or 'flex' if it's a flex container
        if (openOptionsPageBtn && openOptionsPageBtn.parentElement.classList.contains('footer-buttons')) {
            openOptionsPageBtn.parentElement.style.display = 'flex'; // Restore footer button group
        }
         if (cleanEmptyFoldersBtn && cleanEmptyFoldersBtn.parentElement.classList.contains('footer-buttons')){
            cleanEmptyFoldersBtn.parentElement.style.display = 'flex';
        }
        // Only hide statusMessage if it's not actively showing an error/success from another operation
        if (statusMessage.textContent === "" || statusMessage.classList.contains('info')) { // Check if it was just an info message or empty
            statusMessage.style.display = 'none'; 
        }

        return true;
    }

    // --- Populate Popup with Current Tab Info & AI Suggestions ---
    try {
        // Fetch initial data (API key, model, NUX status) from background first
        await getPopupInitialData(); 
        console.log("[POPUP] cachedConfig before checkNuxAndInitialize:", JSON.stringify(cachedConfig));

        const setupComplete = await checkNuxAndInitialize(); // Uses cachedConfig
        if (!setupComplete) {
            // Stop further execution if setup is not complete
            pageTitleText.textContent = "Setup Required";
            pageUrlText.textContent = "Please visit options.";
            return; 
        }

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
            currentTab = tabs[0];
            pageTitleText.textContent = currentTab.title || '(No Title)';
            pageUrlText.textContent = currentTab.url || '(No URL)';

            if (!currentTab.url || currentTab.url.startsWith('chrome://')) {
                showStatus("Cannot bookmark internal Chrome pages.", true);
                saveBookmarkBtn.disabled = true;
                reanalyzeBtn.disabled = true;
                return;
            }

            // Search for existing bookmark using a background helper
            const bookmarkDetails = await sendMessageToBackground({ action: "getBookmarkDetails", url: currentTab.url });

            if (bookmarkDetails && bookmarkDetails.id) {
                existingBookmark = bookmarkDetails; // Contains id, title, parentId, and fullPath
                console.log("[POPUP] Existing bookmark details from background:", existingBookmark);

                suggestedAliasInput.value = existingBookmark.title;
                
                if (existingBookmark.fullPath) {
                    console.log("[POPUP] Existing bookmark folder path from background:", existingBookmark.fullPath);
                    await populateFolderSelector(existingBookmark.fullPath);
                } else {
                     // Fallback if background couldn't determine path (should be rare)
                    console.warn("[POPUP] fullPath not provided by background for existing bookmark. Falling back.");
                    await populateFolderSelector(getDefaultFolderPathFallback());
                }

                saveBookmarkBtn.textContent = "Update Bookmark";
                saveBookmarkBtn.disabled = false;
                reanalyzeBtn.style.display = 'inline-block';
                reanalyzeBtn.disabled = false;
                showStatus("This page is already bookmarked. You can update it or re-analyze.", false, false);
            } else {
                existingBookmark = null;
                reanalyzeBtn.style.display = 'none';
                saveBookmarkBtn.textContent = "Save Bookmark";

                // API key and model are already checked by checkNuxAndInitialize using cachedConfig
                // No existing bookmark, proceed with AI suggestions
                let pageContent = '';
                const nonHtmlExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.xml', '.zip', '.mp3', '.mp4'];
                let urlPath = '';
                try { urlPath = new URL(currentTab.url).pathname.toLowerCase(); } catch(e) { /* ignore invalid URL for this check */ }

                if (nonHtmlExtensions.some(ext => urlPath.endsWith(ext))) {
                    console.warn("[POPUP] Skipping content extraction for non-HTML URL:", currentTab.url);
                    pageContent = ''; // Explicitly set to empty
                } else if (currentTab.id) {
                    try {
                        const injectionResults = await chrome.scripting.executeScript({
                            target: { tabId: currentTab.id },
                            func: extractorFunction // Use the defined function
                        });

                        if (injectionResults && injectionResults.length > 0) {
                            if (injectionResults[0].error) {
                                pageContent = '';
                                console.warn("[POPUP] Content script execution error:", injectionResults[0].error.message);
                            } else if (injectionResults[0].result) {
                                pageContent = injectionResults[0].result;
                                if (pageContent.startsWith("Error in content script:")) {
                                    console.warn("[POPUP] Content script ran but reported an internal error:", pageContent);
                                    pageContent = ''; // Don't send this error message as content
                                } else {
                                    console.log("[POPUP] Extracted page content. Length:", pageContent.length, "First 100 chars:", pageContent.substring(0, 100));
                                }
                            } else {
                                pageContent = '';
                                console.warn("[POPUP] Could not extract page content or result was null/undefined.");
                            }
                        } else {
                            pageContent = '';
                            console.warn("[POPUP] No injection results returned from executeScript.");
                        }
                    } catch (err) {
                        console.error("[POPUP] Error during chrome.scripting.executeScript call:", err);
                        pageContent = ''; // Proceed without page content if call itself fails
                    }
                }

                await getSuggestionsFromBackground(currentTab.title, currentTab.url, pageContent);
            }
        } else {
            showStatus("Error: Could not get current tab info.", true, false);
            saveBookmarkBtn.disabled = true;
            reanalyzeBtn.disabled = true;
        }
    } catch (error) {
        console.error("[POPUP DOMContentLoaded CATCH BLOCK] Error initializing popup:", error.message, error.stack);
        showStatus(`Error: ${error.message}`, true);
        suggestedAliasInput.value = generateFallbackAlias(currentTab?.title, currentTab?.url);
        await populateFolderSelector(getDefaultFolderPathFallback());
        showLoadingSuggestions(false); // Ensure UI is re-enabled
    }

    function showLoadingSuggestions(isLoading) {
        if (isLoading) {
            statusMessage.textContent = "Getting AI suggestions...";
            statusMessage.className = "status info";
            statusMessage.style.opacity = '1';
            // createNewFolderBtn removed from this list
            [suggestedAliasInput, folderSelect, saveBookmarkBtn, reanalyzeBtn].forEach(el => el.disabled = true);
        } else {
            // Don't clear statusMessage here; let success/failure handlers do it.
            // createNewFolderBtn removed from this list
            [suggestedAliasInput, folderSelect].forEach(el => el.disabled = false);
            // saveBookmarkBtn and reanalyzeBtn enabled by specific logic paths
        }
    }

    // --- Folder Management ---
    async function populateFolderSelector(preferredPathToSelect, isAiSuggestion = false) {
        folderSelect.innerHTML = '<option value="">Loading folders...</option>';
        console.log(`[POPUP populateFolderSelector] Received preferredPathToSelect: "${preferredPathToSelect}", isAiSuggestion: ${isAiSuggestion}`);
        try {
            const bookmarkTreeNodes = await chrome.bookmarks.getTree();
            const options = [];
            const predefinedL1Folders = ["Productivity Hub", "Digital Resources", "Personal Sphere", "System and Archive"];

            function processNode(node, depth, path) { // path is the full path of the current node
                if (!node.url && node.title) { 
                    if (depth <= 3) {
                        const isPredefinedRootOrChild = predefinedL1Folders.some(pL1 => 
                            path.toLowerCase().startsWith(pL1.toLowerCase())
                        );
                        if (node.id !== '0' && (isPredefinedRootOrChild || depth === 1 || node.id === '1' || node.id === '2')) {
                             options.push({ 
                                id: node.id, 
                                title: `${depth > 1 ? '--'.repeat(depth -1) + ' ' : ''}${node.title}`.trim(), 
                                fullPath: path, // Use the constructed path
                                depth: depth
                            });
                        }
                    }
                    if (node.children && depth < 3) {
                        node.children.forEach(child => processNode(child, depth + 1, `${path}/${child.title}`));
                    }
                }
            }
            
            // Process children of the main root (tree[0])
            if (bookmarkTreeNodes.length > 0 && bookmarkTreeNodes[0].children) {
                bookmarkTreeNodes[0].children.forEach(childNode => {
                    // These are typically "Bookmarks Bar" (id '1'), "Other Bookmarks" (id '2'), "Mobile Bookmarks" (id '3')
                    if (childNode.id === '1' || childNode.id === '2') { // Common roots for user bookmarks
                        if (childNode.title && childNode.children) { // Make sure title exists (e.g. "Bookmarks Bar")
                            childNode.children.forEach(l1Node => processNode(l1Node, 1, `${childNode.title}/${l1Node.title}`));
                        } else if (childNode.children) { // If root like "Bookmarks Bar" has no title itself in tree node (rare)
                             childNode.children.forEach(l1Node => processNode(l1Node, 1, l1Node.title)); // Start path with L1 title
                        }
                    } else if (!childNode.url && childNode.title) { // Other top-level folders created by user
                        processNode(childNode, 1, childNode.title);
                    }
                });
            }

            folderSelect.innerHTML = ''; // Clear loading
            if (options.length === 0) {
                // Add default L1 options if no folders exist, allowing creation within them
                predefinedL1Folders.forEach(l1 => {
                    const optionEl = document.createElement('option');
                    optionEl.value = `CREATE_NEW_L1_${l1.replace(/\s+/g, '')}`;
                    optionEl.textContent = `${l1} (Create New)`;
                    optionEl.dataset.fullPath = l1;
                    optionEl.dataset.depth = '1';
                    folderSelect.appendChild(optionEl);
                });
                 folderSelect.innerHTML += '<option value="">Or select an existing folder...</option>'; // Separator
            } 
            
            const uniqueOptions = [];
            const seenPaths = new Set();
            options.sort((a,b) => a.fullPath.localeCompare(b.fullPath));
            options.forEach(opt => {
                if (!seenPaths.has(opt.fullPath)) {
                    uniqueOptions.push(opt);
                    seenPaths.add(opt.fullPath);
                }
            });
            // Log all unique options with their full paths for debugging
            console.log("[POPUP populateFolderSelector] Unique folder options generated:", 
                uniqueOptions.map(opt => ({ id: opt.id, title: opt.title, fullPath: opt.fullPath })) // Corrected: Use opt.fullPath directly
            );

            uniqueOptions.forEach(opt => {
                const optionEl = document.createElement('option');
                optionEl.value = opt.id;
                optionEl.textContent = opt.title;
                optionEl.dataset.fullPath = opt.fullPath;
                optionEl.dataset.depth = opt.depth.toString(); // Ensure dataset.depth is a string
                folderSelect.appendChild(optionEl);
            });

            let suitableExistingOptionSelected = false; // New flag
            if (preferredPathToSelect) {
                let bestMatchOpt = null;
                let highestMatchScore = -1;

                for (let i = 0; i < folderSelect.options.length; i++) {
                    const opt = folderSelect.options[i];
                    const optFullPath = opt.dataset.fullPath;
                    if (optFullPath && optFullPath.toLowerCase() === preferredPathToSelect.toLowerCase()) {
                        bestMatchOpt = opt;
                        break; 
                    }
                    // Partial match logic (e.g., AI suggests L1/L2/L3, user has L1 or L1/L2)
                    if (optFullPath && preferredPathToSelect.toLowerCase().startsWith(optFullPath.toLowerCase())) {
                        if (optFullPath.length > highestMatchScore) {
                            highestMatchScore = optFullPath.length;
                            bestMatchOpt = opt;
                        }
                    }
                }
                if (bestMatchOpt) {
                    folderSelect.value = bestMatchOpt.value;
                    suitableExistingOptionSelected = true; // A suitable existing option was found and selected
                    console.log(`[POPUP populateFolderSelector] Matched and selected existing option: ID=${bestMatchOpt.value}, Path="${bestMatchOpt.dataset.fullPath}" for preferred path "${preferredPathToSelect}"`);
                } else {
                    console.log(`[POPUP populateFolderSelector] No existing exact or partial prefix match found for preferred path "${preferredPathToSelect}".`);
                }
            }

            // If it's an AI suggestion, a preferred path was given, AND no suitable existing option was selected, then add "create new"
            if (isAiSuggestion && preferredPathToSelect && !suitableExistingOptionSelected) {
                console.log(`[POPUP populateFolderSelector] AI suggested path "${preferredPathToSelect}" has no suitable existing match. Adding as a new option.`);
                const newPathOption = document.createElement('option');
                newPathOption.value = `CREATE_THIS_PATH:${preferredPathToSelect}`; // Special value to indicate creation
                newPathOption.textContent = `(Create New) ${preferredPathToSelect}`;
                newPathOption.dataset.fullPath = preferredPathToSelect; // Store the path for creation
                newPathOption.dataset.depth = preferredPathToSelect.split('/').length.toString(); // Ensure dataset.depth is a string
                
                console.log(`[POPUP populateFolderSelector] Created newPathOption.value: "${newPathOption.value}"`);

                if (folderSelect.firstChild) {
                    folderSelect.insertBefore(newPathOption, folderSelect.firstChild);
                } else {
                    folderSelect.appendChild(newPathOption);
                }
                // folderSelect.value = newPathOption.value; // Try setting .selected instead
                newPathOption.selected = true; // Explicitly mark the new option as selected
                console.log(`[POPUP populateFolderSelector] folderSelect.value after setting newPathOption.selected=true: "${folderSelect.value}"`);
                console.log(`[POPUP populateFolderSelector] Added and selected new path option: "${newPathOption.textContent}"`);
            }

            if (!folderSelect.value && folderSelect.options.length > 0) {
                const inboxUnsortedOption = Array.from(folderSelect.options).find(opt => opt.dataset.fullPath && opt.dataset.fullPath.toLowerCase().includes("inbox unsorted"));
                if (inboxUnsortedOption) {
                    folderSelect.value = inboxUnsortedOption.value;
                    console.log("[POPUP populateFolderSelector] Defaulted to Inbox Unsorted.");
                } else if (folderSelect.options[0] && folderSelect.options[0].value !== "") {
                    folderSelect.selectedIndex = 0;
                    console.log("[POPUP populateFolderSelector] Defaulted to first option in list.");
                }
            }
            console.log(`[POPUP populateFolderSelector] Final folderSelect.value: "${folderSelect.value}"`);

        } catch (error) {
            console.error("[POPUP populateFolderSelector CATCH BLOCK] Error:", error.message, error.stack);
            folderSelect.innerHTML = '<option value="">Error loading folders</option>';
            showStatus("Error loading bookmark folders.", true);
        }
    }

    createNewFolderBtn.addEventListener('click', () => {
        newFolderInputContainer.style.display = 'block';
        newFolderNameInput.focus();
    });

    cancelNewFolderBtn.addEventListener('click', () => {
        newFolderInputContainer.style.display = 'none';
        newFolderNameInput.value = '';
    });

    confirmNewFolderBtn.addEventListener('click', async () => {
        const newName = newFolderNameInput.value.trim();
        if (!newName) {
            showStatus("New folder name cannot be empty.", true);
            return;
        }
        const selectedParentOption = folderSelect.options[folderSelect.selectedIndex];
        if (!selectedParentOption || !selectedParentOption.value) {
            showStatus("Please select a parent folder first.", true);
            return;
        }

        let parentId = selectedParentOption.value;
        let parentPath = selectedParentOption.dataset.fullPath;

        if (parentId.startsWith('CREATE_THIS_PATH:') || parentId.startsWith('CREATE_NEW_L1_')) {
            showStatus("Cannot create a subfolder within a path that is not yet created. Save the bookmark to create the path first.", true);
            return;
        }
        
        // Ensure parent is not beyond L2 if we are creating an L3. Max depth is 3.
        const parentDepth = parseInt(selectedParentOption.dataset.depth || "0", 10);
        if (parentDepth >= 3) {
            showStatus("Subfolders can only be created up to L3.", true);
            return;
        }


        showStatus(`Creating folder "${newName}"...`, false);
        try {
            // const apiKey = await getApiKeyFromBackground(); // Old call - API key not directly needed for this message
            // Background script will use its cached API key if needed for logging within getOrCreateFolder
            const newFolder = await getOrCreateFolderFromBackground(`${parentPath}/${newName}`);

            if (newFolder && newFolder.id) {
                showStatus(`Folder "${newName}" created successfully.`, false, true);
                newFolderInputContainer.style.display = 'none';
                newFolderNameInput.value = '';
                // Repopulate and select the new folder
                await populateFolderSelector(`${parentPath}/${newName}`);
            } else {
                throw new Error(newFolder?.error || "Failed to create folder.");
            }
        } catch (error) {
            console.error("Error creating new folder:", error);
            showStatus(`Error creating folder: ${error.message}`, true);
        }
    });

    // --- Actions ---
    saveBookmarkBtn.addEventListener('click', async () => {
        if (!currentTab || !currentTab.url || !currentTab.title) {
            showStatus("Error: No active tab information available.", true); return;
        }
        if (currentTab.url.startsWith('chrome://')) {
            showStatus("Cannot bookmark internal Chrome pages.", true); return;
        }
        const alias = suggestedAliasInput.value.trim();
        if (!alias) {
            showStatus("Bookmark alias cannot be empty.", true); suggestedAliasInput.focus(); return;
        }
        const selectedOption = folderSelect.options[folderSelect.selectedIndex];
        if (!selectedOption || !selectedOption.value) {
            showStatus("Please select or create a target folder.", true); folderSelect.focus(); return;
        }

        let targetFolderId = selectedOption.value;
        let targetFolderPath = selectedOption.dataset.fullPath;

        saveBookmarkBtn.disabled = true;
        showStatus(`Saving bookmark to ${targetFolderPath}...`, false);

        try {
            // const apiKey = await getApiKeyFromBackground(); // Old call - replaced by cachedConfig
            if (!cachedConfig || !cachedConfig.apiKey) {
                showStatus("API Key not found. Please configure in options.", true);
                saveBookmarkBtn.disabled = false;
                return;
            }
            const apiKey = cachedConfig.apiKey; // Use cached API key

            if (targetFolderId.startsWith('CREATE_THIS_PATH:')) {
                const pathToCreate = targetFolderId.substring('CREATE_THIS_PATH:'.length);
                console.log(`[POPUP SaveButton] Attempting to create/get folder: "${pathToCreate}"`);
                // Pass apiKey if background's getOrCreateFolder expects it for logging, though background should use its own cache primarily
                const folderCreationResponse = await getOrCreateFolderFromBackground(pathToCreate);
                targetFolderId = folderCreationResponse.id;
                targetFolderPath = folderCreationResponse.fullPath; // Use fullPath from response
                console.log(`[POPUP SaveButton] Successfully got folder: ID=${targetFolderId}, Path="${targetFolderPath}"`);
            } else if (targetFolderId.startsWith('CREATE_NEW_L1_')) {
                 const l1Name = selectedOption.dataset.fullPath;
                 console.log(`[POPUP SaveButton] Attempting to create/get L1 folder: "${l1Name}"`);
                 const folderCreationResponse = await getOrCreateFolderFromBackground(l1Name);
                 targetFolderId = folderCreationResponse.id;
                 targetFolderPath = folderCreationResponse.fullPath; // Use fullPath from response
                 console.log(`[POPUP SaveButton] Successfully got L1 folder: ID=${targetFolderId}, Path="${targetFolderPath}"`);
            }

            if (existingBookmark) {
                try {
                    await chrome.bookmarks.remove(existingBookmark.id);
                } catch (removeError) {
                    console.error("[POPUP] Error deleting existing bookmark:", removeError);
                    showStatus(`Error updating bookmark (delete step): ${removeError.message}`, true);
                    saveBookmarkBtn.disabled = false; return;
                }
            }

            const newBookmark = await chrome.bookmarks.create({
                parentId: targetFolderId,
                title: alias,
                url: currentTab.url
            });
            
            showStatus(`Bookmark ${existingBookmark ? 'updated' : 'saved'} in "${targetFolderPath || 'Selected Folder'}"!`, false, true);
            
            existingBookmark = newBookmark; 
            saveBookmarkBtn.textContent = "Update Bookmark";
            reanalyzeBtn.style.display = 'inline-block';
            reanalyzeBtn.disabled = false;
            // setTimeout(() => window.close(), 2000);
        } catch (error) {
            console.error("[POPUP SaveButton CATCH BLOCK] Error saving bookmark:", error.message, error.stack);
            // error.message should now be cleaner, e.g., "Folder operation for \"path/to/folder\" failed: Specific background error"
            showStatus(`Error saving bookmark: ${error.message}`, true);
        } finally {
            saveBookmarkBtn.disabled = false;
        }
    });

    cancelBtn.addEventListener('click', () => {
        window.close();
    });

    reanalyzeBtn.addEventListener('click', async () => {
        if (!currentTab) {
            showStatus("Cannot re-analyze without current tab information.", true); return;
        }
        // const apiKey = await getApiKeyFromBackground(); // Old call - replaced by cachedConfig
        if (!cachedConfig || !cachedConfig.apiKey) {
            showStatus("Gemini API Key not set. Please set it in options.", true); return;
        }
        // No need to change existingBookmark status here, we are just re-fetching suggestions
        let pageContent = '';
        const nonHtmlExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.xml', '.zip', '.mp3', '.mp4'];
        let urlPath = '';
        try { urlPath = new URL(currentTab.url).pathname.toLowerCase(); } catch(e) { /* ignore */ }

        if (nonHtmlExtensions.some(ext => urlPath.endsWith(ext))) {
            console.warn("[POPUP] Skipping content extraction for re-analysis due to non-HTML URL:", currentTab.url);
            pageContent = '';
        } else if (currentTab.id) {
            try {
                const injectionResults = await chrome.scripting.executeScript({
                    target: { tabId: currentTab.id },
                    func: extractorFunction // Use the defined function
                });
                if (injectionResults && injectionResults.length > 0) {
                    if (injectionResults[0].error) {
                        pageContent = '';
                        console.warn("[POPUP] Re-analysis: Content script execution error:", injectionResults[0].error.message);
                    } else if (injectionResults[0].result) {
                        pageContent = injectionResults[0].result;
                        if (pageContent.startsWith("Error in content script:")) {
                            console.warn("[POPUP] Re-analysis: Content script ran but reported an internal error:", pageContent);
                            pageContent = '';
                        } else {
                            console.log("[POPUP] Extracted page content for re-analysis. Length:", pageContent.length, "First 100 chars:", pageContent.substring(0, 100));
                        }
                    } else {
                        pageContent = '';
                        console.warn("[POPUP] Re-analysis: Could not extract page content or result was null/undefined.");
                    }
                } else {
                    pageContent = '';
                    console.warn("[POPUP] Re-analysis: No injection results returned from executeScript.");
                }
            } catch (err) {
                console.error("[POPUP] Error extracting content for re-analysis during executeScript call:", err);
                pageContent = '';
            }
        }
        await getSuggestionsFromBackground(currentTab.title, currentTab.url, pageContent);
        // saveBookmarkBtn text should remain "Update Bookmark"
    });
    
    openOptionsPageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
        window.close(); // Optionally close the popup
    });

    if (cleanEmptyFoldersBtn) {
        cleanEmptyFoldersBtn.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to scan for and delete all empty bookmark folders? This action cannot be undone.")) {
                return;
            }
            showStatus("Cleaning empty folders...", false);
            cleanEmptyFoldersBtn.disabled = true;
            try {
                const response = await sendMessageToBackground({ action: "cleanEmptyFolders" });
                if (response.error) {
                    showStatus(`Error: ${response.error}`, true);
                } else {
                    showStatus(response.message || "Cleanup process initiated.", false, true);
                }
            } catch (error) {
                showStatus(`Error initiating cleanup: ${error.message}`, true);
            } finally {
                cleanEmptyFoldersBtn.disabled = false;
            }
        });
    }
    
    // Helper to get default folder path if AI fails or for initial non-AI load
    function getDefaultFolderPathFallback() {
        // Attempt to get this from storage or a constant
        // For now, a simple default. This should align with your folder structure logic.
        return "Bookmarks Bar/Other"; 
    }
    
    // Helper to generate a fallback alias if AI fails
    function generateFallbackAlias(title, url) {
        let alias = title ? title.substring(0, 100) : "Untitled Page"; // Limit length
        if (url) {
            try {
                const urlObj = new URL(url);
                alias = `${alias} (${urlObj.hostname})`;
            } catch (e) {
                // Invalid URL, do nothing extra
            }
        }
        return alias;
    }

    // Helper to show status messages
    function showStatus(message, isError = false, autoFade = false) {
        statusMessage.innerHTML = ''; // Clear previous content (like old buttons or links)
        const messageP = document.createElement('p');
        messageP.textContent = message;
        statusMessage.appendChild(messageP);
        
        statusMessage.className = isError ? 'status error' : 'status success'; // Set class first
        if (!isError && !message) { // If no message and not an error, treat as info to be potentially hidden
            statusMessage.className = 'status info';
        }
        statusMessage.style.textAlign = 'center'; // Ensure text is centered
        statusMessage.style.opacity = '1'; // Make sure it's visible
        statusMessage.style.display = 'block'; // Make sure the container is visible

        if (autoFade) {
            setTimeout(() => {
                statusMessage.style.opacity = '0';
            }, 3000); // Fade out after 3 seconds
        }
    }
    console.log("[POPUP] Event listeners attached and popup script initialized.");
});

const extractorFunction = () => {
    let text = '';
    try {
        const main = document.querySelector('main');
        const article = document.querySelector('article');
        const body = document.body; // Assuming body always exists

        if (main && main.innerText) {
            text = main.innerText;
        } else if (article && article.innerText) {
            text = article.innerText;
        } else if (body && body.innerText) {
            text = body.innerText;
        } else if (body && body.textContent) { // Fallback to body.textContent
             text = body.textContent;
        }
        // Ensure text is a string before trim() and substring()
        return (String(text || '')).trim().substring(0, 4000);
    } catch (e) {
        // This catch is for errors *within* the content script execution
        return `Error in content script: ${e.message}`.substring(0, 200);
    }
};

// Ensure all functions are defined before they are called, especially helpers.
// Consider moving helper functions (getDefaultFolderPathFallback, generateFallbackAlias, showStatus)
// to the top of the script or outside the DOMContentLoaded if they don't depend on DOM elements directly
// (though showStatus does).
